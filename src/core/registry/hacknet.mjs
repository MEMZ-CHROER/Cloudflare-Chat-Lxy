// v1.43 Hacknet 双人对战破解小游戏 — 服务端权威状态机
// 全部局状态存 registry.hacknetGames（Map<gameId, game>），经 /hn/* 端点操作
// 计时（trace 超时惩罚 / 密码暴露恢复 / AI tick）由 registry DO alarm 驱动（事件表 hnTimers）
// 破解进度采用"惰性推进"：status/action 读取时按 startedAt+duration 结算（前端 2s 轮询驱动）
//
// 玩法要点（HNminigame.txt）：
//   · 双方各 x 个带密码聊天室（系统自动创建，密码仅房主可知）
//   · 防御：端口 / 代理proxy / 防火墙firewall / 追踪trace|Track（每方基地 tracer 类型）
//   · 攻击链：锁定敌方房 → 破全部端口 → ProxyOverlay 破代理 → analyze/solve 破防火墙
//            → PortHack 打通 → HeartTag 改 Heart → 敌方全部 Heart 被改 → 胜
//   · Trace：锁定敌方房后第一条攻击命令激活敌方基地 tracer（对攻击者 60-90s 倒计时），
//     超时未断开 → trace 惩罚=随机暴露攻击者一个基地房密码 60s / track 惩罚=随机改其一个 Heart
//   · pve：AI 由 alarm 每 15-30s 推进一步，AI 死磕同一目标会被玩家基地 tracer 惩罚

import { safeEqual } from "../utils.mjs";

// ---------- 常量 ----------
// 破解器：端口 → {名称, 耗时 ms}（按端口常识，确定性成功）
const CRACKERS = {
  211: { name: "FTPSprint", duration: 4800 },
  6379: { name: "RedisCrack", duration: 4800 },
  21: { name: "FTPBounce", duration: 8000 },
  3389: { name: "RDPCrack", duration: 9000 },
  22: { name: "SSHCrack", duration: 10000 },
  3306: { name: "MySQLCrack", duration: 11000 },
  25: { name: "SMTPoverflow", duration: 12000 },
  1433: { name: "SQLCrack", duration: 12000 },
  443: { name: "SSLTrojan", duration: 14000 },
  80: { name: "WebServerWorm", duration: 15000 },
};
const PROXY_DURATION = 20000;      // ProxyOverlay 缓慢破解代理
const PORTHACK_DURATION = 6000;    // PortHack 打通
const TRACE_MIN = 60000;           // 追踪下限（满足"不低于 1 分钟"）
const TRACE_RANGE = 30000;         // +0~30s → 60~90s
const PWD_EXPOSE_MS = 60000;       // trace 惩罚：密码暴露时长
const TICKET_TTL = 60000;          // 单次入场 ticket 有效期
const MAX_X = 5, MIN_X = 1;
const HEX = "0123456789abcdef";
const TAG_WHITELIST = /^[a-zA-Z0-9_\-一-龥]{1,20}$/; // Heart tag 白名单（禁特权色，禁空白/符号注入）
const AI_TICK_MIN = 15000, AI_TICK_RANGE = 15000; // AI 步进 15-30s
const SESSION_TTL = 30 * 60 * 1000;  // 游戏会话 sid 有效期（前端轮询 /status 用，省 token 校验）

// ---------- 小工具 ----------
const json = (obj, status) => new Response(JSON.stringify(obj), {
  status: status || 200, headers: { "Content-Type": "application/json" }
});
const ok = (msg, extra) => json(Object.assign({ ok: true, msg: msg || "" }, extra || {}));
const err = (msg, status) => json({ ok: false, error: msg || "操作失败" }, status || 400);

function randInt(n) { return Math.floor(Math.random() * n); }
function randChoice(arr) { return arr[randInt(arr.length)]; }
function genPassword(len) {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[randInt(chars.length)];
  return s;
}
function genGameId() {
  return "hn" + Date.now().toString(36) + randInt(1296).toString(36).padStart(2, "0");
}
export function genPorts() {
  const all = Object.keys(CRACKERS).map(Number);
  const n = 2 + randInt(3); // 2~4
  const picked = [], pool = all.slice();
  for (let i = 0; i < n && pool.length; i++) picked.push(pool.splice(randInt(pool.length), 1)[0]);
  return picked;
}
function genFirewallCode() {
  const len = Math.random() < 0.5 ? 6 : 9;
  let s = "";
  for (let i = 0; i < len; i++) s += HEX[randInt(16)];
  return s;
}
function aiTickInterval() { return AI_TICK_MIN + randInt(AI_TICK_RANGE); }
function traceDuration() { return TRACE_MIN + randInt(TRACE_RANGE); }

