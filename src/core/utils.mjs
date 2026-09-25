// @ts-check
// 共享纯函数工具 + 多设备会话辅助（v1.55+）+ 敏感词/等级/VIP
// v1.57：全量 JSDoc 类型契约（types.js 单点定义，跨模块复用）
/** @typedef {import("./types.js").User} User */
/** @typedef {import("./types.js").SessionEntry} SessionEntry */
/** @typedef {import("./types.js").VipInfo} VipInfo */

// 🔒 安全修复（W20）：颜色白名单（色名 + #hex），消息颜色/房间等级样式统一使用
// v1.57 上移共享：chatroom.mjs 主文本路径与 http.mjs 端点共用
/** @type {RegExp} 颜色白名单正则（SAFE_COLOR_RE） */
export const SAFE_COLOR_RE =
  /^(red|blue|green|purple|pink|cyan|gray|grey|orange|yellow|teal|indigo|brown|lime|deeporange|rose|crimson|coral|gold|amber|forest|seagreen|turquoise|steel|royalblue|mediumpurple|darkviolet|chocolate|olive|firebrick|slateblue|darkcyan|mediumseagreen|indianred|cadetblue|#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?)$/;

/**
 * SHA-256 哈希（crypto.subtle）
 * @param {string} message 原文
 * @returns {Promise<string>} 十六进制哈希串
 */
export async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 🔒 安全修复（LD11）：常量时间字符串比较（防时序侧信道）
 * @param {string|number} a
 * @param {string|number} b
 * @returns {boolean}
 */
export function safeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * 🔒 安全修复（LD8/LD11）：校验用户 token 是否有效（统一走 findSession，支持多 sessions + 旧单 token 兼容）
 * @param {User} user 注册用户对象
 * @param {string} token 待校验 token
 * @returns {boolean} 是否有效
 */
export function tokenValid(user, token) {
  return !!findSession(user, token);
}

/**
 * 🗝️ v1.55 多设备会话：查找匹配 token 的有效会话。
 * 优先新多设备 sessions 数组，回退旧单 token 字段（向后兼容）。无效返回 null。
 * @param {User} user 注册用户对象
 * @param {string} token 待查找 token
 * @returns {SessionEntry|null} 匹配的会话项（含旧字段包装），无效返回 null
 */
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
    return {
      token: user.token,
      expiry: user.tokenExpiry || 0,
      createdAt: user.tokenCreatedAt || 0,
      lastActive: user.tokenLastActive || 0,
      device: user.tokenDevice || "",
    };
  }
  return null;
}

/**
 * 🗝️ v1.55 多设备会话：确保 sessions 数组存在，迁移旧单 token（v1.55 前数据）→ sessions[0]
 * @param {User} user 注册用户对象（原地修改）
 * @returns {SessionEntry[]} sessions 数组
 */
export function ensureSessions(user) {
  if (!Array.isArray(user.sessions)) {
    user.sessions = [];
    if (user.token) {
      user.sessions.push({
        token: user.token,
        expiry: user.tokenExpiry || 0,
        createdAt: user.tokenCreatedAt || Date.now(),
        lastActive: Date.now(),
        device: user.tokenDevice || "",
        ip: user.tokenIp || "",
      });
      user.token = null;
      user.tokenExpiry = null;
    }
  }
  return user.sessions;
}

/**
 * 🗝️ v1.55 多设备会话：追加新会话（30 天过期，最多 10 个，超限按 createdAt 淘汰最旧）
 * @param {User} user 注册用户对象（原地修改）
 * @param {string} token 新 token
 * @param {string} [device] 设备摘要
 * @param {string} [ip] 登录 IP
 * @returns {SessionEntry[]} sessions 数组
 */
export function pushSession(user, token, device, ip) {
  const s = ensureSessions(user);
  const now = Date.now();
  s.push({
    token,
    expiry: now + 30 * 24 * 3600 * 1000,
    createdAt: now,
    lastActive: now,
    device: device || "",
    ip: ip || "",
  });
  if (s.length > 10) s.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).splice(0, s.length - 10);
  return s;
}

