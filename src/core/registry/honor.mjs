import { tokenValid } from "../utils.mjs";
// 🪙 v1.45 荣誉币 + 荣誉商店（registry 层）
// 荣誉币（honorCoins: Map<name, string>，BigInt 字符串）由赛季结算 / 管理员手动发放，
// 荣誉商店复用 shopItems（honorPrice>0 的条目）。荣誉流水独立于积分流水（addHonorLedger / getHonorLedger 由主 agent 接线）。
// 安全要点：
//   · buy 需 tokenValid（registry 层纵深防御，防冒名消费）
//   · F2 并发防护：先在 userInventory 写条目再扣款（set 提前到首个 await 之前，DO input gate 防双发）
//   · honorPrice / amount 均正则校验（拒绝 0/负数/非数字，防负价铸币）

// 🔒 BigInt 解析，防余额大数精度丢失（参考 shop.mjs）
function toBigInt(val) {
  if (val == null) return 0n;
  try {
    let s = String(val).trim().toLowerCase();
    if (s.includes('e')) {
      let [base, exp] = s.split('e');
      let e = parseInt(exp, 10);
      if (e < 0) return 0n;
      if (e > 100000) return 0n; // 防 DoS：指数过大直接拒绝
      let dot = base.indexOf('.');
      if (dot === -1) s = base + '0'.repeat(e);
      else {
        let digits = base.replace('.', '');
        let fracLen = base.length - 1 - dot;
        let zeros = e - fracLen;
        s = digits + (zeros > 0 ? '0'.repeat(zeros) : '');
      }
    }
    return BigInt(s);
  } catch { return 0n; }
}

