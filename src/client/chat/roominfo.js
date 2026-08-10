// 房间信息面板
import { state, t } from './state.js';
import { escapeHtml } from './renderers.js';

// v1.53 双轨：默认走 Vue3 弹窗管理器（居中 modal）；localStorage.chatLegacyModals=1 时回退旧 overlay（保底可回退）
export function toggleRoomInfo() {
  if (localStorage.getItem("chatLegacyModals") === "1") {
    toggleRoomInfoLegacy();
    return;
  }
  import('./modal-manager.js').then(m => {
    if (m.stack.some(x => x.name === 'roominfo')) m.closeModal('roominfo');
    else m.openModal('roominfo');
  }).catch(() => toggleRoomInfoLegacy());
}

function toggleRoomInfoLegacy() {
  let existing = document.getElementById("room-info-modal");
  if (existing) { existing.remove(); return; }

  let modal = document.createElement("div");
  modal.id = "room-info-modal";
  modal.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);";

  let panel = document.createElement("div");
  panel.style.cssText = "background:var(--surface);border-radius:12px;padding:24px;min-width:280px;max-width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.2);color:var(--text);font-size:14px;";
  panel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
      '<strong style="font-size:16px;">📋 房间信息</strong>' +
      '<span id="room-info-close" style="cursor:pointer;font-size:22px;line-height:1;color:var(--text-secondary);">&times;</span>' +
    '</div>' +
    '<div id="room-info-content"></div>';

  modal.appendChild(panel);
  document.body.appendChild(modal);

  document.getElementById("room-info-close").onclick = () => modal.remove();
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });

  let content = document.getElementById("room-info-content");
  let onlineCount = state.roster ? state.roster.querySelectorAll("[data-name]").length : 0;
  content.innerHTML =
    '<div style="margin-bottom:8px;"><span style="color:var(--text-secondary);">房间:</span> <strong>#' + escapeHtml(state.roomname) + '</strong></div>' +
    '<div style="margin-bottom:8px;"><span style="color:var(--text-secondary);">在线用户:</span> <strong>' + onlineCount + '</strong></div>' +
    '<div style="margin-bottom:8px;"><span style="color:var(--text-secondary);">用户名:</span> <strong>' + escapeHtml(state.username) + '</strong></div>' +
    '<div style="margin-bottom:8px;"><span style="color:var(--text-secondary);">WebSocket:</span> <strong>' + (state.currentWebSocket ? "✅ 已连接" : t("❌ 未连接")) + '</strong></div>' +
    '<div style="margin-bottom:8px;"><span style="color:var(--text-secondary);">消息时间戳:</span> <strong>' + (state.lastSeenTimestamp ? new Date(state.lastSeenTimestamp).toLocaleTimeString() : "-") + '</strong></div>';
}
