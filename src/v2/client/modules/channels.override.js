// v2 channels override — channel tab UI with v2 styling
import { state, patch } from "../store.js";
import { escapeHtml } from "../renderers.override.js";

const CHANNEL_CACHE = new Map();
const MAX_CACHE = 150;

export function buildChannelBar(container) {
  if (!container) container = document.getElementById("v2-channel-bar");
  if (!container) return;

  container.innerHTML = "";
  (state.channels || []).forEach(ch => {
    const isAnn = ch.type === "announcement";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "v2-channel" + (isAnn ? " announcement" : "") + (ch.name === state.currentChannel ? " active" : "");
    btn.dataset.channel = ch.name;
    btn.textContent = (isAnn ? "📢 #" : "# ") + ch.name;

    const badge = document.createElement("span");
    badge.className = "v2-channel-badge";
    badge.style.display = "none";
    badge.textContent = "0";
    btn.appendChild(badge);

    btn.addEventListener("click", () => switchChannel(ch.name));
    container.appendChild(btn);
  });

  // Admin: add channel button
  if (document.cookie.indexOf("admin_logged=1") !== -1) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "v2-channel v2-channel-add";
    add.textContent = "+";
    add.title = "新建频道 (/channel add <名称>)";
    add.addEventListener("click", () => {
      const name = prompt("新频道名称（字母数字下划线，1-24位）：");
      if (name && state.ws) {
        state.ws.send(JSON.stringify({ type: "channel", action: "add", name: name.trim() }));
      }
    });
    container.appendChild(add);
  }
}

export function updateChannelBadges() {
  const bar = document.getElementById("v2-channel-bar");
  if (!bar) return;
  bar.querySelectorAll(".v2-channel").forEach(btn => {
    const ch = btn.dataset.channel;
    const n = state.channelUnread?.[ch] || 0;
    const badge = btn.querySelector(".v2-channel-badge");
    if (badge) {
      badge.textContent = n > 99 ? "99+" : String(n);
      badge.style.display = n > 0 ? "inline-block" : "none";
    }
  });
}

export function switchChannel(name) {
  if (!state.channels?.some(c => c.name === name)) return;
  if (name === state.currentChannel) return;

  // Cache current channel messages
  if (state.currentChannel && state.messages?.length > 0) {
    CHANNEL_CACHE.set(state.currentChannel, [...state.messages]);
  }

  patch({ currentChannel: name, channelUnread: { ...state.channelUnread, [name]: 0 } });
  buildChannelBar();
  loadChannelMessages(name);
}

export function loadChannelMessages(channel) {
  const msgList = document.getElementById("v2-messages");
  if (!msgList) return;

  // Check cache first
  const cached = CHANNEL_CACHE.get(channel);
  if (cached) {
    msgList.innerHTML = "";
    cached.forEach(msg => {
      const el = renderV2Message(msg);
      if (el) msgList.appendChild(el);
    });
    msgList.scrollTop = msgList.scrollHeight;
    return;
  }

  // Fetch from API
  const token = localStorage.getItem("chat_token") || "";
  fetch(`/api/room/${encodeURIComponent(state.currentRoom)}/messages?limit=${MAX_CACHE}&channel=${encodeURIComponent(channel)}`, {
    headers: { "Cookie": `token=${token}` }
  })
    .then(r => r.json())
    .then(msgs => {
      CHANNEL_CACHE.set(channel, msgs);
      msgList.innerHTML = "";
      msgs.forEach(msg => {
        const el = renderV2Message(msg);
        if (el) msgList.appendChild(el);
      });
      msgList.scrollTop = msgList.scrollHeight;
    })
    .catch(() => {
      msgList.innerHTML = '<p class="v2-system-msg">加载频道消息失败</p>';
    });
}

function renderV2Message(msg) {
  if (!msg.name) {
    const p = document.createElement("p");
    p.className = "v2-system-msg";
    p.textContent = msg.content || msg.message || "";
    return p;
  }
  const wrapper = document.createElement("div");
  wrapper.className = "v2-msg" + (msg.name === state.user?.name ? " self" : " other");
  if (msg.timestamp) wrapper.dataset.timestamp = String(msg.timestamp);

  // Header
  const header = document.createElement("div");
  header.className = "v2-msg-header";
  if (msg.tag) {
    const badge = document.createElement("span");
    badge.className = "v2-tag";
    badge.style.backgroundColor = msg.tagColor || "#64748b";
    badge.style.color = "#fff";
    badge.style.padding = "1px 5px";
    badge.style.borderRadius = "3px";
    badge.style.fontSize = "10px";
    badge.style.fontWeight = "600";
    badge.style.marginRight = "4px";
    badge.textContent = msg.tag;
    header.appendChild(badge);
  }
  const nameSpan = document.createElement("span");
  nameSpan.className = "v2-msg-name";
  nameSpan.textContent = msg.name;
  header.appendChild(nameSpan);
  wrapper.appendChild(header);

  // Content
  const bubble = document.createElement("div");
  bubble.className = "v2-msg-bubble";
  if (msg.type === "image") {
    const img = document.createElement("img");
    img.src = msg.message || msg.content;
    img.style.maxWidth = "100%";
    img.style.borderRadius = "8px";
    bubble.appendChild(img);
  } else if (msg.type === "gh-card") {
    bubble.innerHTML = `<div style="padding:8px;background:rgba(0,0,0,0.3);border-radius:6px;border-left:3px solid #3b82f6;font-size:13px;">📦 <strong>GitHub</strong><br>${escapeHtml(msg.message || msg.content || "")}</div>`;
  } else {
    bubble.innerHTML = formatMarkdown(msg.message || msg.content || "");
  }
  wrapper.appendChild(bubble);

  // Time
  if (msg.timestamp) {
    const timeSpan = document.createElement("span");
    timeSpan.className = "v2-msg-time";
    timeSpan.textContent = formatTime(msg.timestamp);
    wrapper.appendChild(timeSpan);
  }

  return wrapper;
}

function formatMarkdown(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}
