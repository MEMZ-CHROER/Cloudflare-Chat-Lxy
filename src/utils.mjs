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
export function tokenValid(user, token) {
  return !!(user && user.token && (!user.tokenExpiry || user.tokenExpiry > Date.now()) && safeEqual(user.token, token));
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
    kickProtect: false, maxMsgLen: 256
  };
  const t = vip.tier;
  let badge = true;
  let uploadImgMB = 1, uploadFileMB = 20;
  let kickProtect = false, maxMsgLen = 256;
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
    maxMsgLen = 500;
    vipColor = '#9b59b6';
  } else if (t === 10) {
    uploadImgMB = 20;
    uploadFileMB = 200;
    kickProtect = true;
    maxMsgLen = 2000;
    vipColor = '#e74c3c';
  } else if (t === 11) {
    uploadImgMB = 50;
    uploadFileMB = 500;
    kickProtect = true;
    maxMsgLen = 2000;
    vipColor = '#f1c40f';
  } else {
    uploadImgMB = 100;
    uploadFileMB = 1000;
    kickProtect = true;
    maxMsgLen = 2000;
    vipColor = '#f1c40f';
  }
  return { badge, vipColor, uploadImgMB, uploadFileMB, kickProtect, maxMsgLen };
}
