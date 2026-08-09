import { tokenValid } from "../utils.mjs";
// 💱 v1.47 交易市场（registry 层）
// 玩家可上架背包物品（普通商店商品，荣誉商店 honorPrice>0 商品禁上架），公开挂单、他人购买、
// 卖家撤销，管理员可改配置 / 看全量订单 / 强制下架。
// 存储：reg.marketConfig（{enabled, feePercent, maxOpenOrders, maxPrice}）、reg.marketOrders（数组）。
// 安全要点：
//   · buy/sell/cancel/inventory/orders 均需 tokenValid（registry 层纵深防御，防冒名操作）
//   · F2 并发防护：所有状态变更（订单状态/余额/背包）在首个 await 之前同步完成，DO input gate 防并发双花
//   · price 正则校验（拒绝 0/负数/非数字，防负价铸币）；fee 用 BigInt 整除
//   · L1 脱敏：整体 try/catch，异常只回 500"市场服务暂时不可用"，不泄露内部错误

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

function jsonRes(obj, status = 200) {
  return new Response(JSON.stringify(obj), {status, headers: {"Content-Type": "application/json"}});
}

export async function handleMarket(reg, request, url) {
  try {
    // 🛡️ 接线阶段会初始化，此处防御性兜底（幂等，不覆盖已有配置）
    if (!reg.marketConfig || typeof reg.marketConfig !== "object") {
      reg.marketConfig = {enabled: true, feePercent: 10, maxOpenOrders: 5, maxPrice: "1000000"};
    }
    if (!Array.isArray(reg.marketOrders)) reg.marketOrders = [];

    // 清理过期结算单：仅保留 open 单 + 30 天内成交/撤销单，防 storage 无限膨胀（上限 1500 条）
    function pruneSettled() {
      const TH = Date.now() - 30 * 24 * 3600 * 1000;
      reg.marketOrders = reg.marketOrders.filter(o => o.status === "open" || (o.soldAt && o.soldAt > TH) || (o.cancelledAt && o.cancelledAt > TH));
      if (reg.marketOrders.length > 1500) reg.marketOrders = reg.marketOrders.slice(-1500);
    }

    switch (url.pathname) {
      // ---------- 公开端点 ----------
      case "/market/list": {
        // 公开只读：仅 open 挂单，按 createdAt 升序，分页
        let open = reg.marketOrders.filter(o => o.status === "open").sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        let limit = parseInt(url.searchParams.get("limit")) || 100;
        if (limit > 200) limit = 200;
        let offset = parseInt(url.searchParams.get("offset")) || 0;
        let orders = open.slice(offset, offset + limit).map(o => ({
          id: o.id, seller: o.seller, itemId: o.itemId,
          itemName: o.itemName, tag: o.tag, color: o.color, border: o.border,
          price: o.price, createdAt: o.createdAt
        }));
        return jsonRes({enabled: reg.marketConfig.enabled, feePercent: reg.marketConfig.feePercent, total: open.length, orders});
      }

      // ---------- 用户端点 ----------
      case "/market/inventory": {
        // 本人背包（可上架判定）：sellable = 商品存在 && 非荣誉商品 && 未装备
        let name = url.searchParams.get("name");
        if (!name) return jsonRes({error: "请提供用户名"}, 400);
        if (!tokenValid(reg.registeredUsers.get(name), url.searchParams.get("token") || "")) {
          return jsonRes({error: "请先登录"}, 403);
        }
        let inv = reg.userInventory.get(name);
        let result = [];
        if (inv) {
          for (let [itemId, info] of inv) {
            let item = reg.shopItems.get(itemId);
            result.push({
              itemId,
              name: item ? (item.name || "未知商品") : "未知商品",
              tag: item ? (item.tag || "") : "",
              color: item ? (item.color || "") : "",
              border: item ? (item.border || "") : "",
              equipped: !!info.equipped,
              sellable: !!item && toBigInt(item.honorPrice) <= 0n && !info.equipped
            });
          }
        }
        return jsonRes(result);
      }

      case "/market/orders": {
        // 本人全部挂单（含 sold/cancelled），按 createdAt 倒序
        let name = url.searchParams.get("name");
        if (!name) return jsonRes({error: "请提供用户名"}, 400);
        if (!tokenValid(reg.registeredUsers.get(name), url.searchParams.get("token") || "")) {
          return jsonRes({error: "请先登录"}, 403);
        }
        let mine = reg.marketOrders
          .filter(o => o.seller === name)
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
          .map(o => ({
            id: o.id, seller: o.seller, itemId: o.itemId,
            itemName: o.itemName, tag: o.tag, color: o.color, border: o.border,
            price: o.price, status: o.status, createdAt: o.createdAt,
            soldAt: o.soldAt, cancelledAt: o.cancelledAt, buyer: o.buyer
          }));
        return jsonRes({total: mine.length, orders: mine});
      }

      case "/market/sell": {
        if (request.method !== "POST") return jsonRes({error: "请使用POST"}, 405);
        let body = await request.json();
        let name = body.name;
        let itemId = body.itemId;
        if (!name || !itemId) return jsonRes({error: "请提供用户名和物品ID"}, 400);
        // 🔒 S4 纵深防御：registry 层校验 token，确保 name 与 token 匹配
        if (!tokenValid(reg.registeredUsers.get(name), body.token || "")) {
          return jsonRes({error: "请先登录后再操作市场"}, 403);
        }
        if (reg.marketConfig.enabled === false) return jsonRes({error: "市场已关闭"}, 400);
        let priceRaw = String(body.price ?? "").trim();
        if (!/^[1-9]\d*$/.test(priceRaw)) return jsonRes({error: "价格必须是正整数"}, 400);
        if (toBigInt(priceRaw) > toBigInt(reg.marketConfig.maxPrice)) return jsonRes({error: "价格超出上限"}, 400);
        let item = reg.shopItems.get(itemId);
        if (!item) return jsonRes({error: "物品不存在"}, 404);
        // 🔒 荣誉商店商品不可上架（防荣誉商品转积分套现）
        if (toBigInt(item.honorPrice) > 0n) return jsonRes({error: "荣誉商店商品不可上架"}, 400);
        let inv = reg.userInventory.get(name);
        if (!inv || !inv.has(itemId)) return jsonRes({error: "背包中无此物品"}, 400);
        let info = inv.get(itemId);
        if (info.equipped === true) return jsonRes({error: "请先卸下该装备再挂单"}, 400);
        let openCount = reg.marketOrders.filter(o => o.seller === name && o.status === "open").length;
        if (openCount >= Number(reg.marketConfig.maxOpenOrders ?? 5)) return jsonRes({error: "挂单数量已达上限"}, 400);
        // 🔒 F2 并发防护：全部校验同步完成后，先离包再落盘——DO input gate 在 await 处打开，
        // 若 delete 留在 await 之后，并发上架会双双通过背包校验导致一物多挂。
        let purchasedAt = info.purchasedAt || Date.now(); // delete 前读快照
        inv.delete(itemId);
        let order = {
          id: "mkt_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
          seller: name,
          itemId,
          price: priceRaw,
          status: "open",
          createdAt: Date.now(),
          soldAt: null,
          cancelledAt: null,
          buyer: null,
          itemName: item.name || "道具",
          tag: item.tag || "",
          color: item.color || "",
          border: item.border || "",
          purchasedAt
        };
        reg.marketOrders.push(order);
        pruneSettled();
        await reg.saveMarketOrders();
        await reg.saveUserInventory();
        return jsonRes({ok: true, id: order.id});
      }

      case "/market/buy": {
        if (request.method !== "POST") return jsonRes({error: "请使用POST"}, 405);
        let body = await request.json();
        let name = body.name; // 买方
        let orderId = body.orderId;
        if (!name || !orderId) return jsonRes({error: "请提供用户名和订单ID"}, 400);
        if (!tokenValid(reg.registeredUsers.get(name), body.token || "")) {
          return jsonRes({error: "请先登录"}, 403);
        }
        if (reg.marketConfig.enabled === false) return jsonRes({error: "市场已关闭"}, 400);
        let order = reg.marketOrders.find(o => o.id === orderId);
        if (!order) return jsonRes({error: "订单不存在"}, 404);
        if (order.status !== "open") return jsonRes({error: "订单已成交或已撤销"}, 400);
        if (order.seller === name) return jsonRes({error: "不能购买自己挂单"}, 400);
        let price = toBigInt(order.price);
        let fee = toBigInt(reg.marketConfig.feePercent) * price / 100n; // BigInt 整除
        let sellerNet = price - fee;
        let buyerBal = toBigInt(reg.userPoints.get(name));
        if (buyerBal < price) return jsonRes({error: "积分不足"}, 400);
        let binv = reg.userInventory.get(name);
        if (binv && binv.has(order.itemId)) return jsonRes({error: "你已拥有此商品"}, 400);
        // 🔒 F2 原子结算：订单/双方余额/买方背包全部同步变更（首个 await 前），防并发双花/重复发货
        order.status = "sold";
        order.buyer = name;
        order.soldAt = Date.now();
        reg.userPoints.set(name, String(buyerBal - price));
        reg.userPoints.set(order.seller, String(toBigInt(reg.userPoints.get(order.seller)) + sellerNet));
        if (!reg.userInventory.has(name)) reg.userInventory.set(name, new Map());
        reg.userInventory.get(name).set(order.itemId, {purchasedAt: Date.now(), equipped: false});
        pruneSettled();
        await reg.saveMarketOrders();
        await reg.savePoints();
        await reg.saveUserInventory();
        await reg.addLedger(name, -price, "market", "购买 " + (order.itemName || "道具"));
        await reg.addLedger(order.seller, sellerNet, "market", "售出 " + (order.itemName || "道具") + (fee > 0n ? "（手续费" + String(fee) + "）" : ""));
        return jsonRes({ok: true, buyer: name, price: String(price), fee: String(fee)});
      }

      case "/market/cancel": {
        if (request.method !== "POST") return jsonRes({error: "请使用POST"}, 405);
        let body = await request.json();
        let name = body.name;
        let orderId = body.orderId;
        if (!name || !orderId) return jsonRes({error: "请提供用户名和订单ID"}, 400);
        if (!tokenValid(reg.registeredUsers.get(name), body.token || "")) {
          return jsonRes({error: "请先登录"}, 403);
        }
        let order = reg.marketOrders.find(o => o.id === orderId);
        if (!order) return jsonRes({error: "订单不存在"}, 404);
        if (order.seller !== name) return jsonRes({error: "只能撤销自己的挂单"}, 403);
        if (order.status !== "open") return jsonRes({error: "订单已成交，无法撤销"}, 400);
        // 🔒 F2：同步变更（首个 await 前），物品退回卖家背包
        order.status = "cancelled";
        order.cancelledAt = Date.now();
        if (!reg.userInventory.has(name)) reg.userInventory.set(name, new Map());
        reg.userInventory.get(name).set(order.itemId, {purchasedAt: order.purchasedAt || order.createdAt, equipped: false});
        pruneSettled();
        await reg.saveMarketOrders();
        await reg.saveUserInventory();
        return jsonRes({ok: true});
      }

      // ---------- 管理端点（registry adminExactPaths 统一鉴权，此处纵深重复校验可选） ----------
      case "/admin/market/config": {
        if (request.method === "GET") return jsonRes(reg.marketConfig);
        if (request.method !== "POST") return jsonRes({error: "请使用POST"}, 405);
        let body = await request.json();
        let updates = {};
        if (body.feePercent !== undefined) {
          let fp = String(body.feePercent).trim();
          if (!/^\d+$/.test(fp) || parseInt(fp, 10) < 0 || parseInt(fp, 10) > 50) return jsonRes({error: "手续费比例须为0-50整数"}, 400);
          updates.feePercent = parseInt(fp, 10);
        }
        if (body.maxOpenOrders !== undefined) {
          let mo = String(body.maxOpenOrders).trim();
          if (!/^\d+$/.test(mo) || parseInt(mo, 10) < 1 || parseInt(mo, 10) > 1000) return jsonRes({error: "挂单上限须为1-1000整数"}, 400);
          updates.maxOpenOrders = parseInt(mo, 10);
        }
        if (body.maxPrice !== undefined) {
          let mp = String(body.maxPrice).trim();
          if (!/^[1-9]\d*$/.test(mp)) return jsonRes({error: "价格上限无效"}, 400);
          updates.maxPrice = mp;
        }
        if (body.enabled !== undefined) updates.enabled = !!body.enabled;
        Object.assign(reg.marketConfig, updates);
        await reg.saveMarketConfig();
        return jsonRes({ok: true, config: reg.marketConfig});
      }

      case "/admin/market/orders": {
        let arr = reg.marketOrders.slice();
        let status = url.searchParams.get("status");
        if (status) arr = arr.filter(o => o.status === status);
        arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        let limit = parseInt(url.searchParams.get("limit")) || 200;
        if (limit > 500) limit = 500;
        let offset = parseInt(url.searchParams.get("offset")) || 0;
        return jsonRes({total: arr.length, orders: arr.slice(offset, offset + limit)});
      }

      case "/admin/market/delist": {
        if (request.method !== "POST") return jsonRes({error: "请使用POST"}, 405);
        let body = await request.json();
        let order = reg.marketOrders.find(o => o.id === body.orderId);
        if (!order) return jsonRes({error: "订单不存在"}, 404);
        if (order.status !== "open") return jsonRes({error: "订单不可下架"}, 400);
        // 🔒 F2：同步变更，物品退回卖家背包（快照同 cancel 逻辑）
        let seller = order.seller;
        order.status = "cancelled";
        order.cancelledAt = Date.now();
        if (!reg.userInventory.has(seller)) reg.userInventory.set(seller, new Map());
        reg.userInventory.get(seller).set(order.itemId, {purchasedAt: order.purchasedAt || order.createdAt, equipped: false});
        pruneSettled();
        await reg.saveMarketOrders();
        await reg.saveUserInventory();
        return jsonRes({ok: true});
      }

      default:
        return null; // registry 兜底 404
    }
  } catch (e) {
    // 🔒 L1 脱敏：不泄露内部错误细节
    console.error("market handler error:", e && e.message);
    return jsonRes({error: "市场服务暂时不可用"}, 500);
  }
}
