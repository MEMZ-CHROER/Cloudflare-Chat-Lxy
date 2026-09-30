// v2 DM (direct message) override — private messaging between users
import { state, patch } from "../store.js";
import { escapeHtml, formatTime } from "../renderers.override.js";

const DM_CACHE = new Map();

export function openDM(user) {
  if (user === state.user?.name) {
    alert("不能给自己发私信");
    return;
  }
  state.dmTarget = user;
  state.dmUnread = 0;
  renderDMPanels();
}

export function closeDM() {
  state.dmTarget = null;
  renderDMPanels();
}

export function updateDmBadge() {
  // v2: show DM count in header (no v2-dm-badge in new HTML, skip)
}

function renderDMPanels() {
  // Remove existing DM panel (v1-style #dm-panel or v2-style)
  const existing = document.getElementById("dm-panel") || document.getElementById("v2-dm-panel");
  if (existing) existing.style.display = "none";

  if (!state.dmTarget) return;

  // Use v1-compatible #dm-panel DOM
  const panel = document.getElementById("dm-panel");
  if (!panel) return;
  panel.style.display = "flex";
  document.getElementById("dm-username").textContent = "💬 私信: " + state.dmTarget;
  document.getElementById("dm-log").innerHTML = "";

  // Load DM history
  renderDMLog(state.dmTarget);

  // Bind send
  document.getElementById("dm-send").addEventListener("click", sendDM);
  document.getElementById("dm-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDM(); }
  });
}

function renderDMLog(user) {
  const log = document.getElementById("dm-log");
  if (!log) return;

  const msgs = DM_CACHE.get(user) || [];
  if (msgs.length === 0) {
    log.innerHTML = '<div class="v2-dm-system">还没有消息，开始聊天吧</div>';
    return;
  }

  log.innerHTML = "";
  msgs.forEach(m => {
    const div = document.createElement("div");
    div.className = "v2-dm-msg " + (m.name === state.user?.name ? "self" : "other");
    div.innerHTML = `<div class="v2-dm-name">${escapeHtml(m.name || "Anonymous")}</div><div class="v2-dm-text">${escapeHtml(m.message || "")}</div><div class="v2-dm-time">${formatTime(m.timestamp)}</div>`;
    log.appendChild(div);
  });
  log.scrollTop = log.scrollHeight;
}

export function sendDM() {
  const input = document.getElementById("dm-input");
  if (!input || !state.ws) return;
  const text = input.value.trim();
  if (!text) return;

  state.ws.send(JSON.stringify({ type: "dm", target: state.dmTarget, message: text }));
  input.value = "";

  // Optimistic render
  const msgs = DM_CACHE.get(state.dmTarget) || [];
  msgs.push({ name: state.user?.name, message: text, timestamp: Date.now() });
  DM_CACHE.set(state.dmTarget, msgs);
  renderDMLog(state.dmTarget);
}

export function receiveDM(msg) {
  const { from, message, timestamp } = msg;
  if (!from) return;

  // Add to cache
  const msgs = DM_CACHE.get(from) || [];
  msgs.push({ name: from, message, timestamp: timestamp || Date.now() });
  DM_CACHE.set(from, msgs);

  // Update badge if not viewing this DM
  if (state.dmTarget !== from) {
    state.dmUnread = (state.dmUnread || 0) + 1;
    updateDmBadge();
  }

  // Render if currently viewing
  if (state.dmTarget === from) {
    renderDMLog(from);
  }
}

// Expose for inline handlers
window.__v2_openDM = openDM;
window.__v2_closeDM = closeDM;
