// v1.46 OAuth 绑定/登录/注册（registry 层服务端）
// 端点：store-state / consume-state / login-or-register / unbind / bindings
// 依赖 reg.oauthStates（Map<state,{provider,redirectUri,preAuthName,createdAt}>，持久化 key "oauthStates"）
// 与 registerByIp 限频（同 users.mjs /user-register 逻辑，每 IP 每日 3 个）
import { tokenValid, safeEqual, sha256 } from "../utils.mjs";

// 32B hex token（同 users.mjs /user-login）
function genToken() {
  let b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

// n 字节 hex
function genHex(n) {
  let b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

export async function handleOauth(reg, request, url) {
  switch (url.pathname) {
    // ---------- state 生命周期（PKCE/CSRF 防篡改，10 分钟过期，消费即删） ----------
    case "/oauth/store-state": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let state = body.state, provider = body.provider;
      if (!state || !provider) return new Response(JSON.stringify({error: "缺少 state 或 provider"}), {status: 400});
      if (!reg.oauthStates) reg.oauthStates = new Map();
      reg.oauthStates.set(state, {provider, redirectUri: body.redirectUri || "", preAuthName: body.preAuthName || "", createdAt: Date.now()});
      await reg.saveOauthStates();
      return new Response(JSON.stringify({ok: true}));
    }

    case "/oauth/consume-state": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let state = body.state;
      if (!state) return new Response(JSON.stringify({error: "缺少 state"}), {status: 400});
      if (!reg.oauthStates || !reg.oauthStates.has(state)) return new Response(JSON.stringify({error: "state无效"}), {status: 400});
      let record = reg.oauthStates.get(state);
      if (Date.now() - record.createdAt > 600000) {
        reg.oauthStates.delete(state);
        await reg.saveOauthStates();
        return new Response(JSON.stringify({error: "已过期"}), {status: 400});
      }
      reg.oauthStates.delete(state); // 消费即删
      await reg.saveOauthStates();
      return new Response(JSON.stringify({ok: true, record}));
    }

    // ---------- OAuth 登录/注册（绑定流程 / 已有绑定登录 / 新账号注册） ----------
    case "/oauth/login-or-register": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let provider = body.provider;
      if (!provider || body.providerId == null) return new Response(JSON.stringify({error: "缺少 provider 或 providerId"}), {status: 400});
      let providerId = String(body.providerId); // 统一 String 化
      let preAuthName = body.preAuthName || "";
      let avatar = body.avatar || "";
      let now = Date.now();

      // 绑定流程：本地已注册账号（用户名+密码）把 OAuth 绑定上去
      if (preAuthName) {
        let user = reg.registeredUsers.get(preAuthName);
        if (!user) return new Response(JSON.stringify({error: "用户不存在"}), {status: 404});
        if (!user.oauth) user.oauth = [];
        let idx = user.oauth.findIndex(o => o.provider === provider);
        if (idx >= 0) user.oauth[idx] = {provider, providerId, avatar};
        else user.oauth.push({provider, providerId, avatar});
        user.oauthOnly = false;
        user.token = genToken();
        user.tokenExpiry = now + 30 * 24 * 3600 * 1000;
        await reg.saveRegisteredUsers();
        return new Response(JSON.stringify({ok: true, name: preAuthName, token: user.token, created: false, bound: true}));
      }

      // 已有绑定：线性扫描 oauth 匹配 → 登录（重新签发 token）
      for (let [name, user] of reg.registeredUsers) {
        if (Array.isArray(user.oauth) && user.oauth.some(o => o.provider === provider && String(o.providerId) === String(providerId))) {
          user.token = genToken();
          user.tokenExpiry = now + 30 * 24 * 3600 * 1000;
          await reg.saveRegisteredUsers();
          return new Response(JSON.stringify({ok: true, name, token: user.token, created: false}));
        }
      }

      // ---------- 注册分支 ----------
      // registerByIp 限频（复制 users.mjs /user-register L62-81：每 IP 每日 3 个，超限 429）
      let rip = body.ip || "";
      if (rip) {
        if (!reg.registerByIp) {
          reg.registerByIp = new Map();
          try {
            let raw = await reg.storage.get("registerByIp");
            if (raw) {
              let parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) reg.registerByIp = new Map(parsed);
            }
          } catch (e) {}
        }
        let today = new Date().toISOString().slice(0, 10);
        let rec = reg.registerByIp.get(rip);
        if (!rec || rec.date !== today) rec = {date: today, count: 0};
        if (rec.count >= 3) return new Response(JSON.stringify({error: "注册太频繁，请稍后再试"}), {status: 429});
        rec.count++;
        reg.registerByIp.set(rip, rec);
        try { await reg.storage.put("registerByIp", JSON.stringify([...reg.registerByIp])); } catch (e) {}
      }

      // 用户名清洗：去非法字符 + 截断 32；空则 provider_user；冲突依次 name_2..name_9；仍占则 gh_<providerId12>
      let name = String(body.username || "").replace(/[<>&"'\\]/g, "").slice(0, 32);
      if (!name) name = provider + "_user";
      let base = name;
      if (reg.registeredUsers.has(name)) {
        let i = 2;
        for (; i <= 9; i++) {
          let cand = base + "_" + i;
          if (!reg.registeredUsers.has(cand)) { name = cand; break; }
        }
        if (i > 9) name = "gh_" + String(providerId).slice(0, 12);
      }

      // 防账户接管：注册前再查一次（并发重复回调时命中即拒，绝不创建重复账号顶替他人）
      for (let [n, user] of reg.registeredUsers) {
        if (Array.isArray(user.oauth) && user.oauth.some(o => o.provider === provider && String(o.providerId) === String(providerId))) {
          return new Response(JSON.stringify({error: "该 OAuth 账号已绑定其他用户"}), {status: 409});
        }
      }

      // 建号：随机不可登录密码（oauthOnly 用户只能通过 OAuth 登录），盐 16B hex
      let salt = genHex(16);
      let randomPwd = genHex(32);
      let passwordHash = await sha256(salt + randomPwd);
      reg.registeredUsers.set(name, {
        passwordHash, salt,
        oauth: [{provider, providerId, avatar}],
        oauthOnly: true,
        token: genToken(),
        tokenExpiry: now + 30 * 24 * 3600 * 1000,
        avatar: avatar || "",
        bio: "",
        anonCoupons: 0,
        exp: 0,
        achievements: [],
        stats: {msgCount: 0, checkinCount: 0, gameWins: 0, shopCount: 0},
        registeredAt: now
      });
      await reg.saveRegisteredUsers();
      let token = reg.registeredUsers.get(name).token;
      return new Response(JSON.stringify({ok: true, name, token, created: true}));
    }

    // ---------- 解绑 OAuth ----------
    case "/oauth/unbind": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let name = body.name, token = body.token || "", provider = body.provider;
      if (!name || !provider) return new Response(JSON.stringify({error: "缺少参数"}), {status: 400});
      let user = reg.registeredUsers.get(name);
      if (!tokenValid(user, token)) return new Response(JSON.stringify({error: "身份验证失败"}), {status: 403});
      if (!Array.isArray(user.oauth)) user.oauth = [];
      user.oauth = user.oauth.filter(o => o.provider !== provider);
      if (!user.oauth.length && user.oauthOnly) {
        return new Response(JSON.stringify({error: "请先设置密码或保留一个登录方式"}), {status: 400});
      }
      await reg.saveRegisteredUsers();
      return new Response(JSON.stringify({ok: true}));
    }

    // ---------- 查询我的绑定列表 ----------
    case "/oauth/bindings": {
      let name = url.searchParams.get("name");
      let token = url.searchParams.get("token") || "";
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      let user = reg.registeredUsers.get(name);
      if (!tokenValid(user, token)) return new Response(JSON.stringify({error: "身份验证失败"}), {status: 403});
      return new Response(JSON.stringify({oauth: user.oauth || [], oauthOnly: !!user.oauthOnly}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    default:
      return null;
  }
}
