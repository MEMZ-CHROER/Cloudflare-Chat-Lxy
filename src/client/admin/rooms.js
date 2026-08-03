// 房间管理
import { state } from './state.js';
import { TAG_COLORS, escapeHtml } from './utils.js';
import { isSuper } from './auth.js';
import { banUser } from './users.js';
import { loadPinnedSection } from './messages.js';

export async function loadRooms() {
  let container = document.querySelector("#room-list-container");
  container.innerHTML = '<div id="loading">加载中...</div>';
  try {
    let r = await fetch("/api/rooms/list");
    let rooms = await r.json();
    container.innerHTML = "";
    let entries = Object.entries(rooms);
    if (entries.length === 0) { container.innerHTML = '<div id="loading">暂无房间</div>'; return; }
    entries.forEach(([name, count]) => {
      let card = document.createElement("div");
      card.className = "room-card";
      card.dataset.room = name;
      card.innerHTML = '<div class="room-header">' +
        '<span class="room-name">#' + escapeHtml(name) + '</span>' +
        '<span><span class="room-meta">&#128101; ' + count + ' 在线</span><span class="arrow">&#9654;</span></span>' +
        '</div><div class="room-detail"></div>';
      card.querySelector(".room-header").addEventListener("click", () => toggleRoom(card, name));
      container.appendChild(card);
    });
  } catch (e) { container.innerHTML = '<div id="loading">加载失败</div>'; }
}

async function toggleRoom(card, name) {
  let detail = card.querySelector(".room-detail");
  let arrow = card.querySelector(".arrow");
  if (detail.classList.contains("open")) {
    detail.classList.remove("open"); arrow.classList.remove("open");
    if (state.expandedRoom === name) state.expandedRoom = null;
    return;
  }
  document.querySelectorAll(".room-detail.open").forEach(d => d.classList.remove("open"));
  document.querySelectorAll(".arrow.open").forEach(a => a.classList.remove("open"));
  detail.classList.add("open"); arrow.classList.add("open");
  state.expandedRoom = name;
  detail.innerHTML = '<div id="loading">加载中...</div>';
  await loadRoomDetail(detail, name);
}