function sideOf(game, name) {
  if (game.sides.a === name) return "a";
  if (game.sides.b === name) return "b";
  return null;
}
function otherSide(side) { return side === "a" ? "b" : "a"; }

// 玩家参与的局（active 优先，否则 waiting）；excludeId 跳过指定局（accept 时排除自己正要接受的 waiting 挑战）
function findGameFor(reg, name, excludeId) {
  let waiting = null;
  for (const [, game] of reg.hacknetGames) {
    if (!game || !game.sides) continue;
    if (excludeId && game.id === excludeId) continue;
    if (game.sides.a !== name && game.sides.b !== name) continue;
    if (game.state === "active") return game;
    if (game.state === "waiting" && !waiting) waiting = game;
  }
  return waiting;
}

// ---------- 房间 / 基地 ----------
function createRoom(game, side, roomName) {
  const room = {
    name: roomName,
    owner: game.bases[side].owner,
    password: genPassword(8),
    ports: genPorts(),
    proxy: Math.random() < 0.6,
    firewall: Math.random() < 0.6,
    firewallCode: genFirewallCode(),
    firewallRevealed: 0,
    crack: {},            // port -> {startedAt, duration}（破解中）
    crackDone: {},        // port -> true（已完成）
    proxyCrack: null,     // {startedAt, duration}
    proxyBroken: false,
    firewallBroken: false,
    porthack: null,       // {startedAt, duration, by}
    crackedBy: null,      // 打通该房的攻击方 side
    hearts: [{ tag: "Heart", taggedBy: null }],
    passwordExposedUntil: null,
    _origPwd: null,       // 密码暴露前的原密码（恢复用）
  };
  return room;
}

function createBaseRooms(reg, game, side) {
  for (let i = 0; i < game.x; i++) {
    const roomName = "hn-" + game.id + "-" + side + (i + 1);
    const room = createRoom(game, side, roomName);
    game.bases[side].rooms[roomName] = room;
    reg.rooms.set(roomName, { count: 0, password: room.password });
  }
  return reg.save();
}

function createGame(mode, name, opponent, x) {
  const id = genGameId();
  const n = Math.max(MIN_X, Math.min(MAX_X, x || 3));
  const game = {
    id,
    mode, // "pve" | "pvp"
    state: mode === "pve" ? "active" : "waiting",
    winner: null,
    x: n,
    createdAt: Date.now(),
    startedAt: mode === "pve" ? Date.now() : null,
    endedAt: null,
    sides: { a: name, b: mode === "pve" ? "__AI__" : opponent },
    tracer: { a: randChoice(["trace", "track"]), b: randChoice(["trace", "track"]) },
    bases: {
      a: { owner: name, rooms: {} },
      b: { owner: mode === "pve" ? "__AI__" : opponent, rooms: {} },
    },
    player: {
      [name]: { currentTarget: null, trace: null, traceTriggered: false, exposed: [] },
    },
    ai: mode === "pve" ? { side: "b", status: "idle", nextTickAt: 0, trace: null } : null,
  };
  if (mode === "pvp") {
    game.player[opponent] = { currentTarget: null, trace: null, traceTriggered: false, exposed: [] };
  }
  return game;
}

function myRoomsWithPwd(game, name) {
  const side = sideOf(game, name);
  if (!side) return [];
  return Object.entries(game.bases[side].rooms).map(([room, r]) => ({ room, password: r.password }));
}

// ---------- 进度惰性推进 ----------
function resolveRoomProgress(room) {
  const now = Date.now();
  for (const [port, c] of Object.entries(room.crack)) {
    if (now - c.startedAt >= c.duration) {
      room.crackDone[port] = true;
      delete room.crack[port];
    }
  }
  if (room.proxyCrack && now - room.proxyCrack.startedAt >= room.proxyCrack.duration) {
    room.proxyBroken = true;
    room.proxyCrack = null;
  }
  if (room.porthack && now - room.porthack.startedAt >= room.porthack.duration) {
    room.crackedBy = room.porthack.by;
    room.porthack = null;
  }
}

function resolveAllProgress(game) {
  for (const side of ["a", "b"]) {
    for (const room of Object.values(game.bases[side].rooms)) resolveRoomProgress(room);
  }
}

function canPorthack(room) {
  const portsDone = room.ports.every(p => room.crackDone[p]);
  if (!portsDone) return false;
  if (room.proxy && !room.proxyBroken) return false;
  if (room.firewall && !room.firewallBroken) return false;
  return true;
}

// ---------- Trace 状态机 ----------
// 触发：锁定敌方房后第一条攻击动作（crack/proxy/analyze/porthack）
function startTrace(reg, game, side) {
  const p = game.player[game.sides[side]];
  if (!p) return;
  if (p.trace && p.trace.active) return; // 已激活不重置（需求："第一步操作激活"，一次性倒计时）
  const enemy = otherSide(side);
  p.trace = {
    active: true,
    kind: game.tracer[enemy], // 敌方基地的追踪守护进程类型
    target: p.currentTarget,
    deadline: Date.now() + traceDuration(),
  };
  reg.hnAddTimer({ at: p.trace.deadline, type: "hn_trace", gameId: game.id, payload: { side } });
}

