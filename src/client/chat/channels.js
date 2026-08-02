// 频道体系 — 频道栏 UI + 切换 + 非当前频道消息缓存
import { state, t } from './state.js';
import { addChatMessage, resetMsgDate, refreshReplyCounts } from './renderers.js';
import { getAdminKey } from './ui.js';

const MAX_CACHE = 150;

// 渲染频道栏（#channel-bar 内生成 tab）
export function buildChannelBar() {
  const bar = document.getElementById("channel-bar");
  if (!bar) return;
  bar.innerHTML = "";
  (state.channels || []).forEach(ch => {
    const isAnnouncement = ch.type === "announcement";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "channel-item" + (isAnnouncement ? " announcement" : "") + (ch.name === state.currentChannel ? " active" : "");
    btn.dataset.channel = ch.name;
    btn.textContent = (isAnnouncement ? "📢 #" : "# ") + ch.name;
    const badge = document.createElement("span");
    badge.className = "channel-badge";
    badge.style.display = "none";
    badge.textContent = "0";
    btn.appendChild(badge);
    btn.addEventListener("click", () => switchChannel(ch.name));
    bar.appendChild(btn);
  });
  // 管理员显示新建频道入口
  if (document.cookie.indexOf("admin_logged=1") !== -1 && getAdminKey() !== "") {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "channel-item";
    add.textContent = "＋";
    add.title = "新建频道 (/channel add <名称>)";
    add.addEventListener("click", () => {
      const name = prompt("新频道名称（字母数字下划线，1-24位）：");
      if (name && state.currentWebSocket) {
        state.currentWebSocket.send(JSON.stringify({type: "channel", action: "add", name: name.trim()}));
      }
    });
    bar.appendChild(add);
  }
}

// 刷新未读徽章
export function updateChannelBadges() {
  document.querySelectorAll(".channel-item").forEach(btn => {
    const ch = btn.dataset.channel;
    const n = state.channelUnread[ch] || 0;
    const badge = btn.querySelector(".channel-badge");
    if (badge) {
      badge.textContent = n > 99 ? "99+" : String(n);
      badge.style.display = n > 0 ? "inline-block" : "none";
    }
  });
}

// 切换频道
export function switchChannel(name) {
  if (!state.channels.some(c => c.name === name)) return;
  state.currentChannel = name;
  state.channelUnread[name] = 0;
  updateChannelBadges();
  // 清空当前消息区，渲染缓存或等历史
  state.chatlog.innerHTML = '<div id="spacer"></div>';
  state.lastSeenTimestamp = 0;
  resetMsgDate(); // 日期分组重新计数
  if (state.channelCache[name] && state.channelCache[name].length) {
    state.channelCache[name].forEach(m => renderChannelMessage(m));
    refreshReplyCounts();
    state.chatlog.scrollBy(0, 1e8);
  } else {
    const ld = document.createElement("p");
    ld.className = "system-msg";
    ld.textContent = t("加载中...");
    state.chatlog.appendChild(ld);
  }
  if (state.currentWebSocket) {
    state.currentWebSocket.send(JSON.stringify({type: "switch-channel", channel: name}));
  }
}

// 渲染一条频道消息（文本/图片/文件/语音统一走 addChatMessage，媒体降级为文本标记）
export function renderChannelMessage(msg) {
  if (!msg) return;
  if (msg.type === "image") {
    addChatMessage(msg.name, "[图片]", msg.tag, msg.tagColor, msg.color, msg.timestamp, msg.reply, msg.tagBorder, msg.id, msg.atAll, msg.avatar);
  } else if (msg.type === "file") {
    addChatMessage(msg.name, "[文件] " + (msg.fileName || ""), msg.tag, msg.tagColor, msg.color, msg.timestamp, msg.reply, msg.tagBorder, msg.id, msg.atAll, msg.avatar);
  } else if (msg.type === "voice") {
    addChatMessage(msg.name, "[语音 " + (msg.duration || "") + "s]", msg.tag, msg.tagColor, msg.color, msg.timestamp, msg.reply, msg.tagBorder, msg.id, msg.atAll, msg.avatar);
  } else if (msg.type === "gh-card") {
    addChatMessage(msg.name, "[🐙 " + (msg.repo || "") + "]", msg.tag, msg.tagColor, msg.color, msg.timestamp, msg.reply, msg.tagBorder, msg.id, msg.atAll, msg.avatar);
  } else if (msg.type === "deleted") {
    addChatMessage(msg.name, "[消息已删除]", msg.tag, msg.tagColor, msg.color, msg.timestamp, null, msg.tagBorder, msg.id);
  } else {
    addChatMessage(msg.name, msg.message, msg.tag, msg.tagColor, msg.color, msg.timestamp, msg.reply, msg.tagBorder, msg.id, msg.atAll, msg.avatar);
  }
}

// 非当前频道消息入缓存
export function pushToChannelCache(ch, msg) {
  if (!state.channelCache[ch]) state.channelCache[ch] = [];
  state.channelCache[ch].push(msg);
  if (state.channelCache[ch].length > MAX_CACHE) state.channelCache[ch].shift();
}

// 未读计数
export function bumpChannelUnread(ch) {
  state.channelUnread[ch] = (state.channelUnread[ch] || 0) + 1;
  updateChannelBadges();
  if (document.hidden) {
    state.unreadCount = (state.unreadCount || 0) + 1;
    if (typeof window.updateTitleUnread === "function") window.updateTitleUnread();
  }
}

// 跨频道更新缓存消息（edit/recalled）
export function updateCachedMessage(ch, timestamp, updater) {
  const arr = state.channelCache[ch];
  if (!arr) return;
  arr.forEach(m => {
    if (m.timestamp === timestamp) updater(m);
  });
}
