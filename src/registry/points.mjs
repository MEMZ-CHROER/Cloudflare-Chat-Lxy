// 积分系统 — 使用 BigInt 确保大数精度
// 存储为字符串，运算用 BigInt，JSON 返回 Number（展示用）

function toBigInt(val) {
  if (val == null) return 0n;
  try {
    let s = String(val).trim().toLowerCase();
    // 科学计数法 "1.23e+21" → 转完整数字字符串再 BigInt
    if (s.includes('e')) {
      let [base, exp] = s.split('e');
      let sign = 1;
      let e = parseInt(exp, 10);
      if (e < 0) return 0n; // 不支持小数
      if (e > 100000) return 0n; // 防 DoS：指数过大直接拒绝
      let dot = base.indexOf('.');
      if (dot === -1) {
        // "123e+10" → "123" + "0"*10
        s = base + '0'.repeat(e);
      } else {
        // "1.23e+21" → digits + zeros
        let digits = base.replace('.', '');
        let fracLen = base.length - 1 - dot;
        let zeros = e - fracLen;
        s = digits + (zeros > 0 ? '0'.repeat(zeros) : '');
      }
    }
    return BigInt(s);
  } catch { return 0n; }
}

// 🔒 安全修复（E5）：积分写端点仅允许管理方调用（带有效管理密钥 auth）
function adminAuthorized(reg, auth) {
  if (!auth) return false;
  if (reg.adminKey && auth === reg.adminKey) return true;
  if (reg.env) {
    if (reg.env.ADMIN_SECRET_KEY && auth === reg.env.ADMIN_SECRET_KEY) return true;
    if (reg.env.ADMIN_KEY && auth === reg.env.ADMIN_KEY) return true;
  }
  return false;
}