function clearTrace(reg, game, side) {
  const p = game.player[game.sides[side]];
  if (p && p.trace && p.trace.active) p.trace = null;
}

// 玩家被追踪超时 → 惩罚（trace: 暴露攻击者一个基地房密码 / track: 随机改其一个 Heart）
async function applyTraceTimeout(reg, game, side) {
  const p = game.player[game.sides[side]];
  if (!p || !p.trace || !p.trace.active) return;
  p.trace.active = false;
  p.traceTriggered = true;
  const kind = p.trace.kind;
  const enemy = otherSide(side);
  if (kind === "trace") {
    const entries = Object.entries(game.bases[side].rooms).filter(([, r]) => !r.passwordExposedUntil);
    if (entries.length) {
      const [roomName, room] = entries[randInt(entries.length)];
      room.passwordExposedUntil = Date.now() + PWD_EXPOSE_MS;
      room._origPwd = room.password;
      const rr = reg.rooms.get(roomName);
      if (rr) rr.password = null; // 暴露：密码校验放行（任何人可进）
      p.exposed.push({ room: roomName, until: room.passwordExposedUntil });
      reg.hnAddTimer({ at: room.passwordExposedUntil, type: "hn_restore_pwd", gameId: game.id, payload: { side, room: roomName } });
      await reg.save();
    }
  } else {
    // track：随机改攻击者一个未被改的 Heart，计入追踪者进度
    const candidates = [];
    for (const r of Object.values(game.bases[side].rooms)) {
      for (const h of r.hearts) if (!h.taggedBy) candidates.push({ r, h });
    }
    if (candidates.length) {
      const pick = candidates[randInt(candidates.length)];
      pick.h.tag = "TRACKED";
      pick.h.taggedBy = enemy;
      await checkWin(reg, game, enemy);
    }
  }
  await reg.saveHacknetGames();
}

// 密码暴露到期恢复
async function restorePwd(reg, game, side, roomName, isAi) {
  const rr = reg.rooms.get(roomName);
  const room = game.bases[side].rooms[roomName];
  if (room) {
    room.passwordExposedUntil = null;
    const orig = room._origPwd;
    room._origPwd = null;
    if (rr) rr.password = orig || genPassword(8);
  }
  if (!isAi) {
    const p = game.player[game.sides[side]];
    if (p && p.exposed) p.exposed = p.exposed.filter(e => e.room !== roomName);
  }
  await reg.save();
  await reg.saveHacknetGames();
}

// ---------- 判胜 ----------
async function checkWin(reg, game, side) {
  if (game.state !== "active") return;
  const enemy = otherSide(side);
  const rooms = Object.values(game.bases[enemy].rooms);
  if (!rooms.length) return;
  const allTagged = rooms.every(r => r.hearts.every(h => h.taggedBy === side));
  if (allTagged) {
    game.state = "ended";
    game.winner = side;
    game.endedAt = Date.now();
    await cleanupRooms(reg, game);
    await reg.saveHacknetGames();
  }
}

// 结束：删除房间注册条目 + 清该局 timer 事件
async function cleanupRooms(reg, game) {
  for (const side of ["a", "b"]) {
    for (const roomName of Object.keys(game.bases[side].rooms)) reg.rooms.delete(roomName);
  }
  reg.hnTimers = reg.hnTimers.filter(t => t.gameId !== game.id);
  await reg.save();
}

// ---------- 入场 ticket ----------
async function issueTicket(reg, roomName) {
  const ticket = genPassword(24);
  const expiry = Date.now() + TICKET_TTL;
  const list = reg.hnTickets.get(roomName) || [];
  list.push({ ticket, expiry });
  reg.hnTickets.set(roomName, list);
  return { ticket, expiry };
}

// ---------- AI（pve） ----------
function startAiTrace(reg, game, target) {
  const ai = game.ai;
  if (!ai) return;
  if (ai.trace && ai.trace.active && ai.trace.target === target) return;
  ai.trace = { active: true, kind: game.tracer["a"], target, deadline: Date.now() + traceDuration(), side: "b" };
  reg.hnAddTimer({ at: ai.trace.deadline, type: "hn_trace", gameId: game.id, payload: { side: "b", ai: true } });
}

