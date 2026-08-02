import { tokenValid } from "../utils.mjs";
// 商城系统 + 管理员商城 CRUD

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

export async function handleShop(reg, request, url) {
  switch (url.pathname) {
    case "/shop/items": {
      let result = [];
      for (let [id, item] of reg.shopItems) {
        if (item.enabled !== false) {
          result.push({id, name: item.name, description: item.description, price: item.price, tag: item.tag, color: item.color, border: item.border || ""});
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
      if (!reg.userInventory.has(name)) reg.userInventory.set(name, new Map());
      let inv = reg.userInventory.get(name);
      if (inv.has(itemId)) return new Response(JSON.stringify({error: "已拥有此商品"}), {status: 400});
      reg.userPoints.set(name, String(pts - price));
      await reg.savePoints();
      await reg.addLedger(name, -price, "shop", "购买商品 #" + itemId);
      inv.set(itemId, {purchasedAt: Date.now(), equipped: false});
      await reg.saveUserInventory();
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
      // 🔒 安全修复（LD20）：禁止通过商城商品获得管理标签（red/cyan=管理员/超管），防止普通用户静默提权
      let itTag = (item.tag || "").toUpperCase();
      if (itTag === "RED" || itTag === "CYAN") {
        return new Response(JSON.stringify({error: "该标签为管理专用，无法装备"}), {status: 400});
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
        result.push({id, name: item.name, description: item.description, price: item.price, tag: item.tag, color: item.color, border: item.border || "", enabled: item.enabled !== false});
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

    default:
      return null;
  }
}
