// 自定义表情管理

export async function handleEmoji(reg, request, url) {
  switch (url.pathname) {
    case "/emoji/list": {
      let result = {};
      for (let [name, data] of reg.emoji) {
        result[name] = data;
      }
      return new Response(JSON.stringify(result), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/emoji/add": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      try {
        let body = await request.json();
        let name = (body.name || "").trim();
        let data = body.data || "";
        if (!name || !data) return new Response(JSON.stringify({error: "请提供表情名称和图片数据"}), {status: 400});
        if (!/^[a-zA-Z0-9_一-鿿]+$/.test(name)) {
          return new Response(JSON.stringify({error: "表情名称只能包含字母、数字、下划线和中文"}), {status: 400});
        }
        if (name.length > 20) return new Response(JSON.stringify({error: "表情名称过长"}), {status: 400});
        // 🔒 安全修复（LD6）：表情图片数据必须是 data:image/... 且拒绝 svg+xml（防存储型 XSS 经 :表情: 渲染触发）
        if (!/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(data) || /^data:image\/svg\+xml/i.test(data)) {
          return new Response(JSON.stringify({error: "表情图片格式不合法，仅支持 png/jpg/gif/webp"}), {status: 400});
        }
        reg.emoji.set(name, data);
        await reg.saveEmoji();
        return new Response(JSON.stringify({ok: true, name}), {
          headers: {"Content-Type": "application/json"}
        });
      } catch (e) {
        return new Response(JSON.stringify({error: "请求解析失败"}), {status: 400});
      }
    }

    case "/emoji/remove": {
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({error: "请提供表情名称"}), {status: 400});
      if (reg.emoji.has(name)) {
        reg.emoji.delete(name);
        await reg.saveEmoji();
        return new Response(JSON.stringify({ok: true}));
      }
      return new Response(JSON.stringify({error: "表情不存在"}), {status: 404});
    }

    default:
      return null;
  }
}
