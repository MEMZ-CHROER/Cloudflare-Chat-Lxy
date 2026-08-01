// 用户注册/登录/认证 + user-seen/ips
import { sha256, getVipLevel, getVipFeatures } from "../utils.mjs";

// 🔒 安全修复（LD11）：常量时间字符串比较，防 token 时序侧信道
function safeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function handleUsers(reg, request, url) {
  switch (url.pathname) {
    case "/user-seen": {
      let name = url.searchParams.get("name");
      let ip = url.searchParams.get("ip") || "";
      if (!name) return new Response("请提供用户名", { status: 400 });
      if (!reg.knownUsers.has(name)) {
        reg.knownUsers.add(name);
        await reg.saveKnownUsers();
      }
      if (ip) {
        reg.userIps.set(name, ip);
        await reg.saveUserIps();
      }
      return new Response("ok", { status: 200 });
    }

    case "/user-ips": {
      let result = {};
      for (let [name, ip] of reg.userIps) {
        result[name] = ip;
      }
      return new Response(JSON.stringify(result), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/known-users": {
      return new Response(JSON.stringify([...reg.knownUsers]), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/user-register": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let name = body.name;
      let password = body.password;
      if (!name || !password) return new Response(JSON.stringify({error: "请提供用户名和密码"}), {status: 400});
      if (name.length > 32) return new Response(JSON.stringify({error: "用户名过长"}), {status: 400});
      if (/[<>&"'\\]/.test(name)) return new Response(JSON.stringify({error: "用户名包含非法字符"}), {status: 400});
      // 🔒 安全修复（LD7）：服务端强制密码强度（至少6位），防止注册弱口令
      if (password.length < 6) return new Response(JSON.stringify({error: "密码至少6个字符"}), {status: 400});
      if (reg.registeredUsers.has(name)) return new Response(JSON.stringify({error: "用户名已被注册"}), {status: 409});
      // 🔒 安全修复（E4）：每 IP 每日最多注册 3 个账号，防批量注册小号铸币
      let rip = body.ip || "";
      if (rip) {
        if (!reg.registerByIp) reg.registerByIp = new Map();
        let today = new Date().toISOString().slice(0, 10);
        let rec = reg.registerByIp.get(rip);
        if (!rec || rec.date !== today) rec = {date: today, count: 0};
        if (rec.count >= 3) return new Response(JSON.stringify({error: "注册太频繁，请稍后再试"}), {status: 429});
        rec.count++;
        reg.registerByIp.set(rip, rec);
      }
      // 🔒 安全修复（LD10）：每用户随机盐 + sha256(salt+password)，防离线爆破/彩虹表
      let saltBytes = new Uint8Array(16);
      crypto.getRandomValues(saltBytes);
      let salt = Array.from(saltBytes, b => b.toString(16).padStart(2, '0')).join('');
      let hash = await sha256(salt + password);
      reg.registeredUsers.set(name, {passwordHash: hash, salt, token: null, tokenExpiry: null, avatar: "", bio: ""});
      await reg.saveRegisteredUsers();
      return new Response(JSON.stringify({ok: true}));
    }

    case "/user-login": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let name = body.name;
      let password = body.password;
      if (!name || !password) return new Response(JSON.stringify({error: "请提供用户名和密码"}), {status: 400});
      let user = reg.registeredUsers.get(name);
      if (!user) return new Response(JSON.stringify({error: "用户名或密码错误"}), {status: 401});
      let now = Date.now();
      // 🔒 安全修复（LD7）：登录失败锁定（5次失败锁30分钟）
      if (user.lockedUntil && user.lockedUntil > now) {
        return new Response(JSON.stringify({error: "尝试次数过多，请稍后再试"}), {status: 429});
      }
      // 🔒 安全修复（LD10）：带盐校验（兼容旧账号：无 salt 字段视为空盐）
      let salt = user.salt || "";
      let hash = await sha256(salt + password);
      if (hash !== user.passwordHash) {
        user.loginFails = (user.loginFails || 0) + 1;
        if (user.loginFails >= 5) {
          user.lockedUntil = now + 30 * 60 * 1000;
          user.loginFails = 0;
        }
        await reg.saveRegisteredUsers();
        return new Response(JSON.stringify({error: "用户名或密码错误"}), {status: 401});
      }
      user.loginFails = 0;
      user.lockedUntil = null;
      let tokenBytes = new Uint8Array(32);
      crypto.getRandomValues(tokenBytes);
      let token = Array.from(tokenBytes, b => b.toString(16).padStart(2, '0')).join('');
      // 🔒 安全修复（LD8）：token 带 30 天过期时间
      user.token = token;
      user.tokenExpiry = now + 30 * 24 * 3600 * 1000;
      await reg.saveRegisteredUsers();
      return new Response(JSON.stringify({ok: true, name, token}));
    }

    case "/user-logout": {
      // 🔒 安全修复（LD8）：服务端登出/吊销 token
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let name = body.name;
      let token = body.token || "";
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      let user = reg.registeredUsers.get(name);
      if (user && user.token && safeEqual(user.token, token)) {
        user.token = null;
        user.tokenExpiry = null;
        await reg.saveRegisteredUsers();
      }
      return new Response(JSON.stringify({ok: true}));
    }

    case "/user-avatar": {
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      let user = reg.registeredUsers.get(name);
      if (!user) return new Response(JSON.stringify({avatar: ""}));
      if (request.method === "POST") {
        let body = await request.json();
        // 🔒 H3 修复：修改头像必须验证 token，只能改自己的
        let token = body.token || "";
        if (!user || !(user.token && safeEqual(user.token, token))) return new Response(JSON.stringify({error: "请先登录后再修改头像"}), {status: 403});
        let avatar = body.avatar || "";
        if (avatar && avatar.length > 200000) return new Response(JSON.stringify({error: "头像文件过大"}), {status: 400});
        // 🔒 安全修复（LD5）：头像必须是 data:image/... 且拒绝 svg+xml（防存储型 XSS 经 /user 主页触发）
        if (avatar && (!/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(avatar) || /^data:image\/svg\+xml/i.test(avatar))) {
          return new Response(JSON.stringify({error: "头像格式不合法，仅支持 png/jpg/gif/webp"}), {status: 400});
        }
        user.avatar = avatar;
        await reg.saveRegisteredUsers();
        return new Response(JSON.stringify({ok: true}));
      }
      return new Response(JSON.stringify({avatar: user.avatar || ""}));
    }

    case "/user-bio": {
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      let user = reg.registeredUsers.get(name);
      if (!user) return new Response(JSON.stringify({bio: ""}));
      if (request.method === "POST") {
        let body = await request.json();
        // 🔒 H3 修复：修改简介必须验证 token，只能改自己的
        let token = body.token || "";
        if (!user || !(user.token && safeEqual(user.token, token))) return new Response(JSON.stringify({error: "请先登录后再修改简介"}), {status: 403});
        let bio = (body.bio || "").slice(0, 200);
        user.bio = bio;
        await reg.saveRegisteredUsers();
        return new Response(JSON.stringify({ok: true}));
      }
      return new Response(JSON.stringify({bio: user.bio || ""}));
    }

    case "/user-profile": {
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      let user = reg.registeredUsers.get(name);
      let td = reg.tags.get(name);
      let tag = "", color = "", border = "";
      if (td) {
        if (typeof td === "string") { tag = td; }
        else { tag = td.tag || ""; color = td.color || ""; border = td.border || ""; }
      }
      let pts = reg.userPoints.get(name) || 0;
      let vip = getVipLevel(tag);
      return new Response(JSON.stringify({
        name,
        avatar: user ? (user.avatar || "") : "",
        bio: user ? (user.bio || "") : "",
        tag, color, border,
        points: pts,
        registered: !!user,
        registeredAt: user ? (user.registeredAt || null) : null,
        vip: vip ? {level: vip.id, label: vip.label, tier: vip.tier} : null
      }), {headers: {"Content-Type": "application/json"}});
    }

    case "/user-check-auth": {
      let name = url.searchParams.get("name");
      let token = url.searchParams.get("token") || "";
      if (!name) return new Response(JSON.stringify({registered: false, authenticated: false}), {headers: {"Content-Type": "application/json"}});
      let user = reg.registeredUsers.get(name);
      if (!user) return new Response(JSON.stringify({registered: false, authenticated: false}), {headers: {"Content-Type": "application/json"}});
      // 🔒 安全修复（LD8/LD11）：token 常量时间比较 + 过期校验（过期视为未认证并清 token）
      let valid = user.token && (!user.tokenExpiry || user.tokenExpiry > Date.now()) && safeEqual(user.token, token);
      if (user.token && !valid) {
        user.token = null;
        user.tokenExpiry = null;
        await reg.saveRegisteredUsers();
      }
      return new Response(JSON.stringify({registered: true, authenticated: !!valid}), {headers: {"Content-Type": "application/json"}});
    }

    case "/user-init": {
      let name = url.searchParams.get("name");
      let ip = url.searchParams.get("ip") || "";
      let token = url.searchParams.get("token") || "";
      if (!name) return new Response(JSON.stringify({error: "no name"}), {status: 400});

      let banned = reg.banned.has(name);
      let ipBanned = reg.bannedIps.has(ip);

      let registered = false, authenticated = false;
      let uiUser = reg.registeredUsers.get(name);
      let userAvatar = "", userBio = "";
      if (uiUser) {
        registered = true;
        // 🔒 安全修复（LD8/LD11）：token 常量时间比较 + 过期校验
        authenticated = !!(uiUser.token && (!uiUser.tokenExpiry || uiUser.tokenExpiry > Date.now()) && safeEqual(uiUser.token, token));
        if (uiUser.avatar) userAvatar = uiUser.avatar;
        if (uiUser.bio) userBio = uiUser.bio;
      }

      let tag = "", color = "", border = "";
      let savePromises = [];

      // 安全：只有已认证（注册 + token 匹配）的用户才继承其存储的标签，
      // 否则任何人都可以冒充有 red/cyan 标签的用户名来获取管理权限
      if (registered && authenticated) {
        let td = reg.tags.get(name);
        if (td) {
          if (typeof td === "string") { tag = td; }
          else { tag = td.tag || ""; color = td.color || ""; border = td.border || ""; }
        }

        let shopEquippedTag = null;
        let userInv = reg.userInventory.get(name);
        if (userInv) {
          for (let [id, info] of userInv) {
            if (info.equipped) {
              let item = reg.shopItems.get(id);
              if (item) {
                shopEquippedTag = {tag: item.tag, color: item.color, border: item.border || ""};
              }
              break;
            }
          }
        }
        if (shopEquippedTag) {
          tag = shopEquippedTag.tag;
          color = shopEquippedTag.color;
          border = shopEquippedTag.border || "";
        }
      }

      // 未认证用户或没有标签的用户，赋予默认 "USER" 蓝色标签
      if (!tag) {
        tag = "USER";
        color = "blue";
        border = "";
        // 仅当该用户名在标签系统中不存在时才保存，防止覆盖已有标签
        if (!reg.tags.has(name)) {
          reg.tags.set(name, {tag, color});
          savePromises.push(reg.saveTags());
        }
      }

      if (!reg.knownUsers.has(name)) {
        reg.knownUsers.add(name);
        savePromises.push(reg.saveKnownUsers());
      }
      if (ip) {
        reg.userIps.set(name, ip);
        savePromises.push(reg.saveUserIps());
      }

      let vip = getVipLevel(tag);
      let vipFeatures = getVipFeatures(vip);

      let result = {banned, ipBanned, registered, authenticated, tag, color, border, avatar: userAvatar, bio: userBio, vip: vip ? {level: vip.id, label: vip.label, tier: vip.tier, features: vipFeatures} : null};
      if (savePromises.length) Promise.all(savePromises).catch(() => {});
      return new Response(JSON.stringify(result), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/user-delete": {
      let userName = url.searchParams.get("name");
      if (!userName) return new Response("请提供用户名", { status: 400 });
      reg.registeredUsers.delete(userName);
      reg.tags.delete(userName);
      reg.userPoints.delete(userName);
      reg.userInventory.delete(userName);
      reg.knownUsers.delete(userName);
      reg.userIps.delete(userName);
      reg.globalBlacklist.delete(userName);
      reg.banned.delete(userName);
      reg.kickProtected.delete(userName);
      reg.taskClaims.delete(userName);
      reg.taskCompletions.delete(userName);
      await Promise.all([
        reg.saveRegisteredUsers(), reg.saveTags(), reg.savePoints(),
        reg.saveUserInventory(), reg.saveKnownUsers(), reg.saveUserIps(),
        reg.saveGlobalBlacklist(), reg.saveBanned(), reg.saveKickProtected(),
        reg.saveTaskClaims(), reg.saveTaskCompletions()
      ]);
      return new Response("用户 " + userName + " 已删除", { status: 200 });
    }

    default:
      return null;
  }
}
