import { tokenValid } from "../utils.mjs";
// 兑换码系统 — 存储在 RoomRegistry 中
// 数据结构: Map<code, { points, createdBy, createdAt, usedBy, usedAt }>
// code 自动转为大写

import { saveRedeemCodes } from "./persistence.mjs";

function toBigInt(val) {
  if (val == null) return 0n;
  try {
    let s = String(val).trim().toLowerCase();
    if (s.includes('e')) {
      let [base, exp] = s.split('e');
      let e = parseInt(exp, 10);
      if (e < 0) return 0n;
      let dot = base.indexOf('.');
      if (dot === -1) {
        s = base + '0'.repeat(e);
      } else {
        let digits = base.replace('.', '');
        let fracLen = base.length - 1 - dot;
        let zeros = e - fracLen;
        s = digits + (zeros > 0 ? '0'.repeat(zeros) : '');
      }
    }
    return BigInt(s);
  } catch { return 0n; }
}

function generateCode(prefix) {
  let chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = new Uint8Array(8);
  crypto.getRandomValues(random);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[random[i] % chars.length];
  }
  return prefix ? prefix + "-" + code : code;
}

export async function handleRedeem(reg, request, url) {
  let path = url.pathname;

  // 用户兑换
  if (path === "/redeem/redeem" && request.method === "POST") {
    try {
      let body = await request.json();
      let code = (body.code || "").trim().toUpperCase();
      let user = (body.user || "").trim();
      if (!code) return new Response(JSON.stringify({error: "请输入兑换码"}), {status: 400});
      if (!user) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      // 🔒 安全修复：registry 层校验 token，确保 user 与 token 匹配
      let regUser = reg.registeredUsers.get(user);
      if (!tokenValid(regUser, body.token || "")) {
        return new Response(JSON.stringify({error: "身份验证失败"}), {status: 403});
      }

      let info = reg.redeemCodes.get(code);
      if (!info) return new Response(JSON.stringify({error: "兑换码不存在"}), {status: 400});
      if (info.usedBy) return new Response(JSON.stringify({error: "兑换码已被使用"}), {status: 400});

      // 加积分
      let current = toBigInt(reg.userPoints.get(user));
      let pts = toBigInt(info.points);
      let result = current + pts;
      reg.userPoints.set(user, String(result));

      // 标记已用
      info.usedBy = user;
      info.usedAt = Date.now();
      reg.redeemCodes.set(code, info);

      await Promise.all([saveRedeemCodes(reg.storage, reg.redeemCodes), reg.savePoints()]);
      await reg.addLedger(user, pts, "redeem", "兑换码兑换");

      return new Response(JSON.stringify({
        ok: true,
        points: String(pts),
        total: String(result),
        message: "兑换成功！获得 " + pts + " 积分"
      }), {headers: {"Content-Type": "application/json"}});
    } catch (e) {
      return new Response(JSON.stringify({error: e.message}), {status: 500});
    }
  }

  // 管理员批量生成
  if (path === "/redeem/generate" && request.method === "POST") {
    try {
      let body = await request.json();
      let count = Math.min(parseInt(body.count) || 1, 100);
      let points = toBigInt(body.points);
      let prefix = (body.prefix || "").trim().toUpperCase();
      let createdBy = body.createdBy || "admin";

      if (count < 1) return new Response(JSON.stringify({error: "数量至少为1"}), {status: 400});
      if (points <= 0n) return new Response(JSON.stringify({error: "积分必须大于0"}), {status: 400});

      let codes = [];
      let existing = new Set(reg.redeemCodes.keys());

      for (let i = 0; i < count; i++) {
        let code;
        let attempts = 0;
        do {
          code = generateCode(prefix);
          attempts++;
        } while ((existing.has(code) || codes.includes(code)) && attempts < 50);
        if (attempts >= 50) continue; // 防无限循环
        existing.add(code);
        codes.push(code);

        reg.redeemCodes.set(code, {
          points: String(points),
          createdBy,
          createdAt: Date.now(),
          usedBy: null,
          usedAt: null,
        });
      }

      await saveRedeemCodes(reg.storage, reg.redeemCodes);

      return new Response(JSON.stringify({ok: true, codes, count: codes.length}), {
        headers: {"Content-Type": "application/json"}
      });
    } catch (e) {
      return new Response(JSON.stringify({error: e.message}), {status: 500});
    }
  }

  // 管理员添加自定义码
  if (path === "/redeem/add" && request.method === "POST") {
    try {
      let body = await request.json();
      let code = (body.code || "").trim().toUpperCase();
      let points = toBigInt(body.points);
      let createdBy = body.createdBy || "admin";

      if (!code) return new Response(JSON.stringify({error: "请输入兑换码"}), {status: 400});
      if (points <= 0n) return new Response(JSON.stringify({error: "积分必须大于0"}), {status: 400});
      if (code.length < 4) return new Response(JSON.stringify({error: "兑换码至少4位"}), {status: 400});
      if (reg.redeemCodes.has(code)) return new Response(JSON.stringify({error: "兑换码已存在"}), {status: 400});

      reg.redeemCodes.set(code, {
        points: String(points),
        createdBy,
        createdAt: Date.now(),
        usedBy: null,
        usedAt: null,
      });

      await saveRedeemCodes(reg.storage, reg.redeemCodes);

      return new Response(JSON.stringify({ok: true, code, points: String(points)}), {
        headers: {"Content-Type": "application/json"}
      });
    } catch (e) {
      return new Response(JSON.stringify({error: e.message}), {status: 500});
    }
  }

  // 管理员查看所有码
  if (path === "/redeem/list") {
    let result = {};
    for (let [code, info] of reg.redeemCodes) {
      result[code] = info;
    }
    return new Response(JSON.stringify(result), {headers: {"Content-Type": "application/json"}});
  }

  // 管理员删除码
  if (path === "/redeem/delete" && request.method === "POST") {
    try {
      let body = await request.json();
      let code = (body.code || "").trim().toUpperCase();
      if (!code || !reg.redeemCodes.has(code)) {
        return new Response(JSON.stringify({error: "兑换码不存在"}), {status: 400});
      }
      reg.redeemCodes.delete(code);
      await saveRedeemCodes(reg.storage, reg.redeemCodes);
      return new Response(JSON.stringify({ok: true}), {headers: {"Content-Type": "application/json"}});
    } catch (e) {
      return new Response(JSON.stringify({error: e.message}), {status: 500});
    }
  }

  return null;
}
