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
  // v2: show DM count in header
  const badge = document.getElementById("v2-dm-badge");
  if (badge) {
    if (state.dmUnread > 0) {
      badge.textContent = state.dmUnread;
      badge.style.display = "inline-flex";
    } else {
      badge.style.display = "none";
    }
  }
}

function renderDMPanels() {
  const chatBody = document.getElementById("v2-chat-body");
  if (!chatBody) return;

  // Remove existing DM panel
  const existing = chatBody.querySelector("#v2-dm-panel");
  if (existing) existing.remove();

  if (!state.dmTarget) return;

  const panel = document.createElement("div");
  panel.id = "v2-dm-panel";
  panel.className = "v2-dm-panel";
  panel.innerHTML = `
    <div class="v2-dm-header">
      <span>💬 私信: <strong>${escapeHtml(state.dmTarget)}</strong></span>
      <button class="v2-dm-close" onclick="window.__v2_closeDM()">&times;</button>
    </div>
    <div id="v2-dm-messages" class="v2-dm-messages"></div>
    <div class="v2-dm-input-area">
      <textarea id="v2-dm-input" placeholder="输入私信..." maxlength="2000" rows="2"></textarea>
      <button id="v2-dm-send">发送</button>
    </div>
  `;
  chatBody.appendChild(panel);

  // Load DM history
  renderDMLog(state.dmTarget);

  // Bind send
  document.getElementById("v2-dm-send").addEventListener("click", sendDM);
  document.getElementById("v2-dm-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDM(); }
  });
}

function renderDMLog(user) {
  const log = document.getElementById("v2-dm-messages");
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
  const input = document.getElementById("v2-dm-input");
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
