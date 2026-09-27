// v2 room info override — room details panel
import { state } from "../store.js";
import { escapeHtml } from "../renderers.override.js";

export function openRoomInfo() {
  let panel = document.getElementById("v2-room-info-panel");
  if (panel) { panel.remove(); return; }

  panel = document.createElement("div");
  panel.id = "v2-room-info-panel";
  panel.className = "v2-room-info-overlay";

  const onlineCount = state.onlineUsers?.length || 0;
  const msgCount = state.messages?.length || 0;
  const channelCount = state.channels?.length || 1;

  panel.innerHTML = `
    <div class="v2-room-info-card">
      <div class="v2-room-info-header">
        <h2>📋 房间信息</h2>
        <button class="v2-room-info-close" onclick="this.closest('#v2-room-info-panel').remove()">&times;</button>
      </div>
      <div class="v2-room-info-body">
        <div class="v2-info-row"><span class="label">房间</span><span class="value">#${escapeHtml(state.currentRoom)}</span></div>
        <div class="v2-info-row"><span class="label">在线用户</span><span class="value">${onlineCount}</span></div>
        <div class="v2-info-row"><span class="label">消息数</span><span class="value">${msgCount}</span></div>
        <div class="v2-info-row"><span class="label">频道数</span><span class="value">${channelCount}</span></div>
        <div class="v2-info-row"><span class="label">用户名</span><span class="value">${escapeHtml(state.user?.name || "Guest")}</span></div>
        <div class="v2-info-row"><span class="label">WebSocket</span><span class="value">${state.connected ? "✅ 已连接" : "❌ 未连接"}</span></div>
        <div class="v2-info-row"><span class="label">当前频道</span><span class="value">#${escapeHtml(state.currentChannel || "general")}</span></div>
      </div>
      <div class="v2-room-info-footer">
        <button onclick="window.__v2_copyRoomLink()">复制房间链接</button>
        <button class="v2-room-info-leave" onclick="window.__v2_leaveRoom()">离开房间</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.addEventListener("click", e => { if (e.target === panel) panel.remove(); });
}

function copyRoomLink() {
  const url = `${location.origin}/?room=${encodeURIComponent(state.currentRoom)}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast("链接已复制", "success");
  }).catch(() => {
    prompt("复制此链接:", url);
  });
}

function leaveRoom() {
  window.__v2_disconnect?.();
  window.__v2_navBack?.();
}

window.__v2_openRoomInfo = openRoomInfo;
window.__v2_copyRoomLink = copyRoomLink;
window.__v2_leaveRoom = leaveRoom;
