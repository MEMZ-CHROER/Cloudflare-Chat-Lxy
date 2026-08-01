// 管理密钥 + combined-auth + 用户库存查询

// 🔒 安全修复（A10）：常量时间字符串比较
function safeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function handleAdmin(reg, request, url) {
  switch (url.pathname) {
    case "/admin-key/get": {
      return new Response(JSON.stringify({key: reg.adminKey}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/admin-key/set": {
      let newKey = url.searchParams.get("key");
      if (!newKey) return new Response("请提供新密钥", { status: 400 });
      reg.adminKey = newKey;
      await reg.saveAdminKey();
      return new Response("普通管理员密钥已更新", { status: 200 });
    }

    case "/admin-key/reset": {
      let defaultKey = url.searchParams.get("default") || "";
      // 🔒 安全修复（A5）：禁止将管理员密钥设为空值（否则空 key 可能绕过认证获得管理员权限）
      if (!defaultKey) return new Response("默认密钥不能为空，请提供非空值", { status: 400 });
      reg.adminKey = defaultKey;
      await reg.saveAdminKey();
      return new Response("普通管理员密钥已重置为默认值", { status: 200 });
    }

    case "/combined-auth": {
      let input = url.searchParams.get("key");
      if (!input) return new Response(JSON.stringify({level: null}));
      if (safeEqual(input, reg.adminKey)) {
        return new Response(JSON.stringify({level: "admin"}), {
          headers: {"Content-Type": "application/json"}
        });
      }
      // 🔒 标签用户名登录已临时关闭（防止爆破）
      // 后续如需恢复，取消注释以下代码即可
      /*
      let td = reg.tags.get(input);
      if (td) {
        let color = typeof td === "string" ? "" : (td.color || "");
        if (color === "cyan") {
          return new Response(JSON.stringify({level: "admin"}), {
            headers: {"Content-Type": "application/json"}
          });
        }
        if (color === "red") {
          return new Response(JSON.stringify({level: "super"}), {
            headers: {"Content-Type": "application/json"}
          });
        }
      }
      */
      return new Response(JSON.stringify({level: null}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/admin/user-inventory": {
      let result = [];
      for (let [username, items] of reg.userInventory) {
        let allItems = [];
        for (let [itemId, info] of items) {
          let item = reg.shopItems.get(itemId);
          allItems.push({
            itemId,
            itemName: item ? item.name : (info.fromLottery ? info.prizeName : "未知商品"),
            tag: item ? item.tag : (info.tag || ""),
            color: item ? item.color : (info.color || ""),
            border: item ? (item.border || "") : (info.border || ""),
            purchasedAt: info.purchasedAt,
            equipped: info.equipped || false
          });
        }
        result.push({username, items: allItems});
      }
      return new Response(JSON.stringify(result), {
        headers: {"Content-Type": "application/json"}
      });
    }

    default:
      return null;
  }
}
