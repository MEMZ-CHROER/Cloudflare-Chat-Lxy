// v1.43 Hacknet 对战小游戏 — 前端模块
// 职责：状态面板 + TRACE 追踪红条 + 终端裸命令桥接（window.__hn 供 hacknet.js 终端 / rooms.js 密码钩子调用）
// 服务端权威：src/registry/hacknet.mjs（status 结构 / 命令集 / 端点签名一律以它为准，不得臆造字段）
// 防 XSS：所有渲染一律 createElement + textContent，绝不 innerHTML 拼接任何用户数据
import { state } from './state.js';
import { switchRoom } from './rooms.js';

// ---------- 模块状态 ----------
let panelEl = null;          // #hacknet-game-panel
let headTitleEl = null;      // .hn-head .hn-title
let badgeEl = null;          // .hn-head .hn-badge
let bodyEl = null;           // .hn-body
let msgEl = null;            // .hn-msg
let traceBarEl = null;       // #hacknet-trace-bar
let pollTimer = null;        // 2s 轮询句柄
let currentStatus = null;    // 最近一次 status.game（sanitizeStatus 结构，缓存供 tryConnect/enterPassword/refreshTicket 判定）
let remoteLockRoom = null;   // REMOTE 锁定目标（tryDisconnect 判定）
let currentTicket = null;    // 最近签发的入场 ticket（备用）
let panelHidden = false;     // × 关闭只隐藏面板，轮询继续
let progressCache = {};      // room -> { "crack:<port>"|"proxy"|"porthack": {startedAt, duration} }
let lastExposedRooms = new Set();
let traceTriggerNotified = false;
let lastGameId = null;
let lastEndedNotified = false;

// ---------- 小工具 ----------
function token() {
  try { return localStorage.getItem("chat_token") || ""; } catch (e) { return ""; }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}

function showPanel(v) {
  if (!panelEl) return;
  if (v) { panelEl.style.display = "flex"; panelHidden = false; }
  else { panelEl.style.display = "none"; }
}

function printMsg(text, isError) {
  if (!msgEl) return;
  while (msgEl.childElementCount >= 200) msgEl.removeChild(msgEl.firstChild);
  const line = el("div", "hn-msg-line" + (isError ? " hn-msg-error" : ""), text);
  msgEl.appendChild(line);
  msgEl.scrollTop = msgEl.scrollHeight;
}

function clearBody() {
  if (bodyEl) { while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild); }
}