// AI 死磕被玩家基地 tracer 追踪超时 → 惩罚（暴露 AI 房密码 / 改 AI Heart 计入玩家进度）
async function applyAiTracePunish(reg, game) {
  const ai = game.ai;
  const kind = (ai.trace && ai.trace.kind) || "trace";
  if (kind === "trace") {
    const entries = Object.entries(game.bases.b.rooms).filter(([, r]) => !r.passwordExposedUntil);
    if (entries.length) {
      const [roomName, room] = entries[randInt(entries.length)];
      room.passwordExposedUntil = Date.now() + PWD_EXPOSE_MS;
      room._origPwd = room.password;
      const rr = reg.rooms.get(roomName);
      if (rr) rr.password = null;
      reg.hnAddTimer({ at: room.passwordExposedUntil, type: "hn_restore_pwd", gameId: game.id, payload: { side: "b", ai: true, room: roomName } });
      await reg.save();
    }
  } else {
    outer:
    for (const r of Object.values(game.bases.b.rooms)) {
      for (const h of r.hearts) {
        if (!h.taggedBy) { h.tag = "TRACKED"; h.taggedBy = "a"; await checkWin(reg, game, "a"); break outer; }
      }
    }
  }
}

async function aiStep(reg, game) {
  const ai = game.ai;
  if (!ai || game.state !== "active") return;
  const now = Date.now();
  // 1. AI trace 处理
  if (ai.trace && ai.trace.active) {
    if (ai.currentTarget !== ai.trace.target || !ai.currentTarget) {
      ai.trace = null; // AI 换目标（等效 dc）→ 停止追踪
    } else if (now >= ai.trace.deadline) {
      await applyAiTracePunish(reg, game);
      ai.trace = null;
      ai.status = "punished";
      ai.currentTarget = null;
    }
  }
  // 2. 推进攻击
  let target = ai.currentTarget;
  if (!target || !game.bases.a.rooms[target]) {
    const names = Object.keys(game.bases.a.rooms);
    if (!names.length) return;
    target = names[randInt(names.length)];
    ai.currentTarget = target;
    startAiTrace(reg, game, target);
  }
  const room = game.bases.a.rooms[target];
  if (!room.crackedBy) {
    // 未打通：逐步推进
    const port = room.ports.find(p => !room.crackDone[p]);
    if (port) room.crackDone[port] = true;
    else if (room.proxy && !room.proxyBroken) room.proxyBroken = true;
    else if (room.firewall && !room.firewallBroken) room.firewallBroken = true;
    else { room.crackedBy = "b"; ai.currentTarget = null; }
  } else {
    // 已打通：改 Heart
    const h = room.hearts.find(x => x.taggedBy !== "b");
    if (h) { h.tag = "PWNED"; h.taggedBy = "b"; await checkWin(reg, game, "b"); }
    ai.currentTarget = null;
  }
  // 3. 调度下个 tick（若局未结束）
  if (game.state === "active") {
    ai.nextTickAt = Date.now() + aiTickInterval();
    reg.hnAddTimer({ at: ai.nextTickAt, type: "hn_ai_tick", gameId: game.id, payload: {} });
  }
  await reg.saveHacknetGames();
}

// ---------- alarm 事件处理（registry.alarm() 调） ----------
export async function processHnTimer(reg, evt) {
  const game = reg.hacknetGames.get(evt.gameId);
  if (!game || game.state !== "active") return;
  if (evt.type === "hn_trace") {
    if (evt.payload && evt.payload.ai) {
      const ai = game.ai;
      if (ai && ai.trace && ai.trace.active && ai.trace.deadline <= Date.now()) {
        await applyAiTracePunish(reg, game);
        ai.trace = null;
        ai.status = "punished";
        ai.currentTarget = null;
        await reg.saveHacknetGames();
      }
    } else {
      const side = evt.payload && evt.payload.side;
      const p = game.player && game.player[game.sides[side]];
      if (p && p.trace && p.trace.active && !p.traceTriggered) {
        await applyTraceTimeout(reg, game, side);
      }
    }
  } else if (evt.type === "hn_restore_pwd") {
    await restorePwd(reg, game, evt.payload.side, evt.payload.room, !!evt.payload.ai);
  } else if (evt.type === "hn_ai_tick") {
    await aiStep(reg, game);
  }
}

// ---------- 游戏会话 sid（status 轮询轻量鉴权） ----------
function ensureSession(reg, name) {
  if (!reg.hnSessions) reg.hnSessions = new Map();
  const now = Date.now();
  for (const [sid, s] of reg.hnSessions) {
    if (s.name === name && s.expiry > now) {
      s.expiry = now + SESSION_TTL; // 滚动续期
      return sid;
    }
  }
  const sid = genPassword(24);
  reg.hnSessions.set(sid, { name, expiry: now + SESSION_TTL });
  return sid;
}

