// 房间消息查看 + 公告设置
import { state } from './state.js';
import { escapeHtml } from './utils.js';

export async function toggleRoomMessages(btn, room) {
  let detail = btn.closest(".room-detail");
  let existing = detail.querySelector(".msg-viewer");
  if (existing) {
    existing.remove();
    btn.textContent = "查看消息";
    return;
  }

  btn.textContent = "加载中...";
  let viewer = document.createElement("div");
  viewer.className = "msg-viewer";
  viewer.innerHTML = '<h4>📝 最近消息</h4><div class="msg-loading">加载中...</div>';
  detail.appendChild(viewer);

  try {
    let r = await fetch("/api/admin/room-messages/" + encodeURIComponent(room) + "?key=" + encodeURIComponent(state.adminKey) + "&limit=30");
    let msgs = await r.json();
    if (!Array.isArray(msgs) || msgs.length === 0) {
      viewer.innerHTML = '<h4>📝 最近消息</h4><div style="color:#888;font-size:85%;padding:8px">暂无消息记录</div>';
      btn.textContent = "查看消息";
      return;
    }
    let html = '<h4>📝 最近消息 (' + msgs.length + ' 条)</h4>';
    msgs.forEach(msg => {
      let ts = msg.timestamp ? new Date(msg.timestamp) : null;
      let timeStr = ts ? ("0" + ts.getHours()).slice(-2) + ":" + ("0" + ts.getMinutes()).slice(-2) : "";
      let msgContent = '';
      if (msg.type === "image") {
        msgContent = '<span class="msg-img-placeholder">📷 [图片]</span>';
      } else if (msg.type === "file") {
        msgContent = '<span class="msg-img-placeholder">📎 ' + escapeHtml(msg.fileName || "[文件]") + '</span>';
      } else {
        msgContent = escapeHtml(msg.message || "");
      }
      html += '<div class="msg-item">' +
        '<span class="msg-time">' + timeStr + '</span>' +
        '<span class="msg-name">' + escapeHtml(msg.name || "?") + '</span>' +
        '<span class="msg-text">' + msgContent + '</span>' +
      '</div>';
    });
    viewer.innerHTML = html;
    btn.textContent = "收起消息";
  } catch (e) {
    viewer.innerHTML = '<h4>📝 最近消息</h4><div style="color:#c00;font-size:85%;padding:8px">加载失败</div>';
    btn.textContent = "查看消息";
  }
}

export async function setAnnouncement(room) {
  let inputId = 'ann-input-' + room.replace(/[^a-zA-Z0-9_-]/g, '_');
  let text = document.getElementById(inputId).value.trim();
  try {
    let r = await fetch("/api/admin/announcement/" + encodeURIComponent(room) + "?key=" + encodeURIComponent(state.adminKey) + "&text=" + encodeURIComponent(text));
    let result = await r.text();
    alert(result);
  } catch (e) {
    alert("设置公告失败: " + e.message);
  }
}

// 📌 置顶消息（v1.35）：加载房间各频道置顶列表（普通 admin 可查看）
export async function loadPinnedSection(room) {
  let container = document.getElementById("pinned-section-" + room.replace(/[^a-zA-Z0-9_-]/g, "_"));
  if (!container) return;
  try {
    let r = await fetch("/api/admin/pin/get/" + encodeURIComponent(room) + "?key=" + encodeURIComponent(state.adminKey));
    let data = await r.json();
    let pinned = (data && data.pinned && typeof data.pinned === "object") ? data.pinned : {};
    let entries = Object.entries(pinned).flatMap(([channel, arr]) => (Array.isArray(arr) ? arr : []).map(p => ({channel, ...p})));
    if (entries.length === 0) {
      container.innerHTML = '<div style="color:#888;font-size:85%;padding:4px 0;">暂无置顶消息</div>';
      return;
    }
    let html = "";
    entries.forEach(p => {
      let ts = p.timestamp ? new Date(p.timestamp) : null;
      let timeStr = ts ? ("0" + ts.getHours()).slice(-2) + ":" + ("0" + ts.getMinutes()).slice(-2) + " " + ("0" + ts.getDate()).slice(-2) + "/" + ("0" + (ts.getMonth() + 1)).slice(-2) : "";
      let ch = p.channel || "general";
      html += '<div class="pinned-row" style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;border-bottom:1px dashed #eee;">' +
        '<span style="color:#e67e22;flex-shrink:0;">#' + escapeHtml(ch) + '</span>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(p.text || "") + '">📌 ' + escapeHtml((p.name || "?") + ": " + (p.text || "")) + '</span>' +
        '<span style="color:#999;flex-shrink:0;">' + timeStr + '</span>' +
        '<button onclick="clearPinned(\'' + room.replace(/'/g, "\\'") + '\',\'' + ch.replace(/'/g, "\\'") + '\',' + parseInt(p.timestamp) + ')" style="padding:1px 8px;background:#e74c3c;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:11px;">清除</button>' +
      '</div>';
    });
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<div style="color:#c00;font-size:85%;padding:4px 0;">加载置顶失败</div>';
  }
}

// 📌 置顶消息（v1.35）：按频道+消息时间戳设置置顶
export async function setPinned(room) {
  let safe = room.replace(/[^a-zA-Z0-9_-]/g, "_");
  let channel = (document.getElementById("pin-chan-" + safe).value.trim()) || "general";
  let ts = document.getElementById("pin-ts-" + safe).value.trim();
  if (!ts || !/^\d+$/.test(ts)) { alert("请输入有效消息时间戳（毫秒）"); return; }
  try {
    let r = await fetch("/api/admin/pin/set/" + encodeURIComponent(room) + "?key=" + encodeURIComponent(state.adminKey) + "&channel=" + encodeURIComponent(channel) + "&timestamp=" + encodeURIComponent(ts));
    let result = await r.text();
    alert(result);
    loadPinnedSection(room);
  } catch (e) { alert("置顶失败: " + e.message); }
}

// 📌 置顶消息（v1.35）：按频道+时间戳清除置顶
export async function clearPinned(room, channel, ts) {
  if (!confirm("确定取消这条置顶吗？")) return;
  try {
    let r = await fetch("/api/admin/pin/clear/" + encodeURIComponent(room) + "?key=" + encodeURIComponent(state.adminKey) + "&channel=" + encodeURIComponent(channel) + "&timestamp=" + encodeURIComponent(ts));
    let result = await r.text();
    alert(result);
    loadPinnedSection(room);
  } catch (e) { alert("取消置顶失败: " + e.message); }
}