// ---------- API 桥接 ----------
// POST /api/hn/<action>，body {name, token, ...}；响应可能带 sid → 存 localStorage.hnSid
async function api(action, body) {
  const payload = Object.assign({ name: state.username || "", token: token() }, body);
  const r = await fetch("/api/hn/" + action, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (d && d.sid) localStorage.setItem("hnSid", d.sid);
  if (d && d.ok) startPolling(); // 写操作成功 → 恢复/保持轮询（只有登录后才会成功）
  return d;
}

// ---------- 轮询 ----------
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(poll, 2000);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function poll() {
  try {
    let q = {};
    const sid = localStorage.getItem("hnSid");
    if (sid) q.sid = sid;                      // 优先 sid（轻量鉴权）
    else { q.name = state.username || ""; q.token = token(); }
    let r = await fetch("/api/hn/status?" + new URLSearchParams(q).toString());
    let d;
    if (r.status === 400 || r.status === 401 || r.status === 403) {
      // sid 失效 / 未登录 → 用 name+token 重试一次
      const r2 = await fetch("/api/hn/status?" + new URLSearchParams({ name: state.username || "", token: token() }).toString());
      if (r2.status === 400 || r2.status === 401 || r2.status === 403) {
        stopPolling();
        printMsg("未登录（请先注册账号并登录后游玩）", true);
        return;
      }
      d = await r2.json().catch(() => ({}));
    } else {
      d = await r.json().catch(() => ({}));
    }
    if (d && d.sid) localStorage.setItem("hnSid", d.sid);
    renderStatus(d && d.game);
  } catch (e) {
    printMsg("轮询失败: " + (e && e.message ? e.message : String(e)), true);
  }
}

// ---------- 渲染 ----------
function calcPct(room, key) {
  const p = progressCache[room] && progressCache[room][key];
  if (!p) return 100;
  const elapsed = Date.now() - p.startedAt;
  return Math.max(2, Math.min(100, Math.round((elapsed / p.duration) * 100)));
}

function barWrap(pct) {
  const wrap = el("div", "hn-bar-wrap");
  const fill = el("div", "hn-bar-fill");
  fill.style.width = pct + "%";
  wrap.appendChild(fill);
  return wrap;
}

// 惰性结算：清除已完成超过 8s 的进度缓存，避免残留死进度条
function pruneProgress() {
  const now = Date.now();
  for (const room of Object.keys(progressCache)) {
    const obj = progressCache[room];
    for (const key of Object.keys(obj)) {
      const p = obj[key];
      if (p && now > p.startedAt + p.duration + 8000) delete obj[key];
    }
    if (!Object.keys(obj).length) delete progressCache[room];
  }
}

function renderMineRoom(r) {
  const room = el("div", "hn-room");
  room.appendChild(el("span", "hn-room-name", "#" + r.room));
  if (r.crackedBy) room.appendChild(el("span", "hn-room-flag", " [被入侵!]"));
  if (r.passwordExposed) room.appendChild(el("span", "hn-room-flag", " [密码暴露 " + r.passwordExposed + "s]"));
  room.appendChild(el("div", "hn-pwd", "密码: " + (r.password || "?")));
  const portsRow = el("div", "hn-ports");
  (r.ports || []).forEach(p => portsRow.appendChild(el("span", "hn-port", String(p))));
  room.appendChild(portsRow);
  if (r.proxy) room.appendChild(el("div", "hn-proxy", "PROXY " + (r.proxyBroken ? "✓" : "ACTIVE")));
  if (r.firewall) room.appendChild(el("div", "hn-firewall", "FIREWALL " + (r.firewallBroken ? "✓" : "ACTIVE")));
  (r.hearts || []).forEach(h => {
    room.appendChild(el("span", h.taggedBy ? "hn-heart-captured" : "hn-heart", h.tag));
  });
  return room;
}

function renderEnemyRoom(r, side) {
  const room = el("div", "hn-room");
  room.appendChild(el("span", "hn-room-name", "#" + r.room));
  if (r.crackedBy) {
    room.appendChild(el("span", "hn-room-flag", r.crackedBy === side ? " [已打通·你]" : " [已打通·对方]"));
  }
  const portsRow = el("div", "hn-ports");
  (r.ports || []).forEach(p => {
    const chip = el("span", "hn-port" + (p.cracked ? " hn-port--cracked" : ""), String(p.port));
    if (p.cracking) chip.appendChild(barWrap(calcPct(r.room, "crack:" + p.port)));
    portsRow.appendChild(chip);
  });
  room.appendChild(portsRow);
  if (r.proxy && r.proxy.present) {
    const proxy = el("div", "hn-proxy", "PROXY " + (r.proxy.broken ? "破解✓" : r.proxy.cracking ? "破解中…" : "ACTIVE"));
    if (r.proxy.cracking) proxy.appendChild(barWrap(calcPct(r.room, "proxy")));
    room.appendChild(proxy);
  }
  if (r.firewall && r.firewall.present) {
    room.appendChild(el("div", "hn-firewall", "FIREWALL " + (r.firewall.broken ? "破解✓" : "ACTIVE（已揭示 " + (r.firewall.revealed || 0) + "/" + (r.firewall.totalLen || 0) + "）")));
  }
  if (!r.crackedBy && progressCache[r.room] && progressCache[r.room].porthack) {
    room.appendChild(el("div", "hn-porthack-label", "PortHack 建立连接…"));
    room.appendChild(barWrap(calcPct(r.room, "porthack")));
  }
  (r.hearts || []).forEach(h => {
    room.appendChild(el("span", h.taggedBy ? "hn-heart-captured" : "hn-heart", h.tag));
  });
  return room;
}

function updateTrace(game) {
  if (!traceBarEl) return;
  const tr = game && game.player && game.player.trace;
  if (tr && tr.remainingMs > 0) {
    traceBarEl.style.display = "block";
    traceBarEl.textContent = "TRACE LAST " + Math.max(1, Math.round(tr.remainingMs / 1000)) + " s";
  } else {
    traceBarEl.style.display = "none";
  }
}

// trace 惩罚提示：status.player.exposed 非空 → .hn-msg 红字（新暴露只提示一次）
function notifyTracePunish(game) {
  const exposed = (game.player && game.player.exposed) || [];
  const cur = new Set(exposed.map(e => e.room));
  for (const e of exposed) {
    if (!lastExposedRooms.has(e.room)) {
      printMsg("⚠ 追踪惩罚：你的基地 #" + e.room + " 密码已暴露 " + Math.max(1, Math.round((e.remainingMs || 0) / 1000)) + "s！", true);
    }
  }
  if (game.player && game.player.traceTriggered && !traceTriggerNotified) {
    traceTriggerNotified = true;
    printMsg("⚠ CONNECTION SEVERED — 敌方追踪超时，已触发惩罚！", true);
  }
  if (!game.player.traceTriggered) traceTriggerNotified = false;
  lastExposedRooms = cur;
}

function renderStatus(game) {
  if (!panelEl) return;
  pruneProgress();
  if (!game) {
    headTitleEl.textContent = "HACKNET — NOT IN GAME";
    badgeEl.textContent = "";
    clearBody();
    bodyEl.appendChild(el("div", "hn-sec-title", "输入 /hn new pve 开始单人对局，或 /hn new pvp vs <玩家> 发起对战"));
    updateTrace(null);
    return;
  }
  if (game.id !== lastGameId) {
    // 新局：重置局内通知/缓存
    lastGameId = game.id;
    lastEndedNotified = false;
    lastExposedRooms = new Set();
    traceTriggerNotified = false;
    progressCache = {};
    currentTicket = null;
    remoteLockRoom = null;
  }
  currentStatus = game;
  // 头：标题 + 状态徽标 + 胜负横幅
  headTitleEl.textContent = "HACKNET #" + game.id;
  badgeEl.textContent = String(game.state || "").toUpperCase();
  if (game.state === "ended") {
    const wn = (game.sides && game.sides[game.winner]) || game.winner || "?";
    headTitleEl.textContent = "WINNER: " + (game.winner === game.side ? "YOU" : wn);
    badgeEl.textContent = "ENDED";
    if (!lastEndedNotified) {
      lastEndedNotified = true;
      printMsg("🏆 游戏结束！获胜者: " + (game.winner === game.side ? "你" : wn));
    }
  }
  // 主体：我方基地 / 敌方基地 / 当前 REMOTE 目标
  clearBody();
  const secMine = el("div", "hn-sec hn-sec--mine");
  secMine.appendChild(el("div", "hn-sec-title", "MY BASE (" + (game.bases && game.bases.mine ? game.bases.mine.length : 0) + " 房)"));
  (game.bases && game.bases.mine || []).forEach(r => secMine.appendChild(renderMineRoom(r)));
  bodyEl.appendChild(secMine);
  const secEnemy = el("div", "hn-sec hn-sec--enemy");
  secEnemy.appendChild(el("div", "hn-sec-title", "ENEMY BASE (" + (game.bases && game.bases.enemy ? game.bases.enemy.length : 0) + " 房)"));
  (game.bases && game.bases.enemy || []).forEach(r => secEnemy.appendChild(renderEnemyRoom(r, game.side)));
  bodyEl.appendChild(secEnemy);
  if (game.player && game.player.currentTarget) {
    bodyEl.appendChild(el("div", "hn-sec-title", "TARGET: #" + game.player.currentTarget + " (REMOTE)"));
  }
  updateTrace(game);
  notifyTracePunish(game);
}

// ---------- 斜杠命令 ----------
async function doNew(params) {
  try {
    const d = await api("new", params);
    if (d && d.ok) {
      printMsg(d.msg || "已开局");
      if (d.gameId) localStorage.setItem("hnGameId", d.gameId);
      (d.rooms || []).forEach(r => printMsg("  基地 #" + r.room + " 密码: " + r.password));
      showPanel(true);
      poll();
    } else {
      printMsg("✗ " + (d && d.error ? d.error : "开局失败"), true);
    }
  } catch (e) { printMsg("✗ " + (e && e.message ? e.message : String(e)), true); }
}

async function doAccept(gameId) {
  try {
    const d = await api("accept", { gameId: gameId });
    if (d && d.ok) {
      printMsg(d.msg || "应战成功");
      if (d.gameId) localStorage.setItem("hnGameId", d.gameId);
      (d.rooms || []).forEach(r => printMsg("  基地 #" + r.room + " 密码: " + r.password));
      showPanel(true);
      poll();
    } else {
      printMsg("✗ " + (d && d.error ? d.error : "应战失败"), true);
    }
  } catch (e) { printMsg("✗ " + (e && e.message ? e.message : String(e)), true); }
}

async function doQuit() {
  try {
    const d = await api("quit", {});
    if (d && d.ok) {
      printMsg(d.msg || "已退出");
      localStorage.removeItem("hnGameId");
      poll();
    } else {
      printMsg("✗ " + (d && d.error ? d.error : "退出失败"), true);
    }
  } catch (e) { printMsg("✗ " + (e && e.message ? e.message : String(e)), true); }
}

export function hnCommand(arg) {
  if (!panelEl) hnInit(); // 防御：面板未初始化时自动初始化
  showPanel(true);
  const parts = String(arg || "").trim().split(/\s+/).filter(Boolean);
  const sub = (parts[0] || "").toLowerCase();
  if (!state.username) {
    printMsg("请先登录（注册账号并登录后游玩）", true);
    return;
  }
  switch (sub) {
    case "new": {
      const mode = (parts[1] || "pve").toLowerCase();
      if (mode === "pve") {
        let x = parts[2] ? parseInt(parts[2], 10) : 3;
        if (isNaN(x) || x < 1) x = 3;
        doNew({ mode: "pve", x: x });
      } else if (mode === "pvp") {
        const vsIdx = parts.indexOf("vs");
        const opponent = vsIdx >= 0 ? parts.slice(vsIdx + 1).join(" ") : "";
        if (!opponent) { printMsg("用法: /hn new pvp [x] vs <玩家名>"); return; }
        let x = 3;
        if (parts[2] && !/^vs$/i.test(parts[2])) {
          const n = parseInt(parts[2], 10);
          if (!isNaN(n) && n >= 1) x = n;
        }
        doNew({ mode: "pvp", x: x, opponent: opponent });
      } else {
        printMsg("用法: /hn new pve [x] 或 /hn new pvp [x] vs <玩家>");
      }
      break;
    }
    case "accept": {
      const gameId = parts[1] || "";
      if (!gameId) { printMsg("用法: /hn accept <游戏ID>"); return; }
      doAccept(gameId);
      break;
    }
    case "status":
      poll();
      break;
    case "quit":
      doQuit();
      break;
    default:
      printMsg("HACKNET 命令: /hn new pve [x] | /hn new pvp [x] vs <玩家> | /hn accept <id> | /hn status | /hn quit");
  }
}

// ---------- 终端裸命令桥接 ----------
// 破解器名 → 端口（与 hacknet.mjs CRACKERS 表一致；参数解析也与服务端一致）
const CRACK_PORTS = {
  "ftpsprint": 211, "rediscrack": 6379, "ftpbounce": 21, "rdpcrack": 3389,
  "sshcrack": 22, "mysqlcrack": 3306, "smtpoverflow": 25, "sqlcrack": 1433,
  "ssltrojan": 443, "webserverworm": 80,
};

function cacheProgress(room, progress) {
  if (!room || !progress) return;
  if (!progressCache[room]) progressCache[room] = {};
  if (progress.kind === "crack") progressCache[room]["crack:" + progress.port] = progress;
  else if (progress.kind === "proxy") progressCache[room].proxy = progress;
  else if (progress.kind === "porthack") progressCache[room].porthack = progress;
}

function fireAction(params) {
  api("action", params).then(d => {
    if (d && d.ok) {
      printMsg(d.msg || "OK");
      if (d.progress) {
        const room = currentStatus && currentStatus.player && currentStatus.player.currentTarget;
        cacheProgress(room, d.progress);
      }
    } else {
      printMsg("✗ " + (d && d.error ? d.error : "操作失败"), true);
    }
    poll();
  }).catch(e => printMsg("✗ " + (e && e.message ? e.message : String(e)), true));
}

export function dispatchBare(v) {
  if (!msgEl) hnInit(); // 防御：面板未初始化时自动初始化
  const s = String(v || "").trim();
  if (!s) return false;
  const parts = s.split(/\s+/);
  const lname = (parts[0] || "").toLowerCase();
  if (lname === "scan" || lname === "probe") {
    fireAction({ cmd: lname });
    return true;
  }
  if (lname === "help") {
    printMsg("HACKNET 破解器: FTPSprint(211) RedisCrack(6379) FTPBounce(21) RDPCrack(3389) SSHCrack(22) MySQLCrack(3306) SMTPoverflow(25) SQLCrack(1433) SSLTrojan(443) WebServerWorm(80) | ProxyOverlay 破代理 | analyze / solve <码> 破防火墙 | PortHack 打通 | HeartTag <tag> 改 Heart");
    return true;
  }
  if (lname === "proxyoverlay") { fireAction({ cmd: "proxy" }); return true; }
  if (lname === "analyze") { fireAction({ cmd: "analyze" }); return true; }
  if (lname === "solve") { fireAction({ cmd: "solve", code: parts.slice(1).join(" ").trim() }); return true; }
  if (lname === "porthack") { fireAction({ cmd: "porthack" }); return true; }
  if (lname === "hearttag") { fireAction({ cmd: "hearttag", tag: parts.slice(1).join(" ").trim() }); return true; }
  const port = CRACK_PORTS[lname];
  if (port !== undefined) {
    const given = parts[1] ? parseInt(parts[1], 10) : port;
    fireAction({ cmd: "crack", port: isNaN(given) ? port : given });
    return true;
  }
  return false;
}

// ---------- 切房 / 断开 / 密码 / ticket 钩子 ----------
export async function tryConnect(name) {
  if (!name) return false;
  const st = currentStatus;
  if (!st) return false;
  const mine = st.bases && st.bases.mine && st.bases.mine.find(r => r.room === name);
  if (mine) {
    // 我方基地房 → 直接 switchRoom（自动进，密码钩子 enterPassword 绕过弹窗）
    try { await switchRoom(name); } catch (e) { printMsg("✗ 进入失败: " + (e && e.message ? e.message : String(e)), true); }
    return true;
  }
  const enemy = st.bases && st.bases.enemy && st.bases.enemy.find(r => r.room === name);
  if (enemy) {
    try {
      const d = await api("connect", { room: name });
      if (d && d.ok) {
        if (d.mode === "lock") {
          // REMOTE 锁定为攻击目标：不切房，面板显示 TRACE/进度
          remoteLockRoom = name;
          if (st.player) st.player.currentTarget = name;
          printMsg(d.msg || "CONNECTED TO #" + name + " (REMOTE)");
          poll();
          return true;
        }
        if (d.mode === "enter") {
          // 已打通：签发入场 ticket → 真正进入
          if (d.ticket) currentTicket = d.ticket;
          printMsg(d.msg || "已打通，进入 #" + name);
          try { await switchRoom(name); } catch (e) { printMsg("✗ 进入失败: " + (e && e.message ? e.message : String(e)), true); }
          return true;
        }
      } else {
        printMsg("✗ " + (d && d.error ? d.error : "连接失败"), true);
      }
    } catch (e) { printMsg("✗ " + (e && e.message ? e.message : String(e)), true); }
    return false;
  }
  return false;
}

export async function tryDisconnect() {
  const st = currentStatus;
  const locked = remoteLockRoom || (st && st.player && st.player.currentTarget);
  if (!locked) return false; // 非 REMOTE 锁定 → 让普通 /dc 接管
  try {
    const d = await api("disconnect", {});
    if (d && d.ok) {
      remoteLockRoom = null;
      if (currentStatus && currentStatus.player) currentStatus.player.currentTarget = null;
      printMsg(d.msg || "连接已断开，追踪警报解除");
    } else {
      printMsg("✗ " + (d && d.error ? d.error : "断开失败"), true);
    }
  } catch (e) { printMsg("✗ " + (e && e.message ? e.message : String(e)), true); }
  poll();
  return true;
}

export async function enterPassword(name) {
  const st = currentStatus;
  if (!st) return false;
  // 我方基地房 OR 敌方已破解房（crackedBy === 我的 side）→ 绕过密码弹窗
  if (st.bases && st.bases.mine && st.bases.mine.some(r => r.room === name)) return true;
  if (st.bases && st.bases.enemy && st.bases.enemy.some(r => r.room === name && r.crackedBy === st.side)) return true;
  return false;
}

export async function refreshTicket(room) {
  const st = currentStatus;
  if (!st) return null;
  const cracked = st.bases && st.bases.enemy && st.bases.enemy.some(r => r.room === room && r.crackedBy === st.side);
  if (!cracked) return null; // 仅敌方已破解房签发 ticket，否则让普通密码逻辑接管
  try {
    const d = await api("ticket", { room: room });
    if (d && d.ok && d.ticket) { currentTicket = d.ticket; return d.ticket; }
  } catch (e) {}
  return null;
}

// ---------- 生命周期 ----------
export function hnInit() {
  try { hnCleanup(); } catch (e) {}
  // ① 状态面板
  const panel = el("div", "hn-panel");
  panel.id = "hacknet-game-panel";
  panel.style.cssText = "position:fixed;right:12px;top:60px;width:340px;max-width:92vw;max-height:70vh;z-index:9998;" +
    "background:rgba(8,8,8,0.92);color:#D5F5FF;border:1px solid #008BC7;font-family:Consolas,Menlo,monospace;" +
    "font-size:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 0 18px rgba(0,139,199,0.35);";
  const head = el("div", "hn-head");
  head.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 10px;background:#0a121a;border-bottom:1px solid #008BC7;flex-shrink:0;";
  headTitleEl = el("span", "hn-title", "HACKNET");
  headTitleEl.style.cssText = "flex:1;font-weight:bold;color:#DEC918;";
  badgeEl = el("span", "hn-badge", "");
  badgeEl.style.cssText = "font-size:10px;padding:1px 6px;border:1px solid #008BC7;border-radius:3px;color:#5FDC53;";
  const close = el("button", "hn-close", "×");
  close.style.cssText = "background:none;border:none;color:#FF0000;font-size:16px;cursor:pointer;line-height:1;padding:0 2px;";
  close.setAttribute("aria-label", "关闭 Hacknet 面板");
  close.addEventListener("click", () => { panelHidden = true; showPanel(false); });
  head.appendChild(headTitleEl);
  head.appendChild(badgeEl);
  head.appendChild(close);
  bodyEl = el("div", "hn-body");
  bodyEl.style.cssText = "flex:1;overflow-y:auto;padding:6px 8px;";
  msgEl = el("div", "hn-msg");
  msgEl.style.cssText = "padding:6px 10px;border-top:1px solid #444;max-height:150px;overflow-y:auto;white-space:pre-wrap;flex-shrink:0;color:#D5F5FF;";
  panel.appendChild(head);
  panel.appendChild(bodyEl);
  panel.appendChild(msgEl);
  document.body.appendChild(panel);
  panelEl = panel;
  // ② TRACE 红条
  traceBarEl = el("div", "hn-trace");
  traceBarEl.id = "hacknet-trace-bar";
  traceBarEl.style.cssText = "position:fixed;top:0;left:50%;transform:translateX(-50%);background:#FF0000;color:#fff;" +
    "font-family:Consolas,Menlo,monospace;font-size:14px;padding:3px 16px;z-index:9999;letter-spacing:1px;" +
    "border-radius:0 0 6px 6px;box-shadow:0 0 12px rgba(255,0,0,0.6);display:none;";
  document.body.appendChild(traceBarEl);
  // ③ 注册窗口桥接（hacknet.js 终端裸命令 / rooms.js 密码钩子调用）
  window.__hn = { tryConnect, tryDisconnect, dispatchBare, enterPassword, refreshTicket };
  // ④ 启动 2s 轮询
  startPolling();
  poll();
}

export function hnCleanup() {
  try { stopPolling(); } catch (e) {}
  try { if (panelEl) panelEl.remove(); } catch (e) {}
  try { if (traceBarEl) traceBarEl.remove(); } catch (e) {}
  try { delete window.__hn; } catch (e) {}
  panelEl = null; headTitleEl = null; badgeEl = null; bodyEl = null; msgEl = null; traceBarEl = null;
  currentStatus = null; remoteLockRoom = null; currentTicket = null; progressCache = {};
  lastExposedRooms = new Set(); traceTriggerNotified = false; lastGameId = null; lastEndedNotified = false;
  panelHidden = false;
}
