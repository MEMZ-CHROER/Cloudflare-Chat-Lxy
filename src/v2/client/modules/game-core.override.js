// v2 game core — shared game state, API, and utilities
import { state } from "../store.js";

// ========== 音效 ==========
let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === "suspended") _audioCtx.resume();
  return _audioCtx;
}

function playTone(freq, duration, type, volume) {
  try {
    let ctx = getAudioCtx();
    let osc = ctx.createOscillator();
    let gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.1, ctx.currentTime);
    gain.gain.exponentialRampToTimeConstant(ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

export function playGameSound(type) {
  switch (type) {
    case "win":
      playTone(523, 0.15, "sine", 0.1);
      setTimeout(function() { playTone(659, 0.15, "sine", 0.1); }, 120);
      setTimeout(function() { playTone(784, 0.25, "sine", 0.1); }, 240);
      break;
    case "lose":
      playTone(400, 0.2, "sawtooth", 0.05);
      setTimeout(function() { playTone(300, 0.3, "sawtooth", 0.05); }, 200);
      break;
    case "click":
      playTone(880, 0.05, "sine", 0.05);
      break;
    case "spin":
      for (let i = 0; i < 8; i++) {
        setTimeout(function() { playTone(200 + i * 40, 0.04, "sine", 0.03); }, i * 30);
      }
      break;
    case "reveal":
      playTone(660, 0.08, "sine", 0.06);
      setTimeout(function() { playTone(880, 0.08, "sine", 0.06); }, 60);
      break;
    case "bounce":
      playTone(300, 0.06, "square", 0.03);
      break;
    case "levelup":
      for (let i = 0; i < 5; i++) {
        setTimeout(function() { playTone(400 + i * 100, 0.1, "sine", 0.06); }, i * 80);
      }
      break;
  }
}

// ========== 加载状态指示 ==========
let _loadingEl = null;

export function showGameLoading(text) {
  hideGameLoading();
  _loadingEl = document.createElement("div");
  _loadingEl.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1000;padding:16px 24px;background:rgba(0,0,0,0.7);color:#fff;border-radius:12px;font-size:14px;font-weight:600;pointer-events:none;";
  _loadingEl.textContent = text || "⏳ 加载中...";
  document.body.appendChild(_loadingEl);
}

export function hideGameLoading() {
  if (_loadingEl) { _loadingEl.remove(); _loadingEl = null; }
}

// ========== 积分操作 ==========
let _betInFlight = false;

export async function gameApi(action, data) {
  if (action === "win") playGameSound("win");
  if (action === "bet") {
    if (_betInFlight) return { error: "下注处理中，请勿重复点击" };
    _betInFlight = true;
  }
  try {
    let name = state.user?.name || localStorage.getItem("chat_user") || "";
    let token = localStorage.getItem("chat_token") || "";
    let r = await fetch("/api/game/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, token: token, ...data, action: action })
    });
    return await r.json();
  } catch (e) {
    return { error: e.message };
  } finally {
    if (action === "bet") _betInFlight = false;
  }
}

export function updateBalance() {
  // Balance is managed server-side, just refresh display if needed
}

// ========== 游戏注册系统 ==========
const _registeredGames = new Map();

export function registerGame(id, icon, name, desc, renderFn, resetFn) {
  _registeredGames.set(id, { icon: icon, name: name, desc: desc, render: renderFn, reset: resetFn });
}

export function getGame(id) {
  return _registeredGames.get(id);
}

export function getAllGames() {
  return Array.from(_registeredGames.values());
}

window.__v2_gameApi = gameApi;
window.__v2_playGameSound = playGameSound;
window.__v2_showGameLoading = showGameLoading;
window.__v2_hideGameLoading = hideGameLoading;
window.__v2_registerGame = registerGame;
