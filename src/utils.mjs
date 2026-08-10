// SHA-256 哈希函数
export async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 🔒 安全修复（LD11）：常量时间字符串比较
export function safeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// 🔒 安全修复（LD8/LD11）：校验用户 token 是否有效（常量时间比较 + 过期检查）
// 🗝️ v1.55 多设备会话：token 校验统一走 findSession（支持多 sessions 数组 + 旧单 token 兼容回退）
export function tokenValid(user, token) {
  return !!findSession(user, token);
}

// 🗝️ v1.55 多设备会话：在用户会话中查找匹配 token 的有效会话。
// 优先新多设备 sessions 数组（v1.55+），回退旧单 token 字段（v1.55 之前数据，向后兼容）。
// 返回匹配的 session 对象（含旧字段包装），无效返回 null。不做 storage 写入（避免写放大）。
export function findSession(user, token) {
  if (!user || !token) return null;
  if (Array.isArray(user.sessions) && user.sessions.length) {
    const now = Date.now();
    for (const s of user.sessions) {
      if (s && s.token && safeEqual(s.token, token)) {
        if (s.expiry && s.expiry <= now) return null; // 该会话已过期
        return s;
      }
    }
    return null;
  }
  // 旧单 token 兼容（v1.55 之前数据）
  if (user.token && (!user.tokenExpiry || user.tokenExpiry > Date.now()) && safeEqual(user.token, token)) {
    return { token: user.token, expiry: user.tokenExpiry || 0, createdAt: user.tokenCreatedAt || 0, lastActive: user.tokenLastActive || 0, device: user.tokenDevice || "" };
  }
  return null;
}

// 🗝️ v1.55 多设备会话：确保 sessions 数组存在，迁移旧单 token（v1.55 前数据）→ sessions[0]（共享辅助，registry 子模块共用）
export function ensureSessions(user) {
  if (!Array.isArray(user.sessions)) {
    user.sessions = [];
    if (user.token) {
      user.sessions.push({ token: user.token, expiry: user.tokenExpiry || 0, createdAt: user.tokenCreatedAt || Date.now(), lastActive: Date.now(), device: user.tokenDevice || "", ip: user.tokenIp || "" });
      user.token = null; user.tokenExpiry = null;
    }
  }
  return user.sessions;
}

// 🗝️ v1.55 多设备会话：追加新会话（30 天过期，最多 10 个，超限淘汰最旧）（共享辅助，registry 子模块共用）
export function pushSession(user, token, device, ip) {
  const s = ensureSessions(user);
  const now = Date.now();
  s.push({ token, expiry: now + 30 * 24 * 3600 * 1000, createdAt: now, lastActive: now, device: device || "", ip: ip || "" });
  if (s.length > 10) s.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).splice(0, s.length - 10);
  return s;
}

// `handleErrors()` 是一个实用函数，用于包装 HTTP 请求处理器并在出错时向客户端返回错误信息
// 注意：始终返回通用错误消息，不向客户端泄露堆栈细节
export async function handleErrors(request, func) {
  try {
    return await func();
  } catch (err) {
    console.error("请求处理异常:", err.stack || err);
    if (request.headers.get("Upgrade") == "websocket") {
      let pair = new WebSocketPair();
      pair[1].accept();
      pair[1].send(JSON.stringify({error: "服务器内部错误"}));
      pair[1].close(1011, "会话设置期间未捕获的异常");
      return new Response(null, { status: 101, webSocket: pair[0] });
    } else {
      return new Response("服务器内部错误", {status: 500});
    }
  }
}

// ⭐ 经验等级系统（纯函数）：Lv1 起，每级所需经验从 100 起按 *1.15 递增
// exp=总经验 → {level: 当前等级, current: 本级已积累, next: 升下一级还需}
export function levelForExp(exp) {
  exp = Math.max(0, parseInt(exp) || 0);
  let level = 1;
  let need = 100;
  let current = exp;
  while (current >= need) {
    current -= need;
    level++;
    need = Math.floor(need * 1.15);
  }
  return { level, current, next: need };
}

// VIP 等级系统
export function getVipLevel(tag) {
  if (!tag) return null;
  const m = tag.match(/^[Vv][Ii][Pp](\d+)$/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 10) return { id: `vip${n}`, tier: n, label: `VIP${n}` };
  }
  const lower = tag.toLowerCase();
  if (lower === 'vip+') return { id: 'vip+', tier: 11, label: 'VIP+' };
  if (lower === 'mvp')  return { id: 'mvp',  tier: 12, label: 'MVP' };
  return null;
}

export function getVipFeatures(vip) {
  if (!vip) return {
    badge: false, vipColor: null,
    uploadImgMB: 1, uploadFileMB: 20,
    kickProtect: false, maxMsgLen: 5000
  };
  const t = vip.tier;
  let badge = true;
  let uploadImgMB = 1, uploadFileMB = 20;
  let kickProtect = false, maxMsgLen = 5000;
  let vipColor = null;

  if (t <= 3) {
    uploadImgMB = 2;
    uploadFileMB = 30;
    vipColor = '#e67e22';
  } else if (t <= 6) {
    uploadImgMB = 5;
    uploadFileMB = 50;
    kickProtect = true;
    vipColor = '#3498db';
  } else if (t <= 9) {
    uploadImgMB = 10;
    uploadFileMB = 100;
    kickProtect = true;
    maxMsgLen = 5000;
    vipColor = '#9b59b6';
  } else if (t === 10) {
    uploadImgMB = 20;
    uploadFileMB = 200;
    kickProtect = true;
    maxMsgLen = 10000;
    vipColor = '#e74c3c';
  } else if (t === 11) {
    uploadImgMB = 50;
    uploadFileMB = 500;
    kickProtect = true;
    maxMsgLen = 10000;
    vipColor = '#f1c40f';
  } else {
    uploadImgMB = 100;
    uploadFileMB = 1000;
    kickProtect = true;
    maxMsgLen = 10000;
    vipColor = '#f1c40f';
  }
  return { badge, vipColor, uploadImgMB, uploadFileMB, kickProtect, maxMsgLen };
}
