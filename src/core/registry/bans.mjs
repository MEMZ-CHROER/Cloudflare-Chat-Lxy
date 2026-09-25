// 用户封禁 + IP 封禁

export async function handleBans(reg, request, url) {
  switch (url.pathname) {
    case "/ban": {
      let name = url.searchParams.get("name");
      if (!name) return new Response("请提供用户名", { status: 400 });
      reg.banned.add(name);
      await reg.saveBanned();
      return new Response(name + " 已被封禁", { status: 200 });
    }

    case "/unban": {
      let name = url.searchParams.get("name");
      if (!name) return new Response("请提供用户名", { status: 400 });
      reg.banned.delete(name);
      await reg.saveBanned();
      return new Response(name + " 已被解封", { status: 200 });
    }

    case "/banned-list": {
      return new Response(JSON.stringify([...reg.banned]), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/is-banned": {
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({banned: false}), {
        headers: {"Content-Type": "application/json"}
      });
      return new Response(JSON.stringify({banned: reg.banned.has(name)}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/ip-ban": {
      let ip = url.searchParams.get("ip");
      if (!ip) return new Response("请提供IP地址", { status: 400 });
      reg.bannedIps.add(ip);
      await reg.saveBannedIps();
      return new Response("IP " + ip + " 已被封禁", { status: 200 });
    }

    case "/ip-unban": {
      let ip = url.searchParams.get("ip");
      if (!ip) return new Response("请提供IP地址", { status: 400 });
      reg.bannedIps.delete(ip);
      await reg.saveBannedIps();
      return new Response("IP " + ip + " 已被解封", { status: 200 });
    }

    case "/ip-banned-list": {
      return new Response(JSON.stringify([...reg.bannedIps]), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/is-ip-banned": {
      let ip = url.searchParams.get("ip");
      if (!ip) return new Response(JSON.stringify({banned: false}), {
        headers: {"Content-Type": "application/json"}
      });
      return new Response(JSON.stringify({banned: reg.bannedIps.has(ip)}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/kick-protected-list":
      return new Response(JSON.stringify([...reg.kickProtected]), {
        headers: {"Content-Type": "application/json"}
      });

    case "/is-kick-protected": {
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({protected: false}), {
        headers: {"Content-Type": "application/json"}
      });
      return new Response(JSON.stringify({protected: reg.kickProtected.has(name)}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/kick-protect": {
      let name = url.searchParams.get("name");
      if (!name) return new Response("请提供用户名", { status: 400 });
      reg.kickProtected.add(name);
      await reg.saveKickProtected();
      return new Response(name + " 已被设置为不可踢出", { status: 200 });
    }

    case "/kick-unprotect": {
      let name = url.searchParams.get("name");
      if (!name) return new Response("请提供用户名", { status: 400 });
      reg.kickProtected.delete(name);
      await reg.saveKickProtected();
      return new Response(name + " 的踢出保护已移除", { status: 200 });
    }

    default:
      return null;
  }
}