// ---------- /status 脱敏 ----------
export function sanitizeStatus(game, name) {
  const side = sideOf(game, name);
  if (!side) return null;
  const enemy = otherSide(side);
  const p = game.player[name] || { currentTarget: null, trace: null, traceTriggered: false, exposed: [] };
  const mineRooms = Object.values(game.bases[side].rooms).map(r => ({
    room: r.name, password: r.password, ports: r.ports,
    proxy: !!r.proxy, proxyBroken: !!r.proxyBroken,
    firewall: !!r.firewall, firewallBroken: !!r.firewallBroken,
    hearts: r.hearts.map(h => ({ tag: h.tag, taggedBy: h.taggedBy })),
    crackedBy: r.crackedBy,
    passwordExposed: r.passwordExposedUntil ? Math.max(0, Math.round((r.passwordExposedUntil - Date.now()) / 1000)) : null,
  }));
  const enemyRooms = Object.values(game.bases[enemy].rooms).map(r => ({
    room: r.name,
    ports: r.ports.map(port => ({ port, cracked: !!r.crackDone[port], cracking: !!r.crack[port] })),
    proxy: { present: !!r.proxy, broken: !!r.proxyBroken, cracking: !!r.proxyCrack },
    firewall: { present: !!r.firewall, broken: !!r.firewallBroken, revealed: r.firewallRevealed, totalLen: r.firewall ? r.firewallCode.length : 0 },
    crackedBy: r.crackedBy, // null | "me" | "them"
    hearts: r.hearts.map(h => ({ tag: h.tag, taggedBy: h.taggedBy })),
    passwordExposed: r.passwordExposedUntil ? Math.max(0, Math.round((r.passwordExposedUntil - Date.now()) / 1000)) : null,
  }));
  return {
    id: game.id, mode: game.mode, state: game.state, winner: game.winner, x: game.x,
    sides: game.sides, tracer: game.tracer, you: name, side,
    player: {
      currentTarget: p.currentTarget,
      trace: p.trace && p.trace.active ? {
        kind: p.trace.kind, remainingMs: Math.max(0, p.trace.deadline - Date.now()),
      } : null,
      traceTriggered: !!p.traceTriggered,
      exposed: (p.exposed || []).map(e => ({ room: e.room, remainingMs: Math.max(0, e.until - Date.now()) })),
    },
    bases: { mine: mineRooms, enemy: enemyRooms },
    ai: game.ai ? { status: game.ai.status } : undefined,
  };
}

// ---------- 各端点 handler ----------
async function handleNew(reg, params) {
  const name = String(params.name || "").trim();
  if (!name) return err("缺少玩家名");
  if (findGameFor(reg, name)) return err("你已在一局游戏中，先 /hn quit 结束");
  const mode = params.mode === "pvp" ? "pvp" : "pve";
  const x = Math.max(MIN_X, Math.min(MAX_X, parseInt(params.x, 10) || 3));
  if (mode === "pve") {
    const game = createGame("pve", name, null, x);
    createBaseRooms(reg, game, "a");
    createBaseRooms(reg, game, "b");
    game.ai.nextTickAt = Date.now() + aiTickInterval();
    reg.hnAddTimer({ at: game.ai.nextTickAt, type: "hn_ai_tick", gameId: game.id, payload: {} });
    reg.hacknetGames.set(game.id, game);
    await reg.saveHacknetGames();
    return ok("HACKNET 对战开始（vs AI，每方 " + game.x + " 房）。你的基地密码见 /hn status", {
      gameId: game.id, mode: "pve", rooms: myRoomsWithPwd(game, name),
    });
  }
  const opponent = String(params.opponent || "").trim();
  if (!opponent || opponent === name) return err("请提供对手名（/hn new pvp vs <玩家名>）");
  if (findGameFor(reg, opponent)) return err("对手已在一局游戏中");
  const game = createGame("pvp", name, opponent, x);
  reg.hacknetGames.set(game.id, game);
  await reg.saveHacknetGames();
  return ok("挑战已发出，等待 " + opponent + " 用 /hn accept " + game.id + " 应战", {
    gameId: game.id, mode: "pvp",
  });
}

async function handleAccept(reg, params) {
  const name = String(params.name || "").trim();
  const gameId = String(params.gameId || "").trim();
  const game = reg.hacknetGames.get(gameId);
  if (!game || game.mode !== "pvp" || game.state !== "waiting") return err("挑战不存在或已过期");
  if (game.sides.b !== name) return err("这不是发给你的挑战");
  // 🔧 v1.43: 排除自身正接受的 waiting 挑战（findGameFor 会把 sides.b=自己的 waiting 局也算"已在一局"）
  if (findGameFor(reg, name, gameId)) return err("你已在一局游戏中");
  game.state = "active";
  game.startedAt = Date.now();
  createBaseRooms(reg, game, "a");
  createBaseRooms(reg, game, "b");
  await reg.saveHacknetGames();
  return ok("应战成功，双方基地已建立！", { gameId: game.id, rooms: myRoomsWithPwd(game, name) });
}

