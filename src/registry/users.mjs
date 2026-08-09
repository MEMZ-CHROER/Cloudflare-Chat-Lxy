// 用户注册/登录/认证 + user-seen/ips
import { sha256, getVipLevel, getVipFeatures, tokenValid, levelForExp } from "../utils.mjs";
import { ACHIEVEMENTS } from "./achievements.mjs";

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
      // 🔒 安全修复（L13b）：registerByIp 计数器持久化到 storage（DO 重启不丢失）。
      // 在 users.mjs 内自包含懒加载/保存（不动 registry.mjs / persistence.mjs 主加载链）。
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
      // 🔒 安全修复（LD10）：每用户随机盐 + sha256(salt+password)，防离线爆破/彩虹表
      let saltBytes = new Uint8Array(16);
      crypto.getRandomValues(saltBytes);
      let salt = Array.from(saltBytes, b => b.toString(16).padStart(2, '0')).join('');
      let hash = await sha256(salt + password);
      reg.registeredUsers.set(name, {passwordHash: hash, salt, token: null, tokenExpiry: null, avatar: "", bio: "", anonCoupons: 0, exp: 0, achievements: [], stats: {msgCount: 0, checkinCount: 0, gameWins: 0, shopCount: 0}, registeredAt: Date.now()});
      await reg.saveRegisteredUsers();
      // 🏆 v1.45 赛季基线：注册时若赛季进行中（未结束且未结算），为新用户建立基线快照（去重：该 name 已存在则跳过）
      if (reg.seasonState && reg.seasonState.status !== "ended" && !reg.seasonState.settled) {
        if (!reg.seasonProgress) reg.seasonProgress = {baselines: [], points: []};
        let bm = new Map(reg.seasonProgress.baselines || []);
        if (!bm.has(name)) {
          bm.set(name, {msg: 0, checkin: 0, game: 0, achieve: 0});
          reg.seasonProgress.baselines = [...bm];
          await reg.saveSeasonProgress();
        }
      }
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

    // 🔑 v1.46 改密码（OAuth 用户设置密码 / 普通用户改密）：token 鉴权，旧密码仅对非 oauthOnly 校验
    case "/user-password": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let name = body.name, token = body.token || "";
      let oldPassword = body.oldPassword, newPassword = body.newPassword;
      if (!name || !newPassword) return new Response(JSON.stringify({error: "请提供用户名和新密码"}), {status: 400});
      let user = reg.registeredUsers.get(name);
      if (!user) return new Response(JSON.stringify({error: "用户不存在"}), {status: 404});
      if (!tokenValid(user, token)) return new Response(JSON.stringify({error: "身份验证失败"}), {status: 403});
      if (newPassword.length < 6) return new Response(JSON.stringify({error: "密码至少6个字符"}), {status: 400});
      // 非 oauthOnly（有密码）用户须校验旧密码；oauthOnly 用户首次设置密码免旧密码
      if (!user.oauthOnly) {
        let hash = await sha256((user.salt || "") + (oldPassword || ""));
        if (hash !== user.passwordHash) return new Response(JSON.stringify({error: "旧密码错误"}), {status: 401});
      }
      let saltBytes = new Uint8Array(16);
      crypto.getRandomValues(saltBytes);
      let newSalt = Array.from(saltBytes, b => b.toString(16).padStart(2, '0')).join('');
      user.passwordHash = await sha256(newSalt + newPassword);
      user.salt = newSalt;
      user.oauthOnly = false;
      await reg.saveRegisteredUsers();
      // 保留现有 token 不吊销
      return new Response(JSON.stringify({ok: true}));
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
      let uExp = user ? (user.exp || 0) : 0;
      let lvl = levelForExp(uExp);
      // 🔒 安全修复（F4）：/user-profile 为无鉴权公开端点，不返回 anonCoupons 与 stats（msgCount/checkinCount/gameWins/shopCount 行为统计属隐私）。
      // Lv 徽章（exp/level/expCurrent/expNext）本就公开显示故保留；完整数据由需 token 的 /user/achievements 端点提供；
      // achievements 仅返回已解锁成就 id 数组（不含行为统计）
      return new Response(JSON.stringify({
        name,
        avatar: user ? (user.avatar || "") : "",
        bio: user ? (user.bio || "") : "",
        tag, color, border,
        points: pts,
        registered: !!user,
        registeredAt: user ? (user.registeredAt || null) : null,
        exp: uExp,
        level: lvl.level,
        expCurrent: lvl.current,
        expNext: lvl.next,
        achievements: user ? (Array.isArray(user.achievements) ? user.achievements : []) : [],
        vip: vip ? {level: vip.id, label: vip.label, tier: vip.tier} : null
      }), {headers: {"Content-Type": "application/json"}});
    }

    // ⭐ 经验发放端点：注册用户调用（token 鉴权），amount 经验 + 可选 stats 计数。
    // stats ∈ {msg, checkin, game, shop}，对应 grantExp 内的 statsKey。
    case "/xp/grant": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let name = body.name;
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      let user = reg.registeredUsers.get(name);
      if (!tokenValid(user, body.token || "")) return new Response(JSON.stringify({error: "身份验证失败"}), {status: 403});
      let amount = parseInt(body.amount) || 0;
      if (amount < 0 || amount > 100) return new Response(JSON.stringify({error: "经验值无效"}), {status: 400});
      let statsKey = ["msg", "checkin", "game", "shop"].includes(body.stats) ? body.stats : null;
      let res = await reg.grantExp(name, amount, statsKey);
      return new Response(JSON.stringify(res), {headers: {"Content-Type": "application/json"}});
    }

    // ⭐ 成就查询端点（公开只读，需 token 鉴权）：返回经验/等级/统计/已解锁成就 + 成就定义表
    case "/user/achievements": {
      let name = url.searchParams.get("name");
      let token = url.searchParams.get("token") || "";
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      let user = reg.registeredUsers.get(name);
      if (!tokenValid(user, token)) return new Response(JSON.stringify({error: "身份验证失败"}), {status: 403});
      let stats = user.stats || {msgCount: 0, checkinCount: 0, gameWins: 0, shopCount: 0};
      let lvl = levelForExp(user.exp || 0);
      return new Response(JSON.stringify({
        name,
        exp: user.exp || 0,
        level: lvl.level,
        expCurrent: lvl.current,
        expNext: lvl.next,
        stats,
        achievements: Array.isArray(user.achievements) ? user.achievements : [],
        definitions: ACHIEVEMENTS
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
      let uExp = uiUser ? (uiUser.exp || 0) : 0;
      let uLvl = levelForExp(uExp);

      let result = {banned, ipBanned, registered, authenticated, tag, color, border, avatar: userAvatar, bio: userBio, anonCoupons: uiUser ? (uiUser.anonCoupons || 0) : 0, exp: uExp, level: uLvl.level, expCurrent: uLvl.current, expNext: uLvl.next, achievements: uiUser ? (Array.isArray(uiUser.achievements) ? uiUser.achievements : []) : [], stats: uiUser ? (uiUser.stats || {msgCount: 0, checkinCount: 0, gameWins: 0, shopCount: 0}) : {msgCount: 0, checkinCount: 0, gameWins: 0, shopCount: 0}, vip: vip ? {level: vip.id, label: vip.label, tier: vip.tier, features: vipFeatures} : null};
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
      // 🏆 v1.45 赛季/荣誉清理：同步移除该用户的赛季基线、赛季积分与荣誉币，防残留脏数据
      if (reg.seasonProgress) {
        let bm = new Map(reg.seasonProgress.baselines || []);
        let pm = new Map(reg.seasonProgress.points || []);
        if (bm.has(userName) || pm.has(userName)) {
          bm.delete(userName);
          pm.delete(userName);
          reg.seasonProgress.baselines = [...bm];
          reg.seasonProgress.points = [...pm];
          await reg.saveSeasonProgress();
        }
      }
      if (reg.honorCoins.has(userName)) {
        reg.honorCoins.delete(userName);
        await reg.saveHonorCoins();
      }
      return new Response("用户 " + userName + " 已删除", { status: 200 });
    }

    default:
      return null;
  }
}
