// 机器人命令管理

export async function handleBot(reg, request, url) {
  switch (url.pathname) {
    case "/bot-commands": {
      let action = url.searchParams.get("action") || "list";
      if (action === "list") {
        let result = [];
        for (let [keyword, cmd] of reg.botCommands) {
          result.push({keyword, ...cmd});
        }
        return new Response(JSON.stringify(result), {headers: {"Content-Type": "application/json"}});
      }
      if (action === "get") {
        let keyword = url.searchParams.get("keyword");
        let cmd = reg.botCommands.get(keyword);
        if (!cmd) return new Response(JSON.stringify({error: "命令不存在"}), {status: 404});
        return new Response(JSON.stringify({keyword, ...cmd}), {headers: {"Content-Type": "application/json"}});
      }
      if (action === "add" || action === "update") {
        if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
        let body = await request.json();
        let kw = body.keyword;
        if (!kw) return new Response(JSON.stringify({error: "请提供关键词"}), {status: 400});
        let cmd = {response: body.response || "", enabled: body.enabled !== false};
        reg.botCommands.set(kw, cmd);
        await reg.saveBotCommands();
        return new Response(JSON.stringify({ok: true, keyword: kw}));
      }
      if (action === "delete") {
        let keyword = url.searchParams.get("keyword");
        if (!keyword) return new Response(JSON.stringify({error: "请提供关键词"}), {status: 400});
        reg.botCommands.delete(keyword);
        await reg.saveBotCommands();
        return new Response(JSON.stringify({ok: true}));
      }
      return new Response(JSON.stringify({error: "未知操作"}), {status: 400});
    }

    default:
      return null;
  }
}