async function handleStatus(reg, params) {
  // 优先走 sid（前端轮询，api 层不 user-check-auth）；无 sid 用 name（api 层已 token 校验）
  let name = "";
  const sid = String(params.sid || "");
  if (sid) {
    const sess = reg.hnSessions && reg.hnSessions.get(sid);
    if (sess && sess.expiry > Date.now()) name = sess.name;
    else return err("会话已过期，请重新操作以刷新", 401);
  } else {
    name = String(params.name || "").trim();
    if (!name) return err("缺少玩家名", 400);
  }
  let game = findGameFor(reg, name);
  // 不在进行中的局 → 返回最近结束的一局（前端胜负横幅依赖；游戏结束/重启后仍能看到结果）
  if (!game) {
    let lastEnded = null;
    for (const [, g] of reg.hacknetGames) {
      if (g && g.state === "ended" && g.sides && (g.sides.a === name || g.sides.b === name)) {
        if (!lastEnded || g.endedAt > lastEnded.endedAt) lastEnded = g;
      }
    }
    if (lastEnded) return json({ ok: true, game: sanitizeStatus(lastEnded, name), sid: ensureSession(reg, name) });
    return json({ ok: true, game: null, sid: ensureSession(reg, name) });
  }
  resolveAllProgress(game);
  await reg.saveHacknetGames();
  return json({ ok: true, game: sanitizeStatus(game, name), sid: ensureSession(reg, name) });
}

async function handleConnect(reg, params) {
  const name = String(params.name || "").trim();
  const roomName = String(params.room || "").trim();
  const game = findGameFor(reg, name);
  if (!game || game.state !== "active") return err("未在游戏中");
  const side = sideOf(game, name);
  const p = game.player[name];
  const mine = game.bases[side].rooms[roomName];
  const enRoom = game.bases[otherSide(side)].rooms[roomName];
  if (mine) {
    clearTrace(reg, game, side);
    p.currentTarget = null;
    await reg.saveHacknetGames();
    return ok("连接 #" + roomName + "（己方基地，需密码）", { mode: "enter", mine: true });
  }
  if (enRoom) {
    resolveRoomProgress(enRoom); // 结算惰性进度（porthack 完成后 connect 才能识别"已打通"入场）
    if (p.currentTarget && p.currentTarget !== roomName) clearTrace(reg, game, side);
    if (enRoom.crackedBy === side) {
      clearTrace(reg, game, side);
      const t = await issueTicket(reg, roomName);
      // 保留 currentTarget：进入已打通房后玩家仍需 HeartTag（清空会导致"未锁定敌方房间"）
      await reg.saveHacknetGames();
      return ok("连接 #" + roomName + "（已打通，入场授权已签发）", { mode: "enter", ticket: t.ticket, expiry: t.expiry });
    }
    p.currentTarget = roomName;
    await reg.saveHacknetGames();
    return ok("CONNECTED TO #" + roomName + " (REMOTE) — 使用破解器攻破端口（首个攻击动作将触发追踪）", { mode: "lock" });
  }
  return ok("非游戏房间，走正常连接流程", { mode: "normal" });
}

async function handleDisconnect(reg, params) {
  const name = String(params.name || "").trim();
  const game = findGameFor(reg, name);
  if (!game || game.state !== "active") return err("未在游戏中");
  const side = sideOf(game, name);
  const p = game.player[name];
  if (p) { p.currentTarget = null; clearTrace(reg, game, side); }
  await reg.saveHacknetGames();
  return ok("连接已断开，追踪警报解除");
}

async function handleTicket(reg, params) {
  const name = String(params.name || "").trim();
  const roomName = String(params.room || "").trim();
  const game = findGameFor(reg, name);
  if (!game || game.state !== "active") return err("未在游戏中");
  const side = sideOf(game, name);
  const enRoom = game.bases[otherSide(side)].rooms[roomName];
  if (!enRoom) return err("目标房间不存在");
  if (enRoom.crackedBy !== side) return err("尚未打通该房间，无法取得入场授权");
  const t = await issueTicket(reg, roomName);
  return ok("入场授权已签发（60 秒有效，单次使用）", { ticket: t.ticket, expiry: t.expiry });
}

async function handleQuit(reg, params) {
  const name = String(params.name || "").trim();
  const game = findGameFor(reg, name);
  if (!game) return err("未在游戏中");
  if (game.state !== "active") {
    reg.hacknetGames.delete(game.id);
    await reg.saveHacknetGames();
    return ok("已取消该局");
  }
  const side = sideOf(game, name);
  game.state = "ended";
  game.winner = otherSide(side);
  game.endedAt = Date.now();
  await cleanupRooms(reg, game);
  await reg.saveHacknetGames();
  return ok("你认输了，获胜者是 " + (game.sides[game.winner] || "对方"), { winner: game.sides[game.winner] });
}

