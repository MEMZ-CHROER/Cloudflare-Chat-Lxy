// v1.40 Hacknet 主题 — 布局级主题模块（区别于 v1.38 CSS 换肤）
// 改变界面结构：左 1/5 成员列表 · 中 3/5（上 3/4 聊天 + 下 1/4 节点地图）· 右 1/5 命令终端
// 样式设计完全复刻《Hacknet》开源源码（OpenHacknet，authorized）：
//   #008BC7 高亮蓝(顶栏/普通节点) · #5FDC53 当前节点绿 · #444444 连线/边框
//   #080808 深底 · #D5F5FF 终端文字 · #DEC918 shell黄 · #FF0000 警告红 · #5A5A5A 弱化
// 贴图均为 .xnb 二进制不可内嵌 → 全 CSS/SVG 复刻
import { state } from './state.js';
import { checkAndJoinRoom, switchRoom } from './rooms.js';
import { handleCommand } from './commands.js';
import { setSystemMessageHook, setHacknetIRC } from './renderers.js';

export function isHacknet() {
  return document.body.classList.contains("theme-hacknet");
}

let netmapTimer = null;     // 节点地图轮询句柄
let netmapBound = false;    // 节点地图 click 是否已绑定
let terminalBound = false;  // 终端事件是否已绑定
let cmdHistory = [];        // 命令历史
let cmdIndex = -1;          // ↑↓ 游标（length = 新输入位）

const NETMAP_INTERVAL = 5000;

// ---------------- 生命周期 ----------------
export function applyHacknetLayout() {
  removeHacknetLayout();
  // ① 注入两个容器（fixed 定位，样式在 style.css body.theme-hacknet 块）
  const map = document.createElement("div");
  map.id = "hacknet-netmap";
  map.innerHTML = '<div class="hn-bar">NETMAP</div><div class="hn-body" id="hn-body"></div>';
  const term = document.createElement("div");
  term.id = "hacknet-terminal";
  term.innerHTML =
    '<div class="ht-bar">ROOT@HACKNET:~</div>' +
    '<div class="ht-output" id="ht-output"></div>' +
    '<div class="ht-row"><span class="ht-prompt">&gt;</span>' +
    '<input id="ht-input" autocomplete="off" spellcheck="false" tabindex="-1" aria-label="hacknet terminal"></div>';
  document.body.appendChild(map);
  document.body.appendChild(term);
  // ①.5 频道条下方的聊天室名横条（灰白底，切房时更新）
  const roomBar = document.createElement("div");
  roomBar.id = "hacknet-room-bar";
  document.body.appendChild(roomBar);
  updateRoomBar();
  // ② 命令终端
  initTerminal();
  // ③ 系统消息分流：系统指令/命令结果改道进终端（renderers.js hook）
  setSystemMessageHook((text) => termPrint(String(text), "ht-sys"));
  // ③.5 聊天消息 IRC 化（无气泡文本行 + 彩色昵称，复刻 Hacknet IRC）
  setHacknetIRC(true);
  // ④ 节点地图轮询
  startNetmap();
}

export function removeHacknetLayout() {
  setSystemMessageHook(null);
  setHacknetIRC(false);
  stopNetmap();
  const map = document.getElementById("hacknet-netmap");
  if (map) map.remove();
  const term = document.getElementById("hacknet-terminal");
  if (term) term.remove();
  const roomBar = document.getElementById("hacknet-room-bar");
  if (roomBar) roomBar.remove();
  terminalBound = false;
}

// 更新频道条下方的房间名横条
function updateRoomBar() {
  const bar = document.getElementById("hacknet-room-bar");
  if (!bar) return;
  bar.textContent = "CONNECTED TO #" + (state.roomname || "?");
}

// ---------------- 命令终端 ----------------
function initTerminal() {
  if (terminalBound) return;
  const out = document.getElementById("ht-output");
  const input = document.getElementById("ht-input");
  if (!out || !input) return;
  out.innerHTML = "";
  cmdHistory = [];
  cmdIndex = -1;
  termPrint("HACKNET OS v1.40", "ht-banner");
  termPrint("type /help for commands", "ht-banner");
  termPrint("========================================", "ht-dim");
  input.addEventListener("keydown", onTermKey);
  terminalBound = true;
}

