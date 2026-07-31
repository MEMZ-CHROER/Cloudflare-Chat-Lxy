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
      let name = url.searchParams.get("name");
      let raw = url.searchParams.get("amount");
      if (!name) return new Response("请提供用户名", { status: 400 });
      if (!raw) return new Response("请提供有效积分", { status: 400 });
      let amount = toBigInt(raw);
      if (amount < 0n) amount = 0n;
      reg.userPoints.set(name, String(amount));
      await reg.savePoints();
      return new Response("已设置 " + name + " 的积分为 " + amount, { status: 200 });
    }

    case "/points/add": {
      let name = url.searchParams.get("name");
      let raw = url.searchParams.get("amount");
      if (!name) return new Response("请提供用户名", { status: 400 });
      if (!raw) return new Response("请提供有效积分", { status: 400 });
      let amount = toBigInt(raw);
      let current = toBigInt(reg.userPoints.get(name));
      let result = current + amount;
      if (result < 0n) result = 0n;
      reg.userPoints.set(name, String(result));
      await reg.savePoints();
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

    case "/points/batch": {
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
        nameList.forEach(name => {
          let current = toBigInt(reg.userPoints.get(name));
          let result = current + amount;
          if (result < 0n) result = 0n;
          reg.userPoints.set(name, String(result));
        });
      }
      await reg.savePoints();
      return new Response("已为 " + nameList.length + " 个用户" + (amount >= 0n ? "增加" : "扣除") + " " + (amount >= 0n ? String(amount) : String(-amount)) + " 积分", { status: 200 });
    }

    case "/points/checkin": {
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      let user = reg.registeredUsers.get(name);
      if (!user) return new Response(JSON.stringify({error: "请先注册后再签到"}), {status: 400});
      let today = new Date().toISOString().slice(0, 10);
      if (user.lastCheckin === today) return new Response(JSON.stringify({error: "今天已签到，明天再来吧"}), {status: 400});
      let reward = 500n;
      user.lastCheckin = today;
      let current = toBigInt(reg.userPoints.get(name));
      let result = current + reward;
      reg.userPoints.set(name, String(result));
      await Promise.all([reg.saveRegisteredUsers(), reg.savePoints()]);
      return new Response(JSON.stringify({ok: true, reward: String(reward), total: String(result), message: "签到成功！获得 " + reward + " 积分"}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/game/bet": {
      let name = url.searchParams.get("name");
      let wager = parseInt(url.searchParams.get("wager")) || 0;
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      if (!reg.gameBets) reg.gameBets = new Map();
      reg.gameBets.set(name, {wager, ts: Date.now()});
      return new Response(JSON.stringify({ok: true}), {headers: {"Content-Type": "application/json"}});
    }

    case "/game/win": {
      let name = url.searchParams.get("name");
      let win = parseInt(url.searchParams.get("win")) || 0;
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      if (!reg.gameBets) reg.gameBets = new Map();
      if (!reg.gameLastWin) reg.gameLastWin = new Map();
      if (!reg.gameDailyWin) reg.gameDailyWin = new Map();
      let bet = reg.gameBets.get(name);
      let now = Date.now();
      // 1) 必须有未结算下注，且 5 分钟内有效（防凭空 win / 重放）
      if (!bet || now - bet.ts > 300000) {
        return new Response(JSON.stringify({error: "请先下注后再结算"}), {status: 400});
      }
      // 2) win 不得超过下注的 25 倍，且单局上限 10000（防杠杆刷分）
      if (win > bet.wager * 25 || win > 10000) {
        return new Response(JSON.stringify({error: "该局赢取金额超出允许范围"}), {status: 400});
      }
      // 3) 每 30 秒限一次结算（防高频刷分）
      let lastWin = reg.gameLastWin.get(name) || 0;
      if (now - lastWin < 30000) {
        return new Response(JSON.stringify({error: "操作过于频繁，请稍后再试"}), {status: 400});
      }
      // 4) 每日净赢上限 10000（win - wager 累计）
      let today = new Date().toISOString().slice(0, 10);
      let daily = reg.gameDailyWin.get(name);
      if (!daily || daily.date !== today) daily = {date: today, total: 0};
      let net = win - bet.wager;
      if (daily.total + net > 10000) {
        return new Response(JSON.stringify({error: "今日游戏赢取已达上限"}), {status: 400});
      }
      daily.total += net;
      reg.gameDailyWin.set(name, daily);
      reg.gameLastWin.set(name, now);
      reg.gameBets.delete(name);
      return new Response(JSON.stringify({ok: true}), {headers: {"Content-Type": "application/json"}});
    }

    default:
      return null;
  }
}