export async function handleHonor(reg, request, url) {
  switch (url.pathname) {
    // ---------- 用户端点 ----------
    case "/honor/get": {
      // 公开只读：查询荣誉币余额（未注册返回 0）
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({error: "no name"}), {status: 400});
      return new Response(JSON.stringify({honor: String(reg.honorCoins.get(name) || "0")}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/honor/ledger": {
      // 需本人 token：荣誉流水
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      // 🔒 S4 纵深防御：registry 层校验 token，确保 name 与 token 匹配
      let regUser = reg.registeredUsers.get(name);
      if (!tokenValid(regUser, url.searchParams.get("token") || "")) {
        return new Response(JSON.stringify({error: "身份验证失败"}), {status: 403});
      }
      let ledger = await reg.getHonorLedger(name, 50);
      return new Response(JSON.stringify({ledger}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/honor/shop/items": {
      // 公开只读：遍历 reg.shopItems，返回 honorPrice>0 的商品
      let result = [];
      for (let [id, item] of reg.shopItems) {
        if (toBigInt(item.honorPrice) > 0n) {
          result.push({id, name: item.name, description: item.description, honorPrice: item.honorPrice, tag: item.tag, color: item.color, border: item.border || "", enabled: item.enabled !== false});
        }
      }
      return new Response(JSON.stringify(result), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/honor/shop/buy": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let name = body.name;
      let itemId = body.itemId;
      if (!name || !itemId) return new Response(JSON.stringify({error: "请提供用户名和商品ID"}), {status: 400});
      // 🔒 S4 纵深防御：registry 层校验 token，确保 name 与 token 匹配
      let regUser = reg.registeredUsers.get(name);
      if (!tokenValid(regUser, body.token || "")) {
        return new Response(JSON.stringify({error: "身份验证失败"}), {status: 403});
      }
      let item = reg.shopItems.get(itemId);
      if (!item) return new Response(JSON.stringify({error: "商品不存在"}), {status: 404});
      // 🔒 荣誉商店商品必须 honorPrice > 0（防负价/免费刷荣誉商品）
      if (toBigInt(item.honorPrice) <= 0n) return new Response(JSON.stringify({error: "商品无效"}), {status: 400});
      let bal = toBigInt(reg.honorCoins.get(name) || "0");
      let price = toBigInt(item.honorPrice);
      if (bal < price) return new Response(JSON.stringify({error: "荣誉不足"}), {status: 400});
      // 🔒 F2 并发防护：inv.set 提前到首个 await 之前——DO input gate 在 await 处打开，
      // 若 set 留在 await 之后，并发购买会双双通过校验导致重复发放/双扣。
      if (!reg.userInventory.has(name)) reg.userInventory.set(name, new Map());
      let inv = reg.userInventory.get(name);
      inv.set(itemId, {purchasedAt: Date.now(), equipped: false});
      // 同步扣款后再落盘
      reg.honorCoins.set(name, String(bal - price));
      await reg.saveHonorCoins();
      await reg.saveUserInventory();
      await reg.addHonorLedger(name, "-" + item.honorPrice, "honor_shop", "购买" + item.name);
      return new Response(JSON.stringify({ok: true}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    // ---------- 管理端点（registry adminExactPaths 统一鉴权） ----------
    case "/admin/honor/add": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let name = body.name;
      let amount = String(body.amount ?? "").trim();
      // 🔒 F2：amount 必须整数字符串（可正可负），拒绝小数/非数字
      if (!name || !/^-?\d+$/.test(amount)) return new Response(JSON.stringify({error: "金额必须是整数"}), {status: 400});
      let cur = toBigInt(reg.honorCoins.get(name) || "0");
      let next = cur + BigInt(amount);
      // 🔒 余额不可为负（防扣到负数铸币/欠费）
      if (next < 0n) return new Response(JSON.stringify({error: "荣誉不足，无法扣除"}), {status: 400});
      reg.honorCoins.set(name, String(next));
      await reg.saveHonorCoins();
      await reg.addHonorLedger(name, amount, "admin", "管理员调整");
      return new Response(JSON.stringify({ok: true}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/admin/honor-shop/items": {
      // 全部 honorPrice>0 商品（含 enabled）
      let result = [];
      for (let [id, item] of reg.shopItems) {
        if (toBigInt(item.honorPrice) > 0n) {
          result.push({id, name: item.name, description: item.description, honorPrice: item.honorPrice, tag: item.tag, color: item.color, border: item.border || "", enabled: item.enabled !== false});
        }
      }
      return new Response(JSON.stringify(result), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/admin/honor-shop/item/add": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      if (!body.name) return new Response(JSON.stringify({error: "请提供商品名称"}), {status: 400});
      // 🔒 安全修复（F2）：honorPrice 必须是正整数（拒绝 0/负数/非数字），防负价铸币
      let hp = String(body.honorPrice ?? "").trim();
      if (!/^[1-9]\d*$/.test(hp)) return new Response(JSON.stringify({error: "荣誉价格无效"}), {status: 400});
      let itemId = String(Date.now());
      reg.shopItems.set(itemId, {id: itemId, name: body.name, description: body.description || "", honorPrice: hp, tag: body.tag || "", color: body.color || "", border: body.border || "", enabled: true, consumable: false});
      await reg.saveShopItems();
      return new Response(JSON.stringify({ok: true}), {headers: {"Content-Type": "application/json"}});
    }

    case "/admin/honor-shop/item/toggle": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let id = body.id;
      if (!id) return new Response(JSON.stringify({error: "请提供商品ID"}), {status: 400});
      let item = reg.shopItems.get(id);
      if (!item) return new Response(JSON.stringify({error: "商品不存在"}), {status: 404});
      item.enabled = !item.enabled;
      await reg.saveShopItems();
      return new Response(JSON.stringify({ok: true, enabled: item.enabled}), {headers: {"Content-Type": "application/json"}});
    }

    case "/admin/honor-shop/item/delete": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let id = body.id;
      if (!id) return new Response(JSON.stringify({error: "请提供商品ID"}), {status: 400});
      if (!reg.shopItems.has(id)) return new Response(JSON.stringify({error: "商品不存在"}), {status: 404});
      reg.shopItems.delete(id);
      await reg.saveShopItems();
      return new Response(JSON.stringify({ok: true}), {headers: {"Content-Type": "application/json"}});
    }

    default:
      return null;
  }
}
