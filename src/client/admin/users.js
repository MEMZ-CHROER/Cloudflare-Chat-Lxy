// 用户管理 - 全局用户、封禁、IP封禁、黑名单
import { state } from './state.js';
import { TAG_COLORS, escapeHtml, addBorderSelects } from './utils.js';
import { loadRooms } from './rooms.js';

export async function loadGlobalUsers() {
  let container = document.querySelector("#global-users-list");
  try {
    let r = await fetch("/api/admin/all-users?key=" + encodeURIComponent(state.adminKey));
    let data = await r.json();
    let userRooms = {};
    for (let [room, users] of Object.entries(data)) users.forEach(u => { if (!userRooms[u]) userRooms[u] = []; userRooms[u].push(room); });
    let tagMap = {};
    try { let tr = await fetch("/api/admin/tag/list?key=" + encodeURIComponent(state.adminKey)); tagMap = await tr.json(); } catch (e) {}
    let userIpMap = {};
    try { let ipr = await fetch("/api/admin/user-ips?key=" + encodeURIComponent(state.adminKey)); userIpMap = await ipr.json(); } catch (e) {}
    let entries = Object.entries(userRooms);
    if (entries.length === 0) { container.innerHTML = '<div style="color:#888;padding:8px 0">暂无在线用户</div>'; return; }
    let pointsMap = {};
    try { let pr = await fetch("/api/admin/points/all?key=" + encodeURIComponent(state.adminKey)); pointsMap = await pr.json(); } catch (e) {}
    let html = '';
    entries.forEach(([user, rooms]) => {
      let userTag = tagMap[user] || '';
      let tagText = userTag.tag || '', tagColor = userTag.color || '';
      let tagStyle = tagColor && TAG_COLORS[tagColor] ? 'style="background:' + TAG_COLORS[tagColor] + '"' : '';
      let userIp = userIpMap[user] || '';
      let ipHtml = userIp ? ' <span style="color:#999;font-size:85%">(' + escapeHtml(userIp) + ')</span>' : '';
      let userPoints = pointsMap[user] || 0;
      let escUser = user.replace(/'/g, "\\'");
      let safeId = user.replace(/[^a-zA-Z0-9]/g, '_');
      let tagHtml = tagText
        ? '<span class="tag-badge" ' + tagStyle + '>' + escapeHtml(tagText) + '</span><button class="tag-remove-btn" onclick="removeTag(\'' + escUser + '\')">✕</button>'
        : '<input class="tag-input" placeholder="标签" maxlength="10"><select class="tag-color-select">'
            + '<option value="">默认</option>'
            + Object.keys(TAG_COLORS).map(c => '<option value="' + c + '">' + c + '</option>').join('')
            + '</select><button class="tag-set-btn" onclick="setTag(this,\'' + escUser + '\')">设置</button>';
      html += '<div class="global-user-item"><span class="name">' + escapeHtml(user) + ipHtml + tagHtml + '</span>' +
        '<span class="rooms">房间: ' + rooms.map(r => '#' + r).join(', ') + '</span>' +
        '<span style="display:flex;align-items:center;gap:4px">' +
        '<span class="points-badge" style="color:#e67e22;font-weight:bold">' + userPoints + '</span>' +
        '<input class="tag-input" placeholder="积分" id="pts-input-' + safeId + '" style="width:50px">' +
        '<button class="tag-set-btn" onclick="setPoints(\'' + escUser + '\')">设置</button>' +
        '<button class="tag-set-btn" onclick="grantAnon(\'' + escUser + '\')" title="发放匿名券">🕶️发券</button>' +
        '<button class="kick-btn" onclick="globalKick(\'' + escUser + '\')">全局踢出</button>' +
        '<button class="ban-btn" onclick="banUser(\'' + escUser + '\')">封禁</button>' +
        '<button class="ban-btn" onclick="blacklistUser(\'' + escUser + '\')">拉黑</button></span></div>';
    });
    container.innerHTML = html;
    addBorderSelects();
  } catch (e) { container.innerHTML = '<div style="color:#c00;padding:8px 0">加载失败</div>'; }
}

export async function globalKick(user) {
  if (!confirm("确定将 " + user + " 从所有房间踢出吗？")) return;
  try {
    let r = await fetch("/api/admin/global-kick?key=" + encodeURIComponent(state.adminKey) + "&name=" + encodeURIComponent(user));
    let data = await r.json();
    alert("已从 " + data.kickedFrom.length + " 个房间踢出 " + user);
    loadGlobalUsers(); loadRooms();
  } catch (e) { alert("操作失败"); }
}

export async function banUser(user) {
  if (!confirm("确定封禁 " + user + " 吗？")) return;
  try {
    await fetch("/api/admin/global-kick?key=" + encodeURIComponent(state.adminKey) + "&name=" + encodeURIComponent(user));
    let r = await fetch("/api/admin/ban/add?key=" + encodeURIComponent(state.adminKey) + "&name=" + encodeURIComponent(user));
    alert(await r.text());
    loadBannedList(); loadGlobalUsers(); loadRooms();
  } catch (e) { alert("操作失败"); }
}

export async function unbanUser(user) {
  if (!confirm("确定解封 " + user + " 吗？")) return;
  try {
    let r = await fetch("/api/admin/ban/remove?key=" + encodeURIComponent(state.adminKey) + "&name=" + encodeURIComponent(user));
    alert(await r.text());
    loadBannedList();
  } catch (e) { alert("操作失败"); }
}

export async function loadBannedList() {
  let container = document.querySelector("#banned-users-list");
  try {
    let r = await fetch("/api/admin/ban/list?key=" + encodeURIComponent(state.adminKey));
    let banned = await r.json();
    if (!Array.isArray(banned) || banned.length === 0) { container.innerHTML = '<div style="color:#888;padding:8px 0">暂无被封禁用户</div>'; return; }
    container.innerHTML = banned.map(user =>
      '<div class="banned-user-item"><span class="name">' + escapeHtml(user) + '</span>' +
      '<button class="unban-btn" onclick="unbanUser(\'' + user.replace(/'/g, "\\'") + '\')">解封</button></div>'
    ).join("");
  } catch (e) { container.innerHTML = '<div style="color:#c00;padding:8px 0">加载失败</div>'; }
}

export async function loadIpBannedList() {
  let container = document.querySelector("#ip-banned-list");
  try {
    let r = await fetch("/api/admin/ip-ban/list?key=" + encodeURIComponent(state.adminKey));
    let banned = await r.json();
    if (!Array.isArray(banned) || banned.length === 0) { container.innerHTML = '<div style="color:#888;padding:8px 0">暂无被封禁IP</div>'; return; }
    container.innerHTML = banned.map(ip =>
      '<div class="banned-user-item"><span class="name">' + escapeHtml(ip) + '</span>' +
      '<button class="unban-btn" onclick="unbanIp(\'' + ip.replace(/'/g, "\\'") + '\')">解封</button></div>'
    ).join("");
  } catch (e) { container.innerHTML = '<div style="color:#c00;padding:8px 0">加载失败</div>'; }
}

export function banIpByInput() {
  let input = document.querySelector("#ban-ip-input");
  let ip = input.value.trim();
  if (!ip) { alert("请输入IP地址"); return; }
  banIp(ip);
  input.value = "";
}

export async function banIp(ip) {
  if (!confirm("确定封禁IP " + ip + " 吗？")) return;
  try {
    let r = await fetch("/api/admin/ip-ban/add?key=" + encodeURIComponent(state.adminKey) + "&ip=" + encodeURIComponent(ip));
    alert(await r.text());
    loadIpBannedList();
  } catch (e) { alert("操作失败"); }
}

export async function unbanIp(ip) {
  if (!confirm("确定解封IP " + ip + " 吗？")) return;
  try {
    let r = await fetch("/api/admin/ip-ban/remove?key=" + encodeURIComponent(state.adminKey) + "&ip=" + encodeURIComponent(ip));
    alert(await r.text());
    loadIpBannedList();
  } catch (e) { alert("操作失败"); }
}

export async function loadGlobalBlacklist() {
  let container = document.querySelector("#global-blacklist-list");
  try {
    let r = await fetch("/api/admin/global-blacklist/list?key=" + encodeURIComponent(state.adminKey));
    let list = await r.json();
    if (!Array.isArray(list) || list.length === 0) { container.innerHTML = '<div style="color:#888;padding:8px 0">暂无被拉黑的用户</div>'; return; }
    container.innerHTML = list.map(user =>
      '<div class="banned-user-item"><span class="name">' + escapeHtml(user) + '</span>' +
      '<button onclick="unblacklistUser(\'' + user.replace(/'/g, "\\'") + '\')" style="padding:4px 10px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:85%">移出黑名单</button></div>'
    ).join("");
  } catch (e) { container.innerHTML = '<div style="color:#c00;padding:8px 0">加载失败</div>'; }
}

export async function setPoints(user) {
  let input = document.querySelector("#pts-input-" + user.replace(/[^a-zA-Z0-9]/g, '_'));
  if (!input) return;
  let amount = parseInt(input.value, 10);
  if (isNaN(amount)) { alert("请输入有效积分数量"); return; }
  try {
    let r = await fetch("/api/admin/points/set?key=" + encodeURIComponent(state.adminKey) + "&name=" + encodeURIComponent(user) + "&amount=" + amount);
    alert(await r.text());
    loadGlobalUsers();
  } catch (e) { alert("操作失败: " + e.message); }
}

// 🕶️ 发放匿名券（管理操作，普通 admin 可用）
export async function grantAnon(user) {
  let count = prompt("给 " + user + " 发放几张匿名券？", "1");
  if (count === null) return;
  count = parseInt(count, 10);
  if (isNaN(count) || count < 1 || count > 1000) { alert("请输入 1-1000 之间的数量"); return; }
  try {
    let r = await fetch("/api/admin/anon-grant?key=" + encodeURIComponent(state.adminKey) + "&name=" + encodeURIComponent(user) + "&count=" + count);
    if (!r.ok) throw new Error("HTTP " + r.status);
    let data = await r.json();
    alert("已给 " + user + " 发放 " + count + " 张匿名券，当前共 " + data.anonCoupons + " 张");
  } catch (e) { alert("操作失败: " + e.message); }
}

export async function blacklistUser(user) {
  if (!confirm("确定将 " + user + " 加入全局黑名单吗？")) return;
  try {
    let r = await fetch("/api/admin/global-blacklist/add?key=" + encodeURIComponent(state.adminKey) + "&name=" + encodeURIComponent(user));
    alert(await r.text());
    loadGlobalBlacklist(); loadGlobalUsers();
  } catch (e) { alert("操作失败"); }
}

export async function unblacklistUser(user) {
  if (!confirm("确定将 " + user + " 移出全局黑名单吗？")) return;
  try {
    let r = await fetch("/api/admin/global-blacklist/remove?key=" + encodeURIComponent(state.adminKey) + "&name=" + encodeURIComponent(user));
    alert(await r.text());
    loadGlobalBlacklist(); loadGlobalUsers();
  } catch (e) { alert("操作失败"); }
}

export async function deleteUser(user) {
  if (!confirm("⚠️ 确定要永久删除用户 " + user + " 吗？\n\n此操作将清除：\n- 注册信息\n- 标签\n- 积分\n- 背包物品\n- 历史记录\n- 黑名单/封禁\n\n此操作不可撤销！")) return;
  if (!confirm("再次确认：真的要删除用户 " + user + " 吗？")) return;
  try {
    let r = await fetch("/api/admin/delete-user?key=" + encodeURIComponent(state.adminKey) + "&name=" + encodeURIComponent(user));
    alert(await r.text());
    loadGlobalUsers(); loadBannedList(); loadGlobalBlacklist();
  } catch (e) { alert("操作失败: " + e.message); }
}
