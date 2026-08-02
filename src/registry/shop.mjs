import { tokenValid, getVipLevel } from "../utils.mjs";
// 商城系统 + 管理员商城 CRUD

// 🔒 M16：特权标签判定——聊天室 isAdminSession 认可 tag/color 为 red、cyan（管理员色），border 为 gold（超管金边）；
// getVipLevel 识别 VIP1-10/VIP+/MVP（VIP 权益标签）。普通用户不得经商城/抽奖获取这些标签。
function isPrivilegedTag(tag, color, border) {
  let t = String(tag || "").toLowerCase();
  let c = String(color || "").toLowerCase();
  let b = String(border || "").toLowerCase();
  if (t === "red" || t === "cyan" || c === "red" || c === "cyan" || b === "gold") return true;
  return !!getVipLevel(tag);
}

// 🔒 安全修复（E6）：BigInt 解析，防余额大数精度丢失
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

export async function handleShop(reg, request, url) {
  switch (url.pathname) {
    case "/shop/items": {
      let result = [];
      for (let [id, item] of reg.shopItems) {
        if (item.enabled !== false) {
          result.push({id, name: item.name, description: item.description, price: item.price, tag: item.tag, color: item.color, border: item.border || "", consumable: !!item.consumable});
        }
      }
      return new Response(JSON.stringify(result), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/shop/inventory": {
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({error: "no name"}), {status: 400});
      let userInv = reg.userInventory.get(name);
      let result = [];
      if (userInv) {
        for (let [itemId, info] of userInv) {
          let item = reg.shopItems.get(itemId);
          result.push({
            itemId,
            name: item ? item.name : "未知商品",
            tag: item ? item.tag : "",
            color: item ? item.color : "",
            border: item ? (item.border || "") : "",
            purchasedAt: info.purchasedAt,
            equipped: info.equipped || false
          });
        }
      }
      return new Response(JSON.stringify(result), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/shop/buy": {
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
      if (item.enabled === false) return new Response(JSON.stringify({error: "商品已下架"}), {status: 400});
      // 🔒 安全修复（E6）：余额/价格用 BigInt 运算，防大数精度丢失
      let pts = toBigInt(reg.userPoints.get(name));
      let price = toBigInt(item.price);
      if (pts < price) return new Response(JSON.stringify({error: "积分不足，需要 " + item.price + " 积分，当前 " + String(pts) + " 积分"}), {status: 400});
      // 🕶️ 消耗品（匿名券等）：不写入背包，可重复购买，计数到 user.anonCoupons
      if (item.consumable) {
        let u = reg.registeredUsers.get(name);
        if (!u) return new Response(JSON.stringify({error: "请先注册后再购买"}), {status: 400});
        reg.userPoints.set(name, String(pts - price));
        await reg.savePoints();
        await reg.addLedger(name, -price, "shop", "购买" + (item.name || "消耗品"));
        u.anonCoupons = (u.anonCoupons || 0) + 1;
        await reg.saveRegisteredUsers();
        // ⭐ 购物经验：消耗品也计入购物（+2 经验，shopCount 成就判定用）
        try { await reg.grantExp(name, 2, "shop"); } catch (e) {}
        return new Response(JSON.stringify({ok: true, name, itemId, consumable: true, anonCoupons: u.anonCoupons}), {
          headers: {"Content-Type": "application/json"}
        });
      }
      if (!reg.userInventory.has(name)) reg.userInventory.set(name, new Map());
      let inv = reg.userInventory.get(name);
      if (inv.has(itemId)) return new Response(JSON.stringify({error: "已拥有此商品"}), {status: 400});
      reg.userPoints.set(name, String(pts - price));
      await reg.savePoints();
      await reg.addLedger(name, -price, "shop", "购买商品 #" + itemId);
      inv.set(itemId, {purchasedAt: Date.now(), equipped: false});
      await reg.saveUserInventory();
      // ⭐ 购物经验：成功购买 +2 经验，计入 shopCount（成就判定用）
      try { await reg.grantExp(name, 2, "shop"); } catch (e) {}
      return new Response(JSON.stringify({ok: true, name, itemId}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/shop/equip": {
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
      let inv = reg.userInventory.get(name);
      if (!inv || !inv.has(itemId)) return new Response(JSON.stringify({error: "未拥有此商品"}), {status: 400});
      let item = reg.shopItems.get(itemId);
      if (!item) return new Response(JSON.stringify({error: "商品不存在"}), {status: 404});
      // 🔒 M16：禁止普通用户通过商城商品获得特权标签（管理员色 red/cyan、金色边框 gold、VIP 标签）。
      // 若购买者现有标签已含特权（管理员/VIP 本人），装备特权商品合理，放行。
      if (isPrivilegedTag(item.tag, item.color, item.border)) {
        let cur = reg.tags.get(name);
        if (!isPrivilegedTag(cur && cur.tag, cur && cur.color, cur && cur.border)) {
          return new Response(JSON.stringify({error: "该商品含特权标签（管理/VIP），无法装备"}), {status: 400});
        }
      }
      for (let [id, info] of inv) { if (info.equipped) info.equipped = false; }
      inv.get(itemId).equipped = true;
      await reg.saveUserInventory();
      reg.tags.set(name, {tag: item.tag, color: item.color, border: item.border || ""});
      await reg.saveTags();
      return new Response(JSON.stringify({ok: true, tag: item.tag, color: item.color, border: item.border || ""}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/shop/unequip": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let name = body.name;
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      // 🔒 S4 纵深防御：registry 层校验 token
      let regUser = reg.registeredUsers.get(name);
      if (!tokenValid(regUser, body.token || "")) {
        return new Response(JSON.stringify({error: "身份验证失败"}), {status: 403});
      }
      let inv = reg.userInventory.get(name);
      if (inv) {
        for (let [id, info] of inv) { if (info.equipped) info.equipped = false; }
        await reg.saveUserInventory();
      }
      reg.tags.set(name, {tag: "USER", color: "blue", border: ""});
      await reg.saveTags();
      return new Response(JSON.stringify({ok: true, tag: "USER", color: "blue", border: ""}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    // 管理员商城接口
    case "/admin/shop/items": {
      let result = [];
      for (let [id, item] of reg.shopItems) {
        result.push({id, name: item.name, description: item.description, price: item.price, tag: item.tag, color: item.color, border: item.border || "", enabled: item.enabled !== false, consumable: !!item.consumable});
      }
      return new Response(JSON.stringify(result), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/admin/shop/item/add": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      if (!body.name || !body.price || !body.tag) return new Response(JSON.stringify({error: "请提供商品名称、价格和标签"}), {status: 400});
      let itemId = "shop_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      reg.shopItems.set(itemId, {name: body.name, description: body.description || "", price: parseInt(body.price, 10), tag: body.tag, color: body.color || "", border: body.border || "", enabled: true});
      await reg.saveShopItems();
      return new Response(JSON.stringify({ok: true, itemId}), {headers: {"Content-Type": "application/json"}});
    }

    case "/admin/shop/item/toggle": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let id = body.itemId;
      if (!id) return new Response(JSON.stringify({error: "请提供商品ID"}), {status: 400});
      let item = reg.shopItems.get(id);
      if (!item) return new Response(JSON.stringify({error: "商品不存在"}), {status: 404});
      item.enabled = !item.enabled;
      await reg.saveShopItems();
      return new Response(JSON.stringify({ok: true, enabled: item.enabled}), {headers: {"Content-Type": "application/json"}});
    }

    case "/admin/shop/item/delete": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let id = body.itemId;
      if (!id) return new Response(JSON.stringify({error: "请提供商品ID"}), {status: 400});
      if (!reg.shopItems.has(id)) return new Response(JSON.stringify({error: "商品不存在"}), {status: 404});
      reg.shopItems.delete(id);
      await reg.saveShopItems();
      return new Response(JSON.stringify({ok: true}), {headers: {"Content-Type": "application/json"}});
    }

    // 🕶️ 匿名券：消耗一张，匿名发言一次（真实身份写审计日志，仅管理员可查）
    case "/anon/use": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let name = body.name;
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      let user = reg.registeredUsers.get(name);
      if (!tokenValid(user, body.token || "")) return new Response(JSON.stringify({error: "身份验证失败"}), {status: 403});
      let coupons = user.anonCoupons || 0;
      if (coupons <= 0) return new Response(JSON.stringify({error: "匿名券不足，可在商店购买"}), {status: 400});
      user.anonCoupons = coupons - 1;
      await reg.saveRegisteredUsers();
      // 审计日志：记录真实身份（上限 200 条，防 storage 膨胀）
      try {
        let channel = String(body.channel || "general").slice(0, 24);
        let raw = await reg.storage.get("anonLog");
        let arr = [];
        if (raw) { let p = JSON.parse(raw); if (Array.isArray(p)) arr = p; }
        arr.push({ts: Date.now(), realName: name, channel});
        if (arr.length > 200) arr = arr.slice(-200);
        await reg.storage.put("anonLog", JSON.stringify(arr));
      } catch (e) {}
      return new Response(JSON.stringify({ok: true, anonCoupons: user.anonCoupons}), {headers: {"Content-Type": "application/json"}});
    }

    // 🕶️ 管理员发放匿名券（registry.mjs adminExactPaths 已统一鉴权，此处纵深防御重复校验）
    case "/anon/grant": {
      if (!reg.adminAuthorized(url.searchParams.get("auth") || "")) return new Response("无权操作", { status: 403 });
      let name = url.searchParams.get("name");
      let count = parseInt(url.searchParams.get("count")) || 1;
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      if (count < 1 || count > 1000) return new Response(JSON.stringify({error: "数量需在1-1000之间"}), {status: 400});
      let user = reg.registeredUsers.get(name);
      if (!user) return new Response(JSON.stringify({error: "用户未注册"}), {status: 404});
      user.anonCoupons = (user.anonCoupons || 0) + count;
      await reg.saveRegisteredUsers();
      return new Response(JSON.stringify({ok: true, name, anonCoupons: user.anonCoupons}), {headers: {"Content-Type": "application/json"}});
    }

    // 🕶️ 匿名审计日志查询（管理员，最近 N 条）
    case "/anon/log": {
      if (!reg.adminAuthorized(url.searchParams.get("auth") || "")) return new Response("无权操作", { status: 403 });
      let limit = parseInt(url.searchParams.get("limit")) || 50;
      try {
        let raw = await reg.storage.get("anonLog");
        let arr = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr)) arr = [];
        return new Response(JSON.stringify(arr.slice(-limit)), {headers: {"Content-Type": "application/json"}});
      } catch (e) {
        return new Response(JSON.stringify([]), {headers: {"Content-Type": "application/json"}});
      }
    }

    default:
      return null;
  }
}
