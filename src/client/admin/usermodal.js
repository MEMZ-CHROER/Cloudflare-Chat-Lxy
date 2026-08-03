// 用户详情弹窗 + 快速搜索
import { state } from './state.js';
import { TAG_COLORS, escapeHtml } from './utils.js';

export function quickSearch() {
  let q = document.querySelector("#quick-search").value.trim();
  if (!q) return;
  showUserDetail(q);
}

export async function showUserDetail(username) {
  let overlay = document.querySelector("#user-modal-overlay");
  overlay.classList.add("open");
  document.querySelector("#um-username").textContent = username;
  document.querySelector("#um-body").innerHTML = '<div style="text-align:center;color:#888;padding:20px">加载中...</div>';

  try {
    let [pointsRes, tagsRes, ipsRes, onlineRes, bannedRes] = await Promise.all([
      fetch("/api/admin/points/get?key=" + encodeURIComponent(state.adminKey) + "&name=" + encodeURIComponent(username)),
      fetch("/api/admin/tag/list?key=" + encodeURIComponent(state.adminKey)),
      fetch("/api/admin/user-ips?key=" + encodeURIComponent(state.adminKey)),
      fetch("/api/admin/all-users?key=" + encodeURIComponent(state.adminKey)),
      fetch("/api/admin/ban/list?key=" + encodeURIComponent(state.adminKey))
    ]);
    let pointsData = await pointsRes.json();
    let tagsData = await tagsRes.json();
    let ipsData = await ipsRes.json();
    let onlineData = await onlineRes.json();
    let bannedList = await bannedRes.json();

    let pts = pointsData.points !== undefined ? pointsData.points : 0;
    let tagInfo = tagsData[username] || null;
    let userIp = ipsData[username] || "未知";
    let isBanned = Array.isArray(bannedList) && bannedList.includes(username);

    let userRooms = [];
    for (let [room, users] of Object.entries(onlineData)) {
      if (users.includes(username)) userRooms.push(room);
    }
    let isOnline = userRooms.length > 0;

    let tagHtml = tagInfo ? '<span class="tag-badge" style="background:' + (TAG_COLORS[tagInfo.color] || "#888") + '">' + escapeHtml(tagInfo.tag || "") + "</span>" : "无";
    let statusHtml = isOnline ? '<span class="online">● 在线</span>' : '<span class="offline">○ 离线</span>';
    let roomHtml = userRooms.length > 0 ? userRooms.map(r => "#" + r).join(", ") : "无";
    let banHtml = isBanned ? '<span style="color:#c00;font-weight:bold">已封禁</span>' : '<span style="color:#27ae60">正常</span>';

    let escUser = username.replace(/'/g, "\\'");
    let actionsHtml = '';
    actionsHtml += '<button class="btn-p" onclick="closeUserModal();navigateTo(\'/admin/points/\');setTimeout(function(){document.querySelector(\'#pts-tb-user\').value=\'' + escUser + '\';searchPointsUser()},200)">管理积分</button>';
    if (isOnline) {
      actionsHtml += '<button class="btn-danger" onclick="closeUserModal();globalKick(\'' + escUser + '\')">全局踢出</button>';
    }
    // v1.36 修复：用户弹窗补「禁言」操作（此前只有积分/踢/封/封IP，缺禁言）
    actionsHtml += '<button class="btn-p" onclick="closeUserModal();muteUser(\'' + escUser + '\')">禁言</button>';
    if (!isBanned) {
      actionsHtml += '<button class="btn-danger" onclick="closeUserModal();banUser(\'' + escUser + '\')">封禁</button>';
    } else {
      actionsHtml += '<button class="btn-success" onclick="closeUserModal();unbanUser(\'' + escUser + '\')">解封</button>';
    }
    if (userIp && userIp !== "未知") {
      actionsHtml += '<button class="btn-danger" onclick="closeUserModal();banIp(\'' + userIp.replace(/'/g, "\\'") + '\')">封禁IP</button>';
      actionsHtml += '<button class="btn-p" onclick="closeUserModal();navigateTo(\'/admin/ip-group/\');setTimeout(function(){document.querySelector(\'#ipg-search\').value=\'' + userIp.replace(/'/g, "\\'") + '\';loadIpGroup()},200)">同IP用户</button>';
    }
    actionsHtml += '<button class="btn-danger" onclick="closeUserModal();deleteUser(\'' + escUser + '\')" style="background:#8e44ad;color:#fff">🗑️ 删除用户</button>';

    document.querySelector("#um-body").innerHTML =
      '<div class="modal-field"><span class="mf-label">用户名</span><span class="mf-value">' + escapeHtml(username) + '</span></div>' +
      '<div class="modal-field"><span class="mf-label">状态</span><span class="mf-value ' + (isOnline ? 'online' : 'offline') + '">' + statusHtml + '</span></div>' +
      '<div class="modal-field"><span class="mf-label">积分</span><span class="mf-value" style="color:#e67e22;font-weight:bold">' + pts + '</span></div>' +
      '<div class="modal-field"><span class="mf-label">标签</span><span class="mf-value">' + tagHtml + '</span></div>' +
      '<div class="modal-field"><span class="mf-label">IP地址</span><span class="mf-value" style="color:#999;font-family:monospace;font-size:95%">' + escapeHtml(userIp) + '</span></div>' +
      '<div class="modal-field"><span class="mf-label">所在房间</span><span class="mf-value">' + roomHtml + '</span></div>' +
      '<div class="modal-field"><span class="mf-label">封禁状态</span><span class="mf-value">' + banHtml + '</span></div>' +
      '<div class="modal-actions">' + actionsHtml + '</div>';

    overlay.onclick = function(e) { if (e.target === this) closeUserModal(); };
  } catch (e) {
    document.querySelector("#um-body").innerHTML = '<div style="color:#c00;text-align:center;padding:20px">加载失败</div>';
  }
}

// v1.36 修复：管理后台禁言（registry 级，POST /api/admin/mute，仿聊天前端 menu.js 的 mute 逻辑）
export function muteUser(name) {
  let choice = prompt("选择禁言时长：\n1 - 1分钟\n2 - 10分钟\n3 - 1小时\n4 - 永久\n\n输入数字");
  if (!choice) return;
  let duration;
  if (choice === "1") duration = "1m";
  else if (choice === "2") duration = "10m";
  else if (choice === "3") duration = "1h";
  else if (choice === "4") duration = "permanent";
  else { alert("无效时长"); return; }
  let reason = prompt("禁言原因（可选，留空跳过）", "");
  fetch("/api/admin/mute", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({name, duration, reason: reason || ""})
  })
    .then(r => r.json())
    .then(res => {
      if (res.ok) alert("已禁言 " + name + (duration === "permanent" ? "（永久）" : ""));
      else alert("禁言失败: " + (res.error || ""));
    })
    .catch(() => alert("禁言失败: 网络错误"));
}

export function closeUserModal() {
  document.querySelector("#user-modal-overlay").classList.remove("open");
}
