/**
 * v2 Chat module — message rendering and handling
 */
import { state, set, subscribe, patch } from "./store.js";
import { sendMessage } from "./ws.js";
import { renderChatMessage, renderMessageBatch } from "./renderers.override.js";

let msgSubscription = null;
let connSubscription = null;

export function scrollToBottom() {
  const msgList = document.getElementById("v2-messages");
  if (msgList) msgList.scrollTop = msgList.scrollHeight;
}

export function handleSend() {
  const input = document.getElementById("v2-msg-input");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const sent = sendMessage(text);
  if (sent) input.value = "";
}

export function initMessageListener() {
  if (msgSubscription) msgSubscription();
  msgSubscription = subscribe("messages", (msgs) => {
    const msgList = document.getElementById("v2-messages");
    if (!msgList || !msgs) return;
    const lastMsg = msgs[msgs.length - 1];
    if (!lastMsg) return;
    // Skip if already rendered
    if (lastMsg.id && lastMsg.id === msgList.dataset.lastId) return;
    const isSelf = state.user?.name && lastMsg.name === state.user.name;
    const div = renderChatMessage(lastMsg, isSelf);
    if (div) {
      msgList.appendChild(div);
      if (lastMsg.id) msgList.dataset.lastId = String(lastMsg.id);
      msgList.scrollTop = msgList.scrollHeight;
    }
  });
}

export function initConnListener() {
  if (connSubscription) connSubscription();
  connSubscription = subscribe("connected", (connected) => {
    const statusEl = document.getElementById("v2-status");
    if (statusEl) {
      statusEl.textContent = connected ? "connected" : "disconnected";
      statusEl.style.color = connected ? "#4ade80" : "#f87171";
    }
  });
}

export function initOnlineUsersListener() {
  subscribe("onlineUsers", (users) => {
    const roster = document.getElementById("v2-roster-list");
    if (!roster || !users) return;
    roster.innerHTML = users.map(u => {
      const isSelf = state.user?.name === u;
      return `<div class="v2-roster-item${isSelf ? " self" : ""}" data-name="${escapeHtml(u)}">${escapeHtml(u)}${isSelf ? " (你)" : ""}</div>`;
    }).join("");
    const countEl = document.getElementById("v2-roster-count");
    if (countEl) countEl.textContent = users.length;
  });
}

export function loadMessages(container, messages) {
  if (!container || !messages) return;
  renderMessageBatch(container, messages, (name) => name === state.user?.name);
}

export function addSystemMessage(text) {
  const msgList = document.getElementById("v2-messages");
  if (!msgList) return;
  const p = document.createElement("p");
  p.className = "v2-system-msg";
  p.textContent = text;
  msgList.appendChild(p);
  msgList.scrollTop = msgList.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