// ---------- 攻击动作 ----------
function currentTargetRoom(game, side) {
  const p = game.player[game.sides[side]];
  const t = p && p.currentTarget;
  if (!t) return null;
  return game.bases[otherSide(side)].rooms[t] || null;
}

// 未锁定提示：附上敌方基地房间名，直接引导用户 /connect 正确的攻击目标
function lockError(game, side) {
  const list = Object.values(game.bases[otherSide(side)].rooms).map(r => "#" + r.name).join("  ");
  return err("未锁定敌方房间 — 敌方基地: " + (list || "无") + "（/connect 敌方房 锁定攻击目标）");
}

async function handleAction(reg, params) {
  const name = String(params.name || "").trim();
  const cmd = String(params.cmd || "").trim().toLowerCase();
  const game = findGameFor(reg, name);
  if (!game || game.state !== "active") return err("未在游戏中");
  const side = sideOf(game, name);
  const p = game.player[name];
  let room = currentTargetRoom(game, side);

  const CMDS = ["scan", "probe", "crack", "proxy", "analyze", "solve", "porthack", "hearttag"];
  if (!CMDS.includes(cmd)) return err("未知命令 " + cmd);

  if (cmd === "scan") {
    const lines = [];
    lines.push("— 己方基地（" + game.x + " 房）—");
    for (const r of Object.values(game.bases[side].rooms)) {
      lines.push("  #" + r.name + (r.crackedBy ? " [被入侵!]" : "") + (r.passwordExposedUntil ? " [密码暴露!]" : ""));
    }
    lines.push("— 敌方基地（" + game.x + " 房）—");
    for (const r of Object.values(game.bases[otherSide(side)].rooms)) {
      lines.push("  #" + r.name + " 端口[" + r.ports.join(",") + "]" + (r.proxy ? " P" : "") + (r.firewall ? " FW" : "") + (r.crackedBy ? " [已打通]" : ""));
    }
    lines.push(p.trace && p.trace.active
      ? "⚠ 你正被追踪(" + p.trace.kind + ") " + Math.max(0, Math.round((p.trace.deadline - Date.now()) / 1000)) + "s"
      : "无追踪警报");
    return ok(lines.join("\n"));
  }

  if (cmd === "probe") {
    if (!room) return lockError(game, side);
    resolveRoomProgress(room);
    const lines = ["目标 #" + room.name + " 情报："];
    lines.push("  端口: " + room.ports.map(pp => pp + (room.crackDone[pp] ? "✓" : room.crack[pp] ? "…" : "✗")).join("  "));
    lines.push("  代理: " + (room.proxy ? (room.proxyBroken ? "已破解✓" : room.proxyCrack ? "破解中…" : "ACTIVE ✗") : "无"));
    lines.push("  防火墙: " + (room.firewall ? (room.firewallBroken ? "已破解✓" : "ACTIVE（已揭示 " + room.firewallRevealed + "/" + room.firewallCode.length + "）") : "无"));
    lines.push(room.crackedBy ? "  状态: 已打通" : "  状态: 加密");
    await reg.saveHacknetGames();
    return ok(lines.join("\n"));
  }

  if (!room) {
    // hearttag 豁免：target 丢失（进了敌方已打通房 / 回了自己基地）时回退到我方已打通的敌方房间
    if (cmd === "hearttag") {
      const enSide = otherSide(side);
      room = Object.values(game.bases[enSide].rooms).find(r => r.crackedBy === side && r.hearts.some(h => h.taggedBy !== side)) || null;
    }
    if (!room) return lockError(game, side);
  }
  resolveRoomProgress(room);
  if (room.crackedBy && cmd !== "hearttag") return err("该房间已被打通（" + (room.crackedBy === side ? "你" : "对方") + "）");

  switch (cmd) {
    case "crack": {
      const port = Number(params.port);
      const cr = CRACKERS[port];
      if (!cr) return err("未知端口 " + port + "（可用端口: " + Object.keys(CRACKERS).join(",") + "）");
      if (!room.ports.includes(port)) return err("该房间没有开放端口 " + port + "（本房开放: " + room.ports.join(",") + "）");
      if (room.crackDone[port]) return err("端口 " + port + " 已破解完成");
      if (room.crack[port]) return err("端口 " + port + " 破解中…");
      room.crack[port] = { startedAt: Date.now(), duration: cr.duration };
      startTrace(reg, game, side);
      await reg.saveHacknetGames();
      return ok("破解器启动：" + cr.name + " " + port + " …（" + Math.round(cr.duration / 1000) + "s）", {
        progress: { kind: "crack", port, startedAt: room.crack[port].startedAt, duration: cr.duration },
      });
    }
    case "proxy": {
      if (!room.proxy) return err("该房间没有代理保护");
      if (room.proxyBroken) return err("代理已破解");
      if (room.proxyCrack) return err("代理破解中…");
      room.proxyCrack = { startedAt: Date.now(), duration: PROXY_DURATION };
      startTrace(reg, game, side);
      await reg.saveHacknetGames();
      return ok("ProxyOverlay 正在覆盖代理…（" + Math.round(PROXY_DURATION / 1000) + "s）", {
        progress: { kind: "proxy", startedAt: room.proxyCrack.startedAt, duration: PROXY_DURATION },
      });
    }
    case "analyze": {
      if (!room.firewall) return err("该房间没有防火墙");
      if (room.firewallBroken) return err("防火墙已破解");
      if (room.firewallRevealed >= room.firewallCode.length) return err("防火墙已全部揭示，用 solve <码> 提交");
      room.firewallRevealed = Math.min(room.firewallCode.length, room.firewallRevealed + 3);
      startTrace(reg, game, side);
      const revealed = room.firewallCode.slice(0, room.firewallRevealed);
      await reg.saveHacknetGames();
      return ok("ANALYZE PASS " + Math.ceil(room.firewallRevealed / 3) + ": " + revealed +
        (room.firewallRevealed >= room.firewallCode.length ? "  → 输入 solve <完整码> 提交" : ""));
    }
    case "solve": {
      if (!room.firewall || room.firewallBroken) return err("无防火墙可提交");
      const code = String(params.code || "").trim().toLowerCase();
      if (safeEqual(code, room.firewallCode)) {
        room.firewallBroken = true;
        await reg.saveHacknetGames();
        return ok("防火墙破解成功：ACCESS GRANTED");
      }
      return err("ACCESS DENIED：码不匹配");
    }
    case "porthack": {
      if (room.crackedBy) return err("该房间已被打通");
      if (!canPorthack(room)) {
        return err("未满足打通条件：需全部端口破解" + (room.proxy ? " + 代理破解" : "") + (room.firewall ? " + 防火墙破解" : ""));
      }
      room.porthack = { startedAt: Date.now(), duration: PORTHACK_DURATION, by: side };
      startTrace(reg, game, side);
      await reg.saveHacknetGames();
      return ok("PortHack 正在建立连接…（" + Math.round(PORTHACK_DURATION / 1000) + "s）", {
        progress: { kind: "porthack", startedAt: room.porthack.startedAt, duration: PORTHACK_DURATION },
      });
    }
    case "hearttag": {
      if (room.crackedBy !== side) return err("该房间尚未打通，无法修改 Heart 的 Tag");
      const tag = String(params.tag || "").slice(0, 20);
      if (!TAG_WHITELIST.test(tag)) return err("Tag 含非法字符（限字母数字_-中文，≤20）");
      const h = room.hearts.find(x => x.taggedBy !== side);
      if (!h) return err("该房间所有 Heart 均已被标记");
      h.tag = tag;
      h.taggedBy = side;
      await reg.saveHacknetGames();
      await checkWin(reg, game, side);
      const won = game.state === "ended" && game.winner === side;
      return ok("Heart 的 Tag 已改为 '" + tag + "'（#" + room.name + "）" + (won ? " — 你征服了对方全部基地，获胜！" : ""));
    }
    default:
      return err("未知命令");
  }
}

