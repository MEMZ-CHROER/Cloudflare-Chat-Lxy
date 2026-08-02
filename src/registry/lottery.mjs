import { tokenValid } from "../utils.mjs";
// 抽奖系统

// 🔒 安全修复（E6）：BigInt 解析，防余额大数精度丢失
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

export async function handleLottery(reg, request, url) {
  switch (url.pathname) {
    case "/lottery/pools": {
      let result = [];
      for (let [poolId, pool] of reg.lotteryPools) {
        if (pool.enabled) {
          let prizes = [];
          for (let [pid, prize] of pool.prizes) {
            prizes.push({id: pid, name: prize.name, stock: prize.stock, initialStock: prize.initialStock});
          }
          result.push({id: poolId, name: pool.name, description: pool.description, cost: pool.cost, prizes});
        }
      }
      return new Response(JSON.stringify(result), {headers: {"Content-Type": "application/json"}});
    }

    case "/lottery/draw": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let name = body.name;
      let poolId = body.pool || "default";
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      // 🔒 安全修复：registry 层校验 token，确保 name 与 token 匹配
      let regUser = reg.registeredUsers.get(name);
      if (!tokenValid(regUser, body.token || "")) {
        return new Response(JSON.stringify({error: "身份验证失败"}), {status: 403});
      }
      let pool = reg.lotteryPools.get(poolId);
      if (!pool) return new Response(JSON.stringify({error: "奖池不存在"}), {status: 404});
      if (!pool.enabled) return new Response(JSON.stringify({error: "奖池已关闭"}), {status: 400});
      // 🔒 安全修复（E6）：积分/费用用 BigInt 运算，防大数精度丢失
      let pts = toBigInt(reg.userPoints.get(name));
      let cost = toBigInt(pool.cost);
      if (pts < cost) return new Response(JSON.stringify({error: "积分不足，需要 " + pool.cost + " 积分"}), {status: 400});
      reg.userPoints.set(name, String(pts - cost));
      let savePromises = [reg.savePoints()];
      await reg.addLedger(name, -cost, "lottery", "抽奖 " + pool.name);
      let prizePool = [];
      for (let [prizeId, prize] of pool.prizes) {
        if (prize.stock > 0) prizePool.push({id: prizeId, ...prize, weight: prize.probability});
      }
      if (prizePool.length === 0) {
        reg.userPoints.set(name, pts);
        await reg.savePoints();
        return new Response(JSON.stringify({error: "奖品已抽完"}), {status: 400});
      }
      let totalWeight = prizePool.reduce((s, p) => s + p.weight, 0);
      let rand = Math.random() * totalWeight;
      let chosen = null;
      for (let p of prizePool) { rand -= p.weight; if (rand <= 0) { chosen = p; break; } }
      if (!chosen) chosen = prizePool[prizePool.length - 1];
      let poolPrize = pool.prizes.get(chosen.id);
      if (poolPrize) poolPrize.stock--;
      savePromises.push(reg.saveLotteryPools());
      // 🔒 安全修复（LD20）：抽奖奖品禁止发放管理标签（red/cyan），防止普通用户抽中即获管理员权限
      let ct = (chosen.tag || "").toUpperCase();
      if (ct === "RED" || ct === "CYAN") chosen.tag = "";
      if (chosen.tag) {
        let itemId = "lottery_" + chosen.id + "_" + Date.now();
        if (!reg.userInventory.has(name)) reg.userInventory.set(name, new Map());
        let inv = reg.userInventory.get(name);
        for (let [, info] of inv) { info.equipped = false; }
        inv.set(itemId, {purchasedAt: Date.now(), equipped: true, fromLottery: true, prizeName: chosen.name, tag: chosen.tag, color: chosen.color, border: chosen.border || ""});
        reg.tags.set(name, {tag: chosen.tag, color: chosen.color, border: chosen.border || ""});
        savePromises.push(reg.saveUserInventory());
        savePromises.push(reg.saveTags());
      }
      await Promise.all(savePromises);
      return new Response(JSON.stringify({ok: true, prize: {name: chosen.name, tag: chosen.tag || null, color: chosen.color || null}}), {headers: {"Content-Type": "application/json"}});
    }

    // 管理后台抽奖接口
    case "/lottery/admin/pools": {
      let result = [];
      for (let [poolId, pool] of reg.lotteryPools) {
        let prizes = [];
        for (let [prizeId, prize] of pool.prizes) {
          prizes.push({id: prizeId, name: prize.name, probability: prize.probability, stock: prize.stock, initialStock: prize.initialStock, tag: prize.tag || "", color: prize.color || "", border: prize.border || ""});
        }
        result.push({id: poolId, name: pool.name, description: pool.description, cost: pool.cost, enabled: pool.enabled, prizes});
      }
      return new Response(JSON.stringify(result), {headers: {"Content-Type": "application/json"}});
    }

    case "/lottery/admin/pool/create": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let poolId = "pool_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      reg.lotteryPools.set(poolId, {name: body.name, description: body.description || "", cost: parseInt(body.cost) || 0, enabled: true, prizes: new Map()});
      await reg.saveLotteryPools();
      return new Response(JSON.stringify({ok: true, id: poolId}));
    }

    case "/lottery/admin/pool/update": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let pool = reg.lotteryPools.get(body.id);
      if (!pool) return new Response(JSON.stringify({error: "奖池不存在"}), {status: 404});
      if (body.name !== undefined) pool.name = body.name;
      if (body.description !== undefined) pool.description = body.description;
      if (body.cost !== undefined) pool.cost = parseInt(body.cost) || 0;
      await reg.saveLotteryPools();
      return new Response(JSON.stringify({ok: true}));
    }

    case "/lottery/admin/pool/toggle": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let pool = reg.lotteryPools.get(body.id);
      if (!pool) return new Response(JSON.stringify({error: "奖池不存在"}), {status: 404});
      pool.enabled = !pool.enabled;
      await reg.saveLotteryPools();
      return new Response(JSON.stringify({ok: true, enabled: pool.enabled}));
    }

    case "/lottery/admin/pool/delete": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      if (!reg.lotteryPools.has(body.id)) return new Response(JSON.stringify({error: "奖池不存在"}), {status: 404});
      reg.lotteryPools.delete(body.id);
      await reg.saveLotteryPools();
      return new Response(JSON.stringify({ok: true}));
    }

    case "/lottery/admin/prize/create": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let pool = reg.lotteryPools.get(body.poolId);
      if (!pool) return new Response(JSON.stringify({error: "奖池不存在"}), {status: 404});
      let prizeId = "prize_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      pool.prizes.set(prizeId, {name: body.name, probability: parseFloat(body.probability) || 0, stock: parseInt(body.stock) || 0, initialStock: parseInt(body.stock) || 0, tag: body.tag || "", color: body.color || "", border: body.border || ""});
      await reg.saveLotteryPools();
      return new Response(JSON.stringify({ok: true, id: prizeId}));
    }

    case "/lottery/admin/prize/update": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let pool = reg.lotteryPools.get(body.poolId);
      if (!pool) return new Response(JSON.stringify({error: "奖池不存在"}), {status: 404});
      let prize = pool.prizes.get(body.prizeId);
      if (!prize) return new Response(JSON.stringify({error: "奖品不存在"}), {status: 404});
      if (body.name !== undefined) prize.name = body.name;
      if (body.probability !== undefined) prize.probability = parseFloat(body.probability) || 0;
      if (body.tag !== undefined) prize.tag = body.tag;
      if (body.color !== undefined) prize.color = body.color;
      if (body.border !== undefined) prize.border = body.border;
      await reg.saveLotteryPools();
      return new Response(JSON.stringify({ok: true}));
    }

    case "/lottery/admin/prize/delete": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let pool = reg.lotteryPools.get(body.poolId);
      if (!pool) return new Response(JSON.stringify({error: "奖池不存在"}), {status: 404});
      pool.prizes.delete(body.prizeId);
      await reg.saveLotteryPools();
      return new Response(JSON.stringify({ok: true}));
    }

    case "/lottery/admin/prize/restock": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let pool = reg.lotteryPools.get(body.poolId);
      if (!pool) return new Response(JSON.stringify({error: "奖池不存在"}), {status: 404});
      let prize = pool.prizes.get(body.prizeId);
      if (!prize) return new Response(JSON.stringify({error: "奖品不存在"}), {status: 404});
      prize.stock = prize.initialStock;
      await reg.saveLotteryPools();
      return new Response(JSON.stringify({ok: true}));
    }

    default:
      return null;
  }
}