export async function loadRoomDetail(detail, name) {
  try {
    let [users, blacklist, userDetails, files] = await Promise.all([
      fetch("/api/admin/room-users/" + encodeURIComponent(name) + "?key=" + encodeURIComponent(state.adminKey)).then(r => r.json()),
      fetch("/api/admin/blacklist/list/" + encodeURIComponent(name) + "?key=" + encodeURIComponent(state.adminKey)).then(r => r.json()),
      fetch("/api/admin/room-users-detail/" + encodeURIComponent(name) + "?key=" + encodeURIComponent(state.adminKey)).then(r => r.json()),
      fetch("/api/admin/room-files/" + encodeURIComponent(name) + "?key=" + encodeURIComponent(state.adminKey)).then(r => r.json()).catch(() => [])
    ]);
    let ipMap = {};
    if (Array.isArray(userDetails)) userDetails.forEach(u => { if (u.name) ipMap[u.name] = u.ip || ""; });
    let html = '<div class="room-actions">';
    html += '<button class="btn-danger" onclick="clearRoom(\'' + name.replace(/'/g, "\\'") + '\')">清空聊天记录</button>';
    html += '<button class="btn-primary" onclick="toggleRoomMessages(this, \'' + name.replace(/'/g, "\\'") + '\')">查看消息</button>';
    if (isSuper()) html += '<button class="btn-danger" onclick="destroyRoom(\'' + name.replace(/'/g, "\\'") + '\')" style="background:#c0392b">💥 销毁房间</button>';
    html += '</div>';
    html += '<div class="announcement-section" style="margin:8px 0;padding:8px;background:#f9f9f9;border-radius:6px;">';
    html += '<div style="font-size:13px;font-weight:600;margin-bottom:4px;">📢 房间公告</div>';
    html += '<div style="display:flex;gap:6px;">';
    html += '<input type="text" id="ann-input-' + name.replace(/[^a-zA-Z0-9_-]/g, '_') + '" placeholder="输入公告内容（留空清除）" style="flex:1;padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;">';
    html += '<button onclick="setAnnouncement(\'' + name.replace(/'/g, "\\'") + '\')" style="padding:4px 12px;background:#4a90d9;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">设置</button>';
    html += '</div></div>';
    // 📌 置顶消息（v1.35）：房间置顶管理（列表 + 设置），普通 admin 可用
    let safeId = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    html += '<div class="pinned-section" style="margin:8px 0;padding:8px;background:#fef9f0;border-radius:6px;">';
    html += '<div style="font-size:13px;font-weight:600;margin-bottom:4px;">📌 置顶消息</div>';
    html += '<div id="pinned-section-' + safeId + '" style="font-size:12px;">加载中...</div>';
    html += '<div style="display:flex;gap:6px;margin-top:6px;">';
    html += '<input type="text" id="pin-chan-' + safeId + '" placeholder="频道(general)" style="width:120px;padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:12px;">';
    html += '<input type="text" id="pin-ts-' + safeId + '" placeholder="消息时间戳(毫秒)" style="flex:1;padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:12px;">';
    html += '<button onclick="setPinned(\'' + name.replace(/'/g, "\\'") + '\')" style="padding:4px 12px;background:#f39c12;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">置顶</button>';
    html += '</div></div>';
    html += '<div class="user-list">';
    if (users.length === 0) html += '<div style="color:#888;font-size:90%">暂无在线用户</div>';
    else {
      users.forEach(u => {
        let userIp = isSuper() ? (ipMap[u] || "") : "";
        let ipBadge = userIp ? ' <span style="color:#999;font-size:85%">(' + escapeHtml(userIp) + ')</span>' : '';
        html += '<div class="user-item"><span class="name" style="cursor:pointer;color:var(--primary)" title="点击查看管理操作" onclick="showUserDetail(\'' + u.replace(/'/g, "\\'") + '\')">' + escapeHtml(u) + ipBadge + '</span><span>' +
          '<button class="kick-btn" onclick="kickUser(\'' + name.replace(/'/g, "\\'") + '\', \'' + u.replace(/'/g, "\\'") + '\')">踢出</button>' +
          '<button class="ban-btn" onclick="blacklistUser(\'' + u.replace(/'/g, "\\'") + '\')">拉黑</button>';
        if (isSuper()) {
          if (blacklist.includes(u)) html += '<button onclick="removeBlacklist(\'' + name.replace(/'/g, "\\'") + '\', \'' + u.replace(/'/g, "\\'") + '\')">移出黑名单</button>';
          else html += '<button onclick="addBlacklist(\'' + name.replace(/'/g, "\\'") + '\', \'' + u.replace(/'/g, "\\'") + '\')">禁止踢人</button>';
          if (userIp) html += '<button class="ban-btn" onclick="banIp(\'' + userIp.replace(/'/g, "\\'") + '\')">封禁IP</button>';
          html += '<button class="ban-btn" onclick="banUser(\'' + u.replace(/'/g, "\\'") + '\')">封禁</button>';
        }
        html += '</span></div>';
      });
    }
    html += '</div>';
    if (blacklist.length > 0) {
      html += '<div class="blacklist-section"><h4>黑名单</h4>';
      blacklist.forEach(b => { html += '<span class="blacklist-item"><button onclick="removeBlacklist(\'' + name.replace(/'/g, "\\'") + '\', \'' + b.replace(/'/g, "\\'") + '\')">' + escapeHtml(b) + ' ✕</button></span>'; });
      html += '</div>';
    }
    html += '<div class="file-list-section"><h4>📎 文件</h4>';
    if (files.length === 0) html += '<div class="file-empty">暂无文件</div>';
    else {
      files.forEach(f => {
        let sz = f.fileSize || 0;
        let sizeStr = sz < 1024 ? sz + ' B' : sz < 1024 * 1024 ? (sz / 1024).toFixed(1) + ' KB' : (sz / (1024 * 1024)).toFixed(1) + ' MB';
        html += '<div class="file-item"><span class="file-info"><strong>' + escapeHtml(f.fileName || "unknown") + '</strong> <span class="file-sender">(' + escapeHtml(f.name || "unknown") + ')</span></span>' +
          '<span><span class="file-size">' + sizeStr + '</span>' +
          '<a class="file-download" href="/api/admin/room-file-data/' + encodeURIComponent(name) + '?key=' + encodeURIComponent(state.adminKey) + '&timestamp=' + f.timestamp + '" target="_blank" rel="noopener noreferrer">下载</a></span></div>';
      });
    }
    html += '</div>';
    detail.innerHTML = html;
    loadPinnedSection(name); // 📌 置顶消息（v1.35）：加载房间各频道置顶列表
  } catch (e) { detail.innerHTML = '<div style="color:#c00">加载失败</div>'; }
}

export async function kickUser(room, user) {
  if (!confirm("确定踢出 " + user + " 吗？")) return;
  try {
    let r = await fetch("/api/admin/kick-user/" + encodeURIComponent(room) + "?key=" + encodeURIComponent(state.adminKey) + "&name=" + encodeURIComponent(user));
    alert(await r.text());
    let card = document.querySelector('.room-card[data-room="' + room.replace(/"/g, '') + '"]');
    if (card) { let detail = card.querySelector(".room-detail"); await loadRoomDetail(detail, room); }
  } catch (e) { alert("操作失败"); }
}

export async function addBlacklist(room, user) {
  try {
    let r = await fetch("/api/admin/blacklist/add/" + encodeURIComponent(room) + "?key=" + encodeURIComponent(state.adminKey) + "&name=" + encodeURIComponent(user));
    alert(await r.text());
    let card = document.querySelector('.room-card[data-room="' + room.replace(/"/g, '') + '"]');
    if (card) { let detail = card.querySelector(".room-detail"); await loadRoomDetail(detail, room); }
  } catch (e) { alert("操作失败"); }
}

export async function removeBlacklist(room, user) {
  try {
    let r = await fetch("/api/admin/blacklist/remove/" + encodeURIComponent(room) + "?key=" + encodeURIComponent(state.adminKey) + "&name=" + encodeURIComponent(user));
    alert(await r.text());
    let card = document.querySelector('.room-card[data-room="' + room.replace(/"/g, '') + '"]');
    if (card) { let detail = card.querySelector(".room-detail"); await loadRoomDetail(detail, room); }
  } catch (e) { alert("操作失败"); }
}

export async function clearRoom(room) {
  if (!confirm("确定清空 " + room + " 的聊天记录吗？此操作不可撤销！")) return;
  try {
    let r = await fetch("/api/admin/clear-room/" + encodeURIComponent(room) + "?key=" + encodeURIComponent(state.adminKey));
    alert(await r.text());
  } catch (e) { alert("操作失败"); }
}

export async function destroyRoom(room) {
  if (!confirm("⚠️ 确定要销毁房间 " + room + " 吗？\n\n此操作将：\n- 清空所有聊天记录\n- 断开所有用户连接\n- 从房间列表中移除\n\n此操作不可撤销！")) return;
  if (!confirm("再次确认：真的要销毁 " + room + " 吗？")) return;
  try {
    let r = await fetch("/api/admin/destroy-room/" + encodeURIComponent(room) + "?key=" + encodeURIComponent(state.adminKey));
    alert(await r.text());
    // 重新加载房间列表
    loadRooms();
  } catch (e) { alert("操作失败: " + e.message); }
}