/**
 * `handleErrors()` 包装 HTTP 请求处理器，出错时返回通用错误（不泄露堆栈细节）
 * @param {Request} request 原始请求（WS Upgrade 时返回 1011 关闭）
 * @param {() => Promise<Response>} func 实际处理器
 * @returns {Promise<Response>}
 */
export async function handleErrors(request, func) {
  try {
    return await func();
  } catch (err) {
    console.error("请求处理异常:", err.stack || err);
    if (request.headers.get("Upgrade") == "websocket") {
      let pair = new WebSocketPair();
      pair[1].accept();
      pair[1].send(JSON.stringify({ error: "服务器内部错误" }));
      pair[1].close(1011, "会话设置期间未捕获的异常");
      return new Response(null, { status: 101, webSocket: pair[0] });
    } else {
      return new Response("服务器内部错误", { status: 500 });
    }
  }
}

/**
 * ⭐ 经验等级系统（纯函数）：Lv1 起，每级所需经验从 100 起按 *1.15 递增
 * @param {number|string} exp 总经验
 * @returns {{level:number, current:number, next:number}} 当前等级 / 本级已积累 / 升下一级还需
 */
export function levelForExp(exp) {
  exp = Math.max(0, parseInt(String(exp)) || 0);
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

/**
 * VIP 等级系统：解析 tag（VIP1-10 / VIP+ / MVP）→ 等级信息
 * @param {string} [tag] 标签字符串
 * @returns {{id:string, tier:number, label:string}|null}
 */
export function getVipLevel(tag) {
  if (!tag) return null;
  const m = tag.match(/^[Vv][Ii][Pp](\d+)$/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 10) return { id: `vip${n}`, tier: n, label: `VIP${n}` };
  }
  const lower = tag.toLowerCase();
  if (lower === "vip+") return { id: "vip+", tier: 11, label: "VIP+" };
  if (lower === "mvp") return { id: "mvp", tier: 12, label: "MVP" };
  return null;
}

/**
 * VIP 功能特性：按 tier 返回上传限额/踢人保护/消息长度等
 * @param {VipInfo} [vip] VIP 信息（getVipLevel 的产物 + features）
 * @returns {{badge:boolean, vipColor:string|null, uploadImgMB:number, uploadFileMB:number, kickProtect:boolean, maxMsgLen:number}}
 */
export function getVipFeatures(vip) {
  if (!vip)
    return {
      badge: false,
      vipColor: null,
      uploadImgMB: 1,
      uploadFileMB: 20,
      kickProtect: false,
      maxMsgLen: 5000,
    };
  const t = vip.tier;
  let badge = true;
  let uploadImgMB = 1,
    uploadFileMB = 20;
  let kickProtect = false,
    maxMsgLen = 5000;
  let vipColor = null;

  if (t <= 3) {
    uploadImgMB = 2;
    uploadFileMB = 30;
    vipColor = "#e67e22";
  } else if (t <= 6) {
    uploadImgMB = 5;
    uploadFileMB = 50;
    kickProtect = true;
    vipColor = "#3498db";
  } else if (t <= 9) {
    uploadImgMB = 10;
    uploadFileMB = 100;
    kickProtect = true;
    maxMsgLen = 5000;
    vipColor = "#9b59b6";
  } else if (t === 10) {
    uploadImgMB = 20;
    uploadFileMB = 200;
    kickProtect = true;
    maxMsgLen = 10000;
    vipColor = "#e74c3c";
  } else if (t === 11) {
    uploadImgMB = 50;
    uploadFileMB = 500;
    kickProtect = true;
    maxMsgLen = 10000;
    vipColor = "#f1c40f";
  } else {
    uploadImgMB = 100;
    uploadFileMB = 1000;
    kickProtect = true;
    maxMsgLen = 10000;
    vipColor = "#f1c40f";
  }
  return { badge, vipColor, uploadImgMB, uploadFileMB, kickProtect, maxMsgLen };
}
