// v1.46 OAuth API 层 - start/callback/unbind/bindings/status
// 负责：state 生成与存储、跳转第三方授权、回调换 token + 拉用户信息、转发 registry 登录/注册/解绑/绑定查询。
// 凭证只从环境变量读取，服务端不透传密钥到前端（client_secret 仅用于换取 access_token）。

import { OAUTH_PROVIDERS } from "../oauth-providers.mjs";

// n 字节随机 hex（32B → 64 位 state）
function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function jsonRes(body, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleOauthApi(apiPath, request, env) {
  const url = new URL(request.url);
  const origin = url.origin;
  const action = apiPath[1];

  // ---------- start/<provider>：生成 state → 存 registry → 跳第三方授权页 ----------
  if (action === "start") {
    if (request.method !== "GET") return jsonRes({ error: "请使用GET" }, 405);
    const provider = OAUTH_PROVIDERS.find((p) => p.id === apiPath[2]);
    if (!provider) return jsonRes({ error: "不支持的第三方平台" }, 404);
    // 凭证未配置（clientIdEnv 无值）→ 未启用
    if (!env[provider.clientIdEnv]) return jsonRes({ error: "第三方登录未启用" }, 403);

    const state = randomHex(32);
    const redirect_uri = origin + provider.redirectPath;
    const name = url.searchParams.get("name") || "";
    const token = url.searchParams.get("token") || "";
    let preAuthName = "";

    const registryId = env.registry.idFromName("global");
    const stub = env.registry.get(registryId);
    // 绑定流程：query 带已登录账号且校验通过 → preAuthName=name，OAuth 绑定到该账号
    if (name && token) {
      try {
        const authCheck = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(name) + "&token=" + encodeURIComponent(token)));
        const authData = await authCheck.json();
        if (authData.authenticated) preAuthName = name;
      } catch (e) { /* 校验失败则不绑定，按新用户 OAuth 登录处理 */ }
    }
    await stub.fetch(new URL("https://dummy-url/oauth/store-state"), {
      method: "POST",
      body: JSON.stringify({ state, provider: provider.id, redirectUri: redirect_uri, preAuthName }),
      headers: { "Content-Type": "application/json" },
    });

    if (provider.mock) {
      // 测试 mock 流程：同源直接跳回调（code=mock）
      return new Response(null, {
        status: 302,
        headers: { Location: origin + "/api/oauth/callback/" + provider.id + "?code=mock&state=" + encodeURIComponent(state) },
      });
    }
    // 真实 OAuth 授权页跳转
    const sep = provider.authUrl.includes("?") ? "&" : "?";
    const target = provider.authUrl + sep
      + "client_id=" + encodeURIComponent(env[provider.clientIdEnv])
      + "&redirect_uri=" + encodeURIComponent(redirect_uri)
      + "&scope=" + encodeURIComponent(provider.scopes)
      + "&state=" + encodeURIComponent(state);
    return new Response(null, { status: 302, headers: { Location: target } });
  }

  // ---------- callback/<provider>：消费 state → 换 token → 拉用户信息 → 登录/注册/绑定 ----------
  if (action === "callback") {
    if (request.method !== "GET") return jsonRes({ error: "请使用GET" }, 405);
    const provider = OAUTH_PROVIDERS.find((p) => p.id === apiPath[2]);
    if (!provider) return jsonRes({ error: "不支持的第三方平台" }, 404);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    if (!code || !state) return jsonRes({ error: "缺少 code 或 state" }, 400);

    const registryId = env.registry.idFromName("global");
    const stub = env.registry.get(registryId);
    // 消费 state（一次性，registry 层消费即删 + 10 分钟过期）
    const consume = await stub.fetch(new URL("https://dummy-url/oauth/consume-state"), {
      method: "POST",
      body: JSON.stringify({ state }),
      headers: { "Content-Type": "application/json" },
    });
    let cd;
    try { cd = await consume.json(); } catch (e) { cd = {}; }
    if (!consume.ok || !cd.ok || !cd.record) return jsonRes({ error: "state 无效或已过期" }, 400);
    const record = cd.record;
    if (record.provider !== provider.id) return jsonRes({ error: "state 与平台不匹配" }, 400);
    const expectedRedirect = origin + provider.redirectPath;
    if (record.redirectUri !== expectedRedirect) return jsonRes({ error: "回调地址不匹配" }, 400);

    let info;
    if (!provider.mock) {
      // code 换 access_token（GitHub 返回 JSON）
      const tokenResp = await fetch(provider.tokenUrl, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: env[provider.clientIdEnv],
          client_secret: env[provider.clientSecretEnv],
          code,
          redirect_uri: expectedRedirect,
        }),
      });
      const tokenData = await tokenResp.json();
      const accessToken = tokenData.access_token;
      if (!accessToken) return jsonRes({ error: "获取 access_token 失败" }, 400);
      const infoResp = await fetch(provider.userInfoUrl, {
        headers: { Authorization: "Bearer " + accessToken },
      });
      info = await infoResp.json();
    } else {
      // mock 分支：不请求外部，构造假用户
      info = { id: "mock_" + provider.id, login: "mock_user_" + provider.id, avatar_url: "" };
    }

    const oauthRecord = {
      provider: provider.id,
      providerId: String(info[provider.idField]),
      username: info[provider.usernameField],
      avatar: info[provider.avatarField] || "",
    };
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const r = await stub.fetch(new URL("https://dummy-url/oauth/login-or-register"), {
      method: "POST",
      body: JSON.stringify({ ...oauthRecord, preAuthName: record.preAuthName || "", ip }),
      headers: { "Content-Type": "application/json" },
    });
    let rj;
    try { rj = await r.json(); } catch (e) { rj = {}; }

    // 最小 HTML 回写登录态（内联 JSON 中所有 </script 必须转义为 <\/script，防闭合注入）
    const payload = JSON.stringify({
      ok: !!(rj && rj.ok),
      name: (rj && rj.name) || "",
      token: (rj && rj.token) || "",
      error: (rj && rj.error) || "",
    }).replace(/<\//g, "<\\/");
    const html = `<!doctype html><meta charset="utf-8"><title>登录中...</title><script>const r=${payload};if(r&&r.ok){localStorage.setItem("chat_token",r.token);localStorage.setItem("chat_user",r.name);location.href="/";}else{alert((r&&r.error)||"登录失败");location.href="/";}<\/script>`;
    return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8", "X-Content-Type-Options": "nosniff" } });
  }

  // ---------- unbind：转发 registry /oauth/unbind（body: name/token/provider） ----------
  if (action === "unbind") {
    if (request.method !== "POST") return jsonRes({ error: "请使用POST" }, 405);
    const body = await request.json();
    const registryId = env.registry.idFromName("global");
    const stub = env.registry.get(registryId);
    const r = await stub.fetch(new URL("https://dummy-url/oauth/unbind"), {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } });
  }

  // ---------- bindings：转发 registry /oauth/bindings（?name=&token=） ----------
  if (action === "bindings") {
    const name = url.searchParams.get("name") || "";
    const token = url.searchParams.get("token") || "";
    const registryId = env.registry.idFromName("global");
    const stub = env.registry.get(registryId);
    const r = await stub.fetch(new URL("https://dummy-url/oauth/bindings?name=" + encodeURIComponent(name) + "&token=" + encodeURIComponent(token)));
    return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } });
  }

  // ---------- status：前端决定显示哪些 OAuth 登录按钮 ----------
  if (action === "status") {
    const providers = OAUTH_PROVIDERS.filter((p) => !p.mock && env[p.clientIdEnv]).map((p) => p.id);
    const mock = env.OAUTH_MOCK === "1";
    return jsonRes({ providers, mock });
  }

  return jsonRes({ error: "未找到" }, 404);
}
