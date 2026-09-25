// 全局黑名单

export async function handleBlacklist(reg, request, url) {
  switch (url.pathname) {
    case "/global-blacklist/add": {
      let name = url.searchParams.get("name");
      if (!name) return new Response("请提供用户名", { status: 400 });
      reg.globalBlacklist.add(name);
      await reg.saveGlobalBlacklist();
      return new Response(name + " 已被加入全局黑名单，无法踢人", { status: 200 });
    }

    case "/global-blacklist/remove": {
      let name = url.searchParams.get("name");
      if (!name) return new Response("请提供用户名", { status: 400 });
      reg.globalBlacklist.delete(name);
      await reg.saveGlobalBlacklist();
      return new Response(name + " 已被移出全局黑名单", { status: 200 });
    }

    case "/global-blacklist/list": {
      return new Response(JSON.stringify([...reg.globalBlacklist]), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/is-globally-blacklisted": {
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({blacklisted: false}), {
        headers: {"Content-Type": "application/json"}
      });
      return new Response(JSON.stringify({blacklisted: reg.globalBlacklist.has(name)}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    default:
      return null;
  }
}
