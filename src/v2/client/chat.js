/**
 * v2 Chat module — message rendering and handling
 */
import { state, set, subscribe, patch } from "./store.js";
import { sendMessage } from "./ws.js";
import { renderChatMessage, renderMessageBatch } from "./renderers.override.js";

let msgSubscription = null;
let connSubscription = null;

export function scrollToBottom() {
  const msgList = document.getElementById("chatlog");
  if (msgList) msgList.scrollTop = msgList.scrollHeight;
}

export function handleSend() {
  const input = document.getElementById("chat-input");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const color = localStorage.getItem("chat_color") || "";
  const sent = sendMessage(text, color ? { color } : undefined);
  if (sent) input.value = "";
}

export function initMessageListener() {
  if (msgSubscription) msgSubscription();
  msgSubscription = subscribe("messages", (msgs) => {
    const msgList = document.getElementById("chatlog");
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
    const statusEl = document.getElementById("v2-room-status");
    if (statusEl) {
      statusEl.textContent = connected ? "已连接" : "已断开";
      statusEl.style.color = connected ? "#4ade80" : "#f87171";
    }
  });
}

export function initOnlineUsersListener() {
  subscribe("onlineUsers", (users) => {
    const roster = document.getElementById("roster");
    if (!roster || !users) return;
    // Keep header, clear rest
    const header = roster.querySelector("#roster-header");
    roster.innerHTML = "";
    if (header) roster.appendChild(header);
    users.forEach(u => {
      const isSelf = state.user?.name === u;
      const p = document.createElement("p");
      p.className = isSelf ? "self" : "";
      p.textContent = u + (isSelf ? " (你)" : "");
      p.addEventListener("click", () => {
        window.__v2_openDM?.(u);
      });
      roster.appendChild(p);
    });
    const countEl = document.getElementById("roster-count");
    if (countEl) countEl.textContent = users.length;
  });
}

export function loadMessages(container, messages) {
  if (!container || !messages) return;
  renderMessageBatch(container, messages, (name) => name === state.user?.name);
}

export function addSystemMessage(text) {
  const msgList = document.getElementById("chatlog");
  if (!msgList) return;
  const p = document.createElement("p");
  p.className = "system-msg";
  p.textContent = text;
  msgList.appendChild(p);
  msgList.scrollTop = msgList.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
