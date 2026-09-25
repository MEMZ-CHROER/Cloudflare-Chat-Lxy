/**
 * v2 Chat module — message rendering and handling
 */
import { state, set, subscribe, patch } from "./store.js";
import { sendMessage } from "./ws.js";

export function renderMessage(msg) {
  const div = document.createElement("div");
  div.className = "v2-msg";
  div.dataset.id = msg.id || Date.now();

  const header = document.createElement("div");
  header.className = "v2-msg-header";
  header.innerHTML = `<span class="v2-msg-name">${escapeHtml(msg.name || "Anonymous")}</span>
    <span class="v2-msg-time">${formatTime(msg.timestamp)}</span>`;

  const content = document.createElement("div");
  content.className = "v2-msg-content";
  content.innerHTML = renderMarkdown(msg.content);

  div.appendChild(header);
  div.appendChild(content);
  return div;
}

export function scrollToBottom() {
  const msgList = document.getElementById("v2-messages");
  if (msgList) {
    msgList.scrollTop = msgList.scrollHeight;
  }
}

export function handleSend() {
  const input = document.getElementById("v2-msg-input");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const sent = sendMessage(text);
  if (sent) {
    input.value = "";
  }
}

// Subscribe to new messages
let msgSubscription = null;
export function initMessageListener() {
  if (msgSubscription) msgSubscription();
  msgSubscription = subscribe("messages", (msgs) => {
    const msgList = document.getElementById("v2-messages");
    if (!msgList || !msgs) return;

    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg && lastMsg.id !== msgList.dataset.lastId) {
      const div = renderMessage(lastMsg);
      msgList.appendChild(div);
      msgList.dataset.lastId = lastMsg.id;
      scrollToBottom();
    }
  });
}

// Subscribe to connection status
let connSubscription = null;
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

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function renderMarkdown(text) {
  // Basic markdown rendering
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}