function onTermKey(e) {
  const input = document.getElementById("ht-input");
  if (!input) return;
  if (e.key === "Enter") {
    const v = input.value.trim();
    input.value = "";
    if (!v) return;
    termPrint("> " + v, "ht-cmd");
    if (cmdHistory.length >= 200) cmdHistory.shift();
    cmdHistory.push(v);
    cmdIndex = cmdHistory.length;
    if (v.startsWith("/")) {
      try {
        handleCommand(v);
      } catch (err) {
        termPrint("ERROR: " + (err && err.message ? err.message : String(err)), "ht-warn");
      }
    } else {
      termPrint("命令必须以 / 开头，/help 查看全部命令", "ht-warn");
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (!cmdHistory.length) return;
    cmdIndex = Math.max(0, cmdIndex - 1);
    input.value = cmdHistory[cmdIndex];
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (cmdIndex >= cmdHistory.length - 1) {
      cmdIndex = cmdHistory.length;
      input.value = "";
    } else {
      cmdIndex += 1;
      input.value = cmdHistory[cmdIndex];
    }
  }
}

// textContent 渲染防 XSS；上限 500 行
function termPrint(text, cls) {
  const out = document.getElementById("ht-output");
  if (!out) return;
  while (out.childElementCount >= 500) out.removeChild(out.firstChild);
  const line = document.createElement("div");
  line.className = "ht-line" + (cls ? " " + cls : "");
  line.textContent = text;
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

// ---------------- 节点地图 ----------------
function startNetmap() {
  renderNetmap();
  netmapTimer = setInterval(renderNetmap, NETMAP_INTERVAL);
}

function stopNetmap() {
  if (netmapTimer) {
    clearInterval(netmapTimer);
    netmapTimer = null;
  }
  const body = document.getElementById("hn-body");
  if (body && netmapBound) {
    body.removeEventListener("click", onNetmapClick);
    netmapBound = false;
  }
}

// 节点地图：水平拓扑排布（贴合容器宽高比，节点随视口宽度缩放，不会被矮容器压小）
const NM_W = 1000, NM_H = 220;

function nm(v) { return Math.round(v * 10) / 10; }

function esc(s) {
  return String(s).replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
}

// 房间名 → 稳定伪随机数（同一房间每次刷新位置不变，避免跳动）
function hashStr(s) {
  let h = 7;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
  return h;
}

async function renderNetmap() {
  const body = document.getElementById("hn-body");
  if (!body) return;
  updateRoomBar(); // 5s 轮询同步房间名横条
  let rooms = {};
  try {
    const r = await fetch("/api/rooms/list");
    if (!r.ok) return;
    rooms = await r.json();
  } catch (err) { return; }
  const names = Object.keys(rooms);
  const n = names.length;
  // 纯随机散落：确定性 hash 生成随机位置 + 最小间距（不重叠、不跳动），更分散
  const areaX0 = 60, areaX1 = 940, areaY0 = 30, areaY1 = 206;
  const aw = areaX1 - areaX0, ah = areaY1 - areaY0;
  const nodePos = (() => {
    const placed = [];
    const cache = new Map();
    const minDist = 96;
    return (i) => {
      if (cache.has(i)) return cache.get(i);
      const hsh = hashStr(names[i]);
      let best = null;
      for (let attempt = 0; attempt < 30; attempt++) {
        const rx = ((hsh + attempt * 1013) % 1000) / 1000;
        const ry = ((hsh + attempt * 577 + 313) % 1000) / 1000;
        const x = areaX0 + rx * aw, y = areaY0 + ry * ah;
        let ok = true;
        for (const q of placed) {
          const dx = x - q.x, dy = y - q.y;
          if (dx * dx + dy * dy < minDist * minDist) { ok = false; break; }
        }
        if (ok) { best = { x, y }; break; }
      }
      if (!best) {
        // 兜底1：网格扫描找空位（确定性，避免全部堆叠到同一点）
        const scans = [48, 34];
        for (let pass = 0; pass < scans.length && !best; pass++) {
          const d2 = scans[pass] * scans[pass];
          for (let row = 0; row < 16 && !best; row++) {
            for (let col = 0; col < 16; col++) {
              const x = areaX0 + ((col + 0.5) / 16) * aw;
              const y = areaY0 + ((row + 0.5) / 16) * ah;
              let ok = true;
              for (const q of placed) {
                const dx = x - q.x, dy = y - q.y;
                if (dx * dx + dy * dy < d2) { ok = false; break; }
              }
              if (ok) { best = { x, y }; break; }
            }
          }
        }
      }
      if (!best) {
        // 兜底2（极端）：按序号错开摆放，绝不与既有节点重合
        const off = placed.length;
        best = { x: areaX0 + 34 + (off * 53) % (aw - 68), y: areaY0 + 34 + (off * 29) % (ah - 68) };
      }
      placed.push(best);
      cache.set(i, best);
      return best;
    };
  })();
  const nodes = names.map((_, i) => nodePos(i));
  let svg =
    '<svg viewBox="0 0 ' + NM_W + ' ' + NM_H + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' +
    '<defs>' +
    '<radialGradient id="hn-glow" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="#008BC7" stop-opacity="0.55"/>' +
    '<stop offset="100%" stop-color="#008BC7" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="hn-glow-cur" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="#5FDC53" stop-opacity="0.6"/>' +
    '<stop offset="100%" stop-color="#5FDC53" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="hn-ink" cx="40%" cy="35%" r="70%">' +
    '<stop offset="0%" stop-color="#2A2A2A"/>' +
    '<stop offset="100%" stop-color="#060606"/></radialGradient>' +
    '</defs>';
  // 错综复杂连线：每个节点按确定性 hash 连 2~4 条到其他节点（多交叉网络拓扑，复刻 NetworkMap links）
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const hsh = hashStr(names[i] + "::link");
    const linkCount = 2 + (hsh % 3); // 每节点 2~4 条
    for (let k = 0; k < linkCount; k++) {
      const t = (i + 1 + ((hsh >>> (k * 4)) % Math.max(1, n - 1))) % n;
      if (t === i) continue;
      const key = Math.min(i, t) + ":" + Math.max(i, t);
      if (seen.has(key)) continue;
      seen.add(key);
      const a = nodes[i], b = nodes[t];
      svg += '<line x1="' + nm(a.x) + '" y1="' + nm(a.y) + '" x2="' + nm(b.x) + '" y2="' + nm(b.y) + '" stroke="#444444" stroke-width="1.5"/>';
    }
  }
  // 房间节点（点击圆点=进入该房间；当前房间绿 + 光晕）
  names.forEach((name, i) => {
    const p = nodes[i];
    const x = p.x, y = p.y;
    const info = rooms[name];
    const count = typeof info === "object" ? (info.count || 0) : (info || 0);
    const hasPwd = typeof info === "object" && !!info.hasPassword;
    const current = name === state.roomname;
    const label = name.length > 12 ? name.slice(0, 12) + "…" : name;
    // Hacknet 节点（复刻 NetworkMap nodeGlow/nodeCircle/targetNodeCircle 多层绘制）：
    // 外光晕 + 内发光深底圆 + 主描边环 + 内圈细环 + 中心高光点；当前节点白心+大光晕
    const col = current ? "#5FDC53" : "#008BC7";
    const glow = current ? "url(#hn-glow-cur)" : "url(#hn-glow)";
    const ringR = current ? 17 : 15;
    svg += '<g class="hn-node' + (current ? " current" : "") + '" data-room="' + esc(name) + '">' +
      (current ? '<animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite"/>' : '') +
      '<circle cx="' + nm(x) + '" cy="' + y + '" r="' + (current ? 42 : 36) + '" fill="' + glow + '"/>' +
      '<circle cx="' + nm(x) + '" cy="' + y + '" r="' + ringR + '" fill="url(#hn-ink)"/>' +
      '<circle cx="' + nm(x) + '" cy="' + y + '" r="' + ringR + '" fill="none" stroke="' + col + '" stroke-width="2"/>' +
      '<circle cx="' + nm(x) + '" cy="' + y + '" r="' + (current ? 10 : 8) + '" fill="none" stroke="' + col + '" stroke-opacity="0.55" stroke-width="1.5"/>' +
      '<circle cx="' + nm(x) + '" cy="' + y + '" r="' + (current ? 4.5 : 3.5) + '" fill="' + (current ? "#ffffff" : col) + '"/>' +
      '</g>';
    svg += '<text x="' + nm(x) + '" y="' + (y + 34) + '" text-anchor="middle" fill="#D5F5FF" font-size="13">' + esc(label) + (hasPwd ? ' 🔒' : '') + '</text>' +
      '<text x="' + nm(x) + '" y="' + (y + 48) + '" text-anchor="middle" fill="#5A5A5A" font-size="11">' + count + ' ONLINE</text>';
  });
  svg += '</svg>';
  body.innerHTML = svg;
  if (!netmapBound) {
    body.addEventListener("click", onNetmapClick);
    netmapBound = true;
  }
}

// 已初始化后的切房：复用 rooms.js 通用 switchRoom（密码校验 + 关旧 WS + 重连），再同步房间名横条
function switchHacknetRoom(name) {
  (async () => {
    await switchRoom(name);
    updateRoomBar();
  })();
}

function onNetmapClick(e) {
  const node = e.target && e.target.closest ? e.target.closest(".hn-node") : null;
  if (!node || !node.dataset || !node.dataset.room) return;
  const name = node.dataset.room;
  if (name === state.roomname) return;
  if (!window._chatStarted) {
    checkAndJoinRoom(name);      // 首次：走完整初始化（含事件绑定 + 连接）
  } else {
    switchHacknetRoom(name);     // 已初始化：手动切房重连（startChat 幂等会直接 return）
  }
  setTimeout(renderNetmap, 800); // 切房后刷新当前房间高亮（body 移除时 renderNetmap 内部安全返回）
}
