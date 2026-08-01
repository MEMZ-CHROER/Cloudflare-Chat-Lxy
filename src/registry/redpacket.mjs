// 红包系统 — 创建/抢红包/查询
// 数据存储在 RoomRegistry 中

function toBigInt(val) {
  if (val == null) return 0n;
  try {
    let s = String(val).trim().toLowerCase();
    if (s.includes('e')) {
      let [base, exp] = s.split('e');
      let e = parseInt(exp, 10);
      if (e < 0) return 0n;
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

export async function handleRedPacket(reg, request, url) {
  switch (url.pathname) {

    case "/redpacket/create": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      try {
        let body = await request.json();
        let { creator, total, count, mode } = body;
        if (!creator || !total || !count) return new Response(JSON.stringify({error: "参数不完整"}), {status: 400});
        total = parseInt(total);
        count = parseInt(count);
        if (total < 1 || count < 1) return new Response(JSON.stringify({error: "金额或个数无效"}), {status: 400});
        // 🔒 安全修复：任意模式都要求每个至少1积分，否则拼手气金额可算出 0/负数
        if (total < count) return new Response(JSON.stringify({error: "金额不足，每个红包至少1积分"}), {status: 400});
        if (count > 100) return new Response(JSON.stringify({error: "最多100份"}), {status: 400});
        if (total > 100000) return new Response(JSON.stringify({error: "单次红包最多10万积分"}), {status: 400});

        // 检查余额
        let current = toBigInt(reg.userPoints.get(creator));
        if (current < total) return new Response(JSON.stringify({error: "积分不足"}), {status: 400});

        // 扣减积分
        reg.userPoints.set(creator, String(current - BigInt(total)));

        // 创建红包
        let rpId = "rp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        let rp = {
          id: rpId,
          creator,
          total,
          count,
          mode: mode === "fixed" ? "fixed" : "random",
          remaining: total,
          remainingCount: count,
          grabs: {},
          timestamp: Date.now(),
          room: body.room || ""
        };
        if (!reg.redPackets) reg.redPackets = new Map();
        reg.redPackets.set(rpId, rp);

        await reg.savePoints();
        return new Response(JSON.stringify({
          ok: true, redpacket: {
            id: rpId, creator, total, count, mode: rp.mode,
            remaining: total, remainingCount: count
          }
        }), {headers: {"Content-Type": "application/json"}});
      } catch (e) {
        return new Response(JSON.stringify({error: e.message}), {status: 500});
      }
    }

    case "/redpacket/grab": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      try {
        let body = await request.json();
        let { id, user } = body;
        if (!id || !user) return new Response(JSON.stringify({error: "参数不完整"}), {status: 400});
        if (!reg.redPackets) reg.redPackets = new Map();
        let rp = reg.redPackets.get(id);
        if (!rp) return new Response(JSON.stringify({error: "红包不存在或已过期"}), {status: 404});
        if (rp.remainingCount <= 0) return new Response(JSON.stringify({error: "红包已被抢完"}), {status: 400});
        if (rp.grabs[user]) return new Response(JSON.stringify({error: "你已经抢过这个红包了"}), {status: 400});
        if (user === rp.creator) return new Response(JSON.stringify({error: "不能抢自己的红包"}), {status: 400});

        // 计算金额
        let amount;
        if (rp.mode === "fixed") {
          amount = Math.max(1, Math.floor(rp.remaining / rp.remainingCount));
        } else {
          // 拼手气：最后一份直接取剩余
          if (rp.remainingCount === 1) {
            amount = rp.remaining;
          } else {
            // 🔒 安全修复：每份至少1积分、且不超过"给剩余每份留1分后的可分配额"，防 0/负数红包
            let allocatable = rp.remaining - (rp.remainingCount - 1);
            let max = Math.min(Math.floor(rp.remaining / rp.remainingCount * 2), allocatable);
            amount = 1 + Math.floor(Math.random() * Math.max(1, max));
            amount = Math.max(1, amount);
          }
        }
        // 加积分
        let userBal = toBigInt(reg.userPoints.get(user));
        reg.userPoints.set(user, String(userBal + BigInt(amount)));

        rp.grabs[user] = amount;
        rp.remaining -= amount;
        rp.remainingCount--;

        await reg.savePoints();
        return new Response(JSON.stringify({
          ok: true, amount,
          remaining: rp.remaining,
          remainingCount: rp.remainingCount,
          creator: rp.creator,
          isFinished: rp.remainingCount <= 0
        }), {headers: {"Content-Type": "application/json"}});
      } catch (e) {
        return new Response(JSON.stringify({error: e.message}), {status: 500});
      }
    }

    case "/redpacket/info": {
      let id = url.searchParams.get("id");
      if (!id) return new Response(JSON.stringify({error: "缺少红包ID"}), {status: 400});
      if (!reg.redPackets) reg.redPackets = new Map();
      let rp = reg.redPackets.get(id);
      if (!rp) return new Response(JSON.stringify({error: "红包不存在"}), {status: 404});
      return new Response(JSON.stringify({
        id: rp.id, creator: rp.creator, total: rp.total, count: rp.count,
        mode: rp.mode, remaining: rp.remaining, remainingCount: rp.remainingCount,
        grabs: rp.grabs, timestamp: rp.timestamp
      }), {headers: {"Content-Type": "application/json"}});
    }

    default:
      return null;
  }
}
