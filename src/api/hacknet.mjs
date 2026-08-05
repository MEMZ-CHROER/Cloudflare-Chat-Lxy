// v1.43 Hacknet 对战小游戏 API 层 — 玩家 token 鉴权 + 转发 registry /hn/*
// 复用 user-check-auth（token→name 常量时间比较，users.mjs）——非注册用户不能玩
// 端点：
//   GET  /api/hn/status?name=&token=
//   POST /api/hn/new|accept|connect|disconnect|action|quit|ticket  {name,token,...}

const ACTIONS = new Set(["new", "accept", "status", "connect", "disconnect", "action", "quit", "ticket"]);

const jres = (obj, status) => new Response(JSON.stringify(obj), {
  status: status || 200, headers: { "Content-Type": "application/json" }
});

async function checkAuth(stub, name, token) {
  try {
    let r = await stub.fetch(new URL(
      "https://dummy-url/user-check-auth?name=" + encodeURIComponent(name) + "&token=" + encodeURIComponent(token)
    ));
    let d = await r.json();
    return !!d.authenticated;
  } catch (e) { return false; }
}

export async function handleHacknetApi(apiPath, request, env) {
  let action = apiPath[1] || "";
  if (!ACTIONS.has(action)) return new Response("未找到", { status: 404 });

  let url = new URL(request.url);
  let rid = env.registry.idFromName("global");
  let stub = env.registry.get(rid);

  let qs;
  if (action === "status") {
    // status：优先走 sid（轻量，省 user-check-auth）；无 sid 时 name+token 校验一次
    if (request.method !== "GET" && request.method !== "POST") return jres({ error: "方法不允许" }, 405);
    let sid = url.searchParams.get("sid") || "";
    qs = new URLSearchParams(url.search);
    qs.delete("token"); // token 不转发 registry
    if (sid) {
      // 轻量路径：只转发 sid（registry 内存会话校验）
    } else {
      let name = url.searchParams.get("name") || "";
      let token = url.searchParams.get("token") || "";
      if (!name) return jres({ error: "缺少玩家名" }, 400);
      if (!(await checkAuth(stub, name, token))) return jres({ error: "请先登录" }, 403);
    }
  } else {
    if (request.method !== "POST") return jres({ error: "请使用POST" }, 405);
    let body = await request.json().catch(() => ({}));
    let name = String(body.name || "");
    let token = String(body.token || "");
    if (!name) return jres({ error: "缺少玩家名" }, 400);
    // 🔒 token → name 校验，防冒名（开局/攻击/认输/入场）
    if (!(await checkAuth(stub, name, token))) return jres({ error: "请先登录（注册账号并登录后游玩）" }, 403);
    qs = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (k === "token") continue; // token 不转发 registry（api 层已验）
      if (v === undefined || v === null) continue;
      qs.set(k, String(v));
    }
  }

  let r = await stub.fetch(new URL("https://dummy-url/hn/" + action + "?" + qs.toString()));
  let text = await r.text();
  let ct = r.headers.get("Content-Type") || "";
  if (ct.includes("application/json")) return new Response(text, { status: r.status, headers: { "Content-Type": "application/json" } });
  return new Response(text, { status: r.status });
}