export async function handlePoints(reg, request, url) {
  switch (url.pathname) {
    case "/points/get": {
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({points: 0}), {
        headers: {"Content-Type": "application/json"}
      });
      let pts = String(reg.userPoints.get(name) || 0);
      return new Response(JSON.stringify({points: pts}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/points/set": {
      // 🔒 安全修复（E5）：仅管理方（带有效密钥 auth）可调用
      if (!adminAuthorized(reg, url.searchParams.get("auth") || "")) return new Response("无权操作", { status: 403 });
      let name = url.searchParams.get("name");
      let raw = url.searchParams.get("amount");
      if (!name) return new Response("请提供用户名", { status: 400 });
      if (!raw) return new Response("请提供有效积分", { status: 400 });
      let amount = toBigInt(raw);
      if (amount < 0n) amount = 0n;
      let oldBal = toBigInt(reg.userPoints.get(name));
      reg.userPoints.set(name, String(amount));
      await reg.savePoints();
      await reg.addLedger(name, amount - oldBal, "admin", "管理员设置积分");
      return new Response("已设置 " + name + " 的积分为 " + amount, { status: 200 });
    }

    case "/points/add": {
      // 🔒 安全修复（E5）：仅管理方（带有效密钥 auth）可调用
      if (!adminAuthorized(reg, url.searchParams.get("auth") || "")) return new Response("无权操作", { status: 403 });
      let name = url.searchParams.get("name");
      let raw = url.searchParams.get("amount");
      if (!name) return new Response("请提供用户名", { status: 400 });
      if (!raw) return new Response("请提供有效积分", { status: 400 });
      let amount = toBigInt(raw);
      let current = toBigInt(reg.userPoints.get(name));
      let result = current + amount;
      // 🔒 安全修复（E2）：扣款导致余额不足时直接拒绝，绝不钳制为 0（防零成本下注/绕过余额检查）
      if (result < 0n) {
        return new Response("积分不足，扣除失败，当前 " + current, { status: 400 });
      }
      reg.userPoints.set(name, String(result));
      await reg.savePoints();
      await reg.addLedger(name, amount, "admin", amount >= 0n ? "管理员加分" : "管理员扣分");
      return new Response("已为 " + name + " " + (amount >= 0n ? "增加" : "扣除") + " " + (amount >= 0n ? String(amount) : String(-amount)) + " 积分，当前 " + result, { status: 200 });
    }

    case "/points/transfer": {
      let sender = url.searchParams.get("sender");
      let receiver = url.searchParams.get("receiver");
      let raw = url.searchParams.get("amount");
      if (!sender || !receiver) return new Response("请提供发送者和接收者", { status: 400 });
      if (!raw) return new Response("请提供有效积分", { status: 400 });
      let amount = toBigInt(raw);
      if (amount <= 0n) return new Response("请提供有效积分", { status: 400 });
      if (sender === receiver) return new Response("不能给自己转账", { status: 400 });
      let senderBal = toBigInt(reg.userPoints.get(sender));
      if (senderBal < amount) return new Response("积分不足，当前 " + senderBal, { status: 400 });
      reg.userPoints.set(sender, String(senderBal - amount));
      let receiverBal = toBigInt(reg.userPoints.get(receiver));
      reg.userPoints.set(receiver, String(receiverBal + amount));
      await reg.savePoints();
      await reg.addLedger(sender, -amount, "transfer", "转账给 " + receiver);
      await reg.addLedger(receiver, amount, "transfer", "收到 " + sender + " 转账");
      return new Response(sender + " 向 " + receiver + " 转账 " + amount + " 积分成功，剩余 " + (senderBal - amount), { status: 200 });
    }

    case "/points/all": {
      let result = {};
      for (let [name, points] of reg.userPoints) {
        result[name] = String(points);
      }
      return new Response(JSON.stringify(result), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/points/ledger": {
      // 💰 积分流水账本（公开只读）：返回该用户最近 N 条收支明细
      let name = url.searchParams.get("name");
      let limit = parseInt(url.searchParams.get("limit")) || 50;
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      let arr = await reg.getLedger(name, limit);
      return new Response(JSON.stringify(arr), {headers: {"Content-Type": "application/json"}});
    }

    case "/points/batch": {
      // 🔒 安全修复（E5）：仅管理方（带有效密钥 auth）可调用
      if (!adminAuthorized(reg, url.searchParams.get("auth") || "")) return new Response("无权操作", { status: 403 });
      let names = url.searchParams.get("names");
      let raw = url.searchParams.get("amount");
      let action = url.searchParams.get("action") || "add";
      if (!names) return new Response("请提供用户名列表", { status: 400 });
      if (!raw) return new Response("请提供有效积分", { status: 400 });
      let amount = toBigInt(raw);
      let nameList = names.split(",").map(n => n.trim()).filter(n => n);
      if (nameList.length === 0) return new Response("请提供至少一个用户名", { status: 400 });
      if (action === "set") {
        nameList.forEach(name => reg.userPoints.set(name, amount < 0n ? "0" : String(amount)));
      } else {
        // 🔒 L20 修复：扣款余额不足时拒绝（与单用户 /points/add 一致，不钳制为 0）
        // 先校验全部用户余额充足，再统一扣款；任一不足则整批失败（其余用户不受影响）
        let denied = [];
        for (let name of nameList) {
          if (toBigInt(reg.userPoints.get(name)) + amount < 0n) denied.push(name);
        }
        if (denied.length) {
          return new Response("以下用户积分不足，扣款失败：" + denied.join("、"), { status: 400 });
        }
        nameList.forEach(name => {
          let current = toBigInt(reg.userPoints.get(name));
          reg.userPoints.set(name, String(current + amount));
        });
      }
      await reg.savePoints();
      return new Response("已为 " + nameList.length + " 个用户" + (amount >= 0n ? "增加" : "扣除") + " " + (amount >= 0n ? String(amount) : String(-amount)) + " 积分", { status: 200 });
    }

    case "/points/checkin": {
      let name = url.searchParams.get("name");
      let ip = url.searchParams.get("ip") || "";
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      let user = reg.registeredUsers.get(name);
      if (!user) return new Response(JSON.stringify({error: "请先注册后再签到"}), {status: 400});
      let today = new Date().toISOString().slice(0, 10);
      if (user.lastCheckin === today) return new Response(JSON.stringify({error: "今天已签到，明天再来吧"}), {status: 400});
      // 🔒 安全修复（E4）：每 IP 每日最多签到 3 次，防批量小号签到刷积分
      // 🔒 L13a 修复：checkinByIp 持久化，DO 重启不重置可刷签到
      if (ip) {
        if (!reg.checkinByIp) reg.checkinByIp = new Map();
        let rec = reg.checkinByIp.get(ip);
        if (!rec || rec.date !== today) rec = {date: today, count: 0};
        if (rec.count >= 3) return new Response(JSON.stringify({error: "今日签到次数已达上限"}), {status: 429});
        rec.count++;
        reg.checkinByIp.set(ip, rec);
      }
      let reward = 500n;
      user.lastCheckin = today;
      // 🕶️ 每日签到额外送 1 张匿名券（三渠道之一）
      user.anonCoupons = (user.anonCoupons || 0) + 1;
      let current = toBigInt(reg.userPoints.get(name));
      let result = current + reward;
      reg.userPoints.set(name, String(result));
      await Promise.all([reg.saveRegisteredUsers(), reg.savePoints(), reg.saveCheckinByIp()]);
      await reg.addLedger(name, reward, "checkin", "每日签到");
      return new Response(JSON.stringify({ok: true, reward: String(reward), total: String(result), anonCoupons: user.anonCoupons, message: "签到成功！获得 " + reward + " 积分 + 1 张匿名券"}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/game/bet": {
      // 🔒 安全修复（E1/E2）：服务端定局 + 原子结算
      // 下注即定胜负：余额检查、扣款、生成服务端随机结果、发放奖励在同一次 DO 调用内原子完成，
      // 彻底杜绝"客户端上报 win 铸币"与"查余额→扣款跨请求 TOCTOU"。
      let name = url.searchParams.get("name");
      let wager = parseInt(url.searchParams.get("wager")) || 0;
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      if (!reg.gameBets) reg.gameBets = new Map();
      if (!reg.gameLastWin) reg.gameLastWin = new Map();
      if (!reg.gameDailyWin) reg.gameDailyWin = new Map();
      if (wager < 1) return new Response(JSON.stringify({error: "赌注无效"}), {status: 400});
      let now = Date.now();
      // 冷却：每 30 秒一局
      let lastWin = reg.gameLastWin.get(name) || 0;
      if (now - lastWin < 30000) {
        return new Response(JSON.stringify({error: "操作过于频繁，请稍后再试"}), {status: 400});
      }
      // 原子检查并扣除赌注（不足拒绝，不钳制为 0）
      let current = toBigInt(reg.userPoints.get(name));
      if (current < BigInt(wager)) {
        return new Response(JSON.stringify({error: "积分不足，无法下注"}), {status: 400});
      }
      reg.userPoints.set(name, String(current - BigInt(wager)));
      // 服务端定局：约 45% 概率赢，奖励为下注 1~2 倍随机（单局上限 10000）
      // H5 修复：原 1~25 倍为 +EV（期望约 6.1 倍，长期铸币），改为 1~2 倍 → 期望 0.675×wager，负期望稳定
      let won = Math.random() < 0.45;
      let prize = won ? Math.min(Math.floor(wager * (1 + Math.random())), 10000) : 0;
      // 每日净赢上限 10000（prize - wager 累计），超出则截断至额度内（至少保本）
      let today = new Date().toISOString().slice(0, 10);
      let daily = reg.gameDailyWin.get(name);
      if (!daily || daily.date !== today) daily = {date: today, total: 0};
      let awarded = 0;
      if (prize > 0) {
        let cap = 10000 - daily.total + wager; // 剩余净赢额度 + 本金
        if (prize > cap) prize = Math.max(wager, cap);
        if (prize > 0) {
          awarded = prize;
          daily.total += (prize - wager);
          reg.gameDailyWin.set(name, daily);
          await reg.saveGameDailyWin(); // H6：每日净赢上限持久化，DO 重启不重置防刷额度
        }
      }
      if (awarded > 0) {
        reg.userPoints.set(name, String(toBigInt(reg.userPoints.get(name)) + BigInt(awarded)));
      }
      reg.gameLastWin.set(name, now);
      reg.gameBets.set(name, {wager, ts: now, prize: awarded});
      await reg.savePoints();
      await reg.addLedger(name, -wager, "game", "游戏下注");
      if (awarded > 0) await reg.addLedger(name, awarded, "game", "游戏获胜");
      return new Response(JSON.stringify({
        ok: true,
        deducted: wager,
        won: awarded > 0,
        prize: awarded,
        balance: String(toBigInt(reg.userPoints.get(name)))
      }), {headers: {"Content-Type": "application/json"}});
    }

    case "/game/win": {
      // 🔒 安全修复（E1）：win 改为幂等查询，不再接受客户端金额、不再发奖
      // 奖励已在下注时由服务端结算，此端点仅返回本局结果与当前余额（供前端刷新显示）
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      let bet = reg.gameBets && reg.gameBets.get(name);
      let prize = bet ? bet.prize || 0 : 0;
      let bal = toBigInt(reg.userPoints.get(name));
      return new Response(JSON.stringify({
        ok: true,
        won: prize > 0,
        prize: prize,
        awarded: prize,
        balance: String(bal)
      }), {headers: {"Content-Type": "application/json"}});
    }

    default:
      return null;
  }
}
