// 🎮 小游戏核心 — 共享状态、API、面板管理、注册系统、音效
import { state } from './state.js';

// ========== 音效 ==========

let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function playTone(freq, duration, type, volume) {
  try {
    let ctx = getAudioCtx();
    let osc = ctx.createOscillator();
    let gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

export function playGameSound(type) {
  switch (type) {
    case 'win':
      playTone(523, 0.15, 'sine', 0.1);
      setTimeout(() => playTone(659, 0.15, 'sine', 0.1), 120);
      setTimeout(() => playTone(784, 0.25, 'sine', 0.1), 240);
      break;
    case 'lose':
      playTone(400, 0.2, 'sawtooth', 0.05);
      setTimeout(() => playTone(300, 0.3, 'sawtooth', 0.05), 200);
      break;
    case 'click':
      playTone(880, 0.05, 'sine', 0.05);
      break;
    case 'spin':
      for (let i = 0; i < 8; i++) setTimeout(() => playTone(200 + i * 40, 0.04, 'sine', 0.03), i * 30);
      break;
    case 'reveal':
      playTone(660, 0.08, 'sine', 0.06);
      setTimeout(() => playTone(880, 0.08, 'sine', 0.06), 60);
      break;
    case 'bounce':
      playTone(300, 0.06, 'square', 0.03);
      break;
    case 'levelup':
      for (let i = 0; i < 5; i++) setTimeout(() => playTone(400 + i * 100, 0.1, 'sine', 0.06), i * 80);
      break;
  }
}

// ========== 加载状态指示 ==========

let _loadingEl = null;

export function showGameLoading(text) {
  hideGameLoading();
  _loadingEl = document.createElement('div');
  _loadingEl.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1000;padding:16px 24px;background:rgba(0,0,0,0.7);color:#fff;border-radius:12px;font-size:14px;font-weight:600;pointer-events:none;animation:fadeIn .2s;';
  _loadingEl.textContent = text || t('⏳ 加载中...');
  document.body.appendChild(_loadingEl);
}

export function hideGameLoading() {
  if (_loadingEl) { _loadingEl.remove(); _loadingEl = null; }
}

// ========== 积分操作 ==========

export async function gameApi(action, data) {
  // 自动触发音效
  if (action === 'win') playGameSound('win');
  try {
    let name = state.username || localStorage.getItem("chat_user") || "";
    let token = localStorage.getItem("chat_token") || "";
    let r = await fetch("/api/game/play", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({name, token, ...data, action})
    });
    return await r.json();
  } catch (e) {
    return {error: e.message};
  }
}

async function getBalance() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) return "0";
  try {
    let r = await fetch("/api/points/get?name=" + encodeURIComponent(name));
    if (!r.ok) return "0";
    let d = await r.json();
    return d.points || "0";
  } catch { return "0"; }
}

function fmtPts(v) {
  let s = String(v);
  if (s.length > 9) return s.slice(0, s.length - 8) + t("亿+");
  return Number(s).toLocaleString();
}

// ========== 游戏状态 ==========

export let gs = {
  currentGame: null,
  balance: 0,
};

// ========== 注册系统 ==========

export const gameRegistry = {};
let gameOrder = [];

export function registerGame(name, icon, label, desc, renderFn, resetFn) {
  gameRegistry[name] = { icon, label, desc, render: renderFn, reset: resetFn };
  gameOrder.push(name);
}

// ========== 面板管理 ==========

function ensureGameCSS() {
  if (document.getElementById("game-style-link")) return;
  let link = document.createElement("link");
  link.id = "game-style-link";
  link.rel = "stylesheet";
  link.href = "/static/chat/game-style.css";
  document.head.appendChild(link);
}

export async function openGames() {
  showGameLoading(t('🎮 加载游戏中心...'));
  gs.balance = await getBalance();
  gs.currentGame = "menu";
  ensureGameCSS();
  renderGamePanel();
  hideGameLoading();
  let overlay = document.getElementById("game-overlay");
  if (overlay) {
    overlay.classList.add("show");
    overlay.addEventListener("click", function h(e) {
      if (e.target === overlay) { closeGames(); overlay.removeEventListener("click", h); }
    });
  }
}

export function closeGames() {
  let overlay = document.getElementById("game-overlay");
  if (overlay) overlay.classList.remove("show");
  gs.currentGame = null;
}

export function switchGame(game) {
  if (gs.currentGame && gameRegistry[gs.currentGame]) {
    // 不中断动画，但不做特殊处理
  }
  if (game === "menu") { gs.currentGame = "menu"; renderGamePanel(); return; }
  gs.currentGame = game;
  let entry = gameRegistry[game];
  if (entry && entry.reset) {
    Object.assign(gs, { [game]: entry.reset() });
  }
  updateBalance();
  renderGameContent();
}

// ========== 渲染 ==========

function renderGamePanel() {
  let el = document.getElementById("game-content");
  if (!el) return;
  updateBalance();
  if (gs.currentGame === "menu") { renderGameMenu(el); return; }
  renderGameContent(el);
}

function renderGameMenu(el) {
  let html = '<div class="game-menu">';
  gameOrder.forEach(name => {
    let g = gameRegistry[name];
    if (!g) return;
    html += '<div class="game-menu-item" onclick="switchGame(\'' + name + '\')">'
      + '<span class="game-menu-icon">' + g.icon + '</span>'
      + '<div class="game-menu-info">'
      + '<div class="game-menu-name">' + g.label + '</div>'
      + '<div class="game-menu-desc">' + g.desc + '</div></div>'
      + '<span class="game-menu-arrow">▶</span></div>';
  });
  html += '</div>';
  el.innerHTML = html;
  window.switchGame = switchGame;
}

function renderGameContent(el) {
  if (!el) el = document.getElementById("game-content");
  if (!el) return;
  updateBalance();
  let entry = gameRegistry[gs.currentGame];
  if (entry && entry.render) entry.render(el);
}

export function updateBalance() {
  let el = document.getElementById("game-points-display");
  if (el) el.textContent = "💰 " + fmtPts(gs.balance) + t(" 积分");
}