// ---------- 入口 ----------
const WRITE_SUBS = new Set(["new", "accept", "connect", "disconnect", "action", "quit", "ticket"]);

export async function handleHacknet(reg, request, url) {
  const path = url.pathname;
  const sub = path.slice(4); // "/hn/xxx" → "xxx"
  const params = {};
  for (const [k, v] of url.searchParams) params[k] = v;
  let result;
  try {
    switch (sub) {
      case "new": result = await handleNew(reg, params); break;
      case "accept": result = await handleAccept(reg, params); break;
      case "status": result = await handleStatus(reg, params); break;
      case "connect": result = await handleConnect(reg, params); break;
      case "disconnect": result = await handleDisconnect(reg, params); break;
      case "action": result = await handleAction(reg, params); break;
      case "quit": result = await handleQuit(reg, params); break;
      case "ticket": result = await handleTicket(reg, params); break;
      default: return new Response("未找到", { status: 404 });
    }
  } catch (e) {
    console.error("hacknet handler error:", e && e.stack || e);
    return json({ ok: false, error: "服务器内部错误" }, 500);
  }
  // 写操作成功 → 签发/续期 sid 附进响应（前端轮询 /status 用，省 token 校验）
  if (WRITE_SUBS.has(sub) && result && result.status >= 200 && result.status < 300 && params.name) {
    try {
      const body = JSON.parse(await result.clone().text());
      body.sid = ensureSession(reg, params.name);
      result = json(body, result.status);
    } catch (e) {}
  }
  return result;
}
