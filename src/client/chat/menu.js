// 用户右键菜单
import { state, t } from './state.js';
import { addChatMessage, updatePointsDisplay } from './renderers.js';
import { openDM } from './dm.js';
import { getNote, setNote } from './note.js';
import { showToast, showSuccess, showError, showInfo } from './state.js';

export function showUserMenu(name, x, y) {
  state.menuTargetUser = name;
  let menu = document.getElementById("user-menu");
  let nameLabel = document.getElementById("user-menu-name");
  let note = getNote(name);
  nameLabel.textContent = note ? name + " (" + note + ")" : name;
  let hasAdmin = document.cookie.indexOf("admin_logged=1") !== -1;
  menu.querySelectorAll(".user-menu-item").forEach(el => {
    let a = el.dataset.action;
    if (a === "pay" || a === "at" || a === "dm" || a === "batch-kick" || a === "note" || a === "profile") { el.style.display = "block"; }
    else if (a === "block") { el.style.display = state.blockedUsers.has(name) ? "none" : "flex"; }
    else if (a === "unblock") { el.style.display = state.blockedUsers.has(name) ? "flex" : "none"; }
    else if (a === "mute") { el.style.display = hasAdmin ? "flex" : "none"; }
    else { el.style.display = hasAdmin ? "flex" : "none"; }
  });
  let vw = window.innerWidth, vh = window.innerHeight;
  let mw = 160, mh = 260;
  let left = Math.max(4, Math.min(x, vw - mw - 4));
  let top = Math.max(4, Math.min(y, vh - mh - 4));
  menu.style.left = left + "px";
  menu.style.top = top + "px";
  menu.classList.add("show");
}

export function hideUserMenu() {
  document.getElementById("user-menu").classList.remove("show");
  state.menuTargetUser = null;
}

export function handleMenuAction(action) {
  let target = state.menuTargetUser;
  hideUserMenu();
  if (!target) return;

  switch (action) {
    case "at": {
      let input = document.getElementById("chat-input");
      let cursorPos = input.selectionStart || input.value.length;
      let textBefore = input.value.substring(0, cursorPos);
      let textAfter = input.value.substring(cursorPos);
      input.value = textBefore + "@" + target + " " + textAfter;
      let newPos = cursorPos + target.length + 2;
      input.setSelectionRange(newPos, newPos);
      input.focus();
      break;
    }
    case "dm": {
      if (target === state.username) { showError(t("不能给自己发私信")); break; }
      openDM(target);
      break;
    }
    case "kick": {
      if (target === state.username) { showError(t("不能踢出自己")); return; }
      if (document.cookie.indexOf("admin_logged=1") === -1) { showError(t("请先登录管理后台（访问 /admin）")); return; }
      let k = "";
      if (!confirm(t("确定要踢出「") + target + t("」吗？"))) return;
      fetch("/api/admin/kick-user/" + encodeURIComponent(state.roomname) + "?key=" + encodeURIComponent(k) + "&name=" + encodeURIComponent(target) + "&caller=" + encodeURIComponent(state.username))
        .then(r => r.text()).then(t => addChatMessage(null, "* " + t));
      break;
    }
    case "mute": {
      if (target === state.username) { showError(t("不能禁言自己")); return; }
      let choice = prompt(t("选择禁言时长：\n1 - 1分钟\n2 - 10分钟\n3 - 1小时\n4 - 永久\n\n输入数字"));
      if (!choice) return;
      let duration;
      if (choice === "1") duration = "1m";
      else if (choice === "2") duration = "10m";
      else if (choice === "3") duration = "1h";
      else if (choice === "4") duration = "permanent";
      else { showError(t("无效时长")); return; }
      let reason = prompt(t("禁言原因（可选，留空跳过）"), "");
      fetch("/api/admin/mute", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({name: target, duration, reason: reason || ""})
      }).then(r => r.json()).then(res => {
        if (res.ok) addChatMessage(null, "* " + t("已禁言 ") + target + (duration === "permanent" ? t("（永久）") : ""));
        else showError(t("禁言失败: ") + (res.error || ""));
      }).catch(() => showError(t("禁言失败: 网络错误")));
      break;
    }
    case "ban": {
      if (document.cookie.indexOf("admin_logged=1") === -1) { showError(t("请先登录管理后台（访问 /admin）")); return; }
      let k = "";
      if (!confirm(t("确定要永久封禁「") + target + t("」吗？（将同时封禁IP）"))) return;
      fetch("/api/admin/global-kick?key=" + encodeURIComponent(k) + "&name=" + encodeURIComponent(target));
      fetch("/api/admin/ban/add?key=" + encodeURIComponent(k) + "&name=" + encodeURIComponent(target))
        .then(r => r.text()).then(t => addChatMessage(null, "* " + t));
      break;
    }
    case "banip": {
      if (document.cookie.indexOf("admin_logged=1") === -1) { showError(t("请先登录管理后台（访问 /admin）")); return; }
      let k = "";
      if (!confirm(t("确定要封禁「") + target + t("」的IP吗？"))) return;
      fetch("/api/admin/user-ips?key=" + encodeURIComponent(k))
        .then(r => r.json())
        .then(ipMap => {
          let ip = ipMap[target];
          if (!ip) { showError(t("未找到 ") + target + t(" 的IP记录")); return; }
          fetch("/api/admin/ip-ban/add?key=" + encodeURIComponent(k) + "&ip=" + encodeURIComponent(ip))
            .then(r => r.text()).then(t => addChatMessage(null, "* " + t));
        });
      break;
    }
    case "block": {
      state.blockedUsers.add(target);
      saveBlockedUsers();
      showSuccess(t("已屏蔽 ") + target + t(" 的消息"));
      break;
    }
    case "unblock": {
      state.blockedUsers.delete(target);
      saveBlockedUsers();
      showSuccess(t("已取消屏蔽 ") + target);
      break;
    }
    case "pay": {
      if (target === state.username) { showError(t("不能给自己转账")); return; }
      if (!state.username) { showError(t("请先登录后再转账")); return; }
      let amt = prompt("输入要转给「" + target + t("」的积分数量："));
      if (!amt || isNaN(amt) || parseInt(amt) <= 0) { showError(t("已取消或数量无效")); return; }
      let token = localStorage.getItem("chat_token") || "";
      fetch("/api/points/transfer?sender=" + encodeURIComponent(state.username) + "&receiver=" + encodeURIComponent(target) + "&amount=" + parseInt(amt) + "&token=" + encodeURIComponent(token))
        .then(r => { if (r.status === 403) { addChatMessage(null, t("* 转账失败：请先登录账号")); return null; } return r.text(); })
        .then(t => { if (t) { addChatMessage(null, "* " + t); updatePointsDisplay(); } });
      break;
    }
    case "profile": {
      showProfile(target);
      break;
    }
    case "tag": {
      if (document.cookie.indexOf("admin_logged=1") === -1) { showError(t("请先登录管理后台（访问 /admin）")); return; }
      let k = "";
      let newTag = prompt("输入「" + target + t("」的新标签（留空取消）:"));
      if (!newTag || !newTag.trim()) return;
      let newColor = prompt("标签颜色（留空默认）: red/blue/green/purple/pink/cyan/gray/orange");
      let url = "/api/admin/tag/set?key=" + encodeURIComponent(k) + "&name=" + encodeURIComponent(target) + "&tag=" + encodeURIComponent(newTag.trim());
      if (newColor) url += "&color=" + encodeURIComponent(newColor);
      fetch(url).then(r => r.text()).then(t => addChatMessage(null, "* " + t));
      break;
    }
    case "batch-kick": {
      if (document.cookie.indexOf("admin_logged=1") === -1) { showError(t("请先登录管理后台（访问 /admin）")); return; }
      let k = "";
      let names = prompt("输入要批量踢出的用户名，用逗号分隔：");
      if (!names || !names.trim()) return;
      let nameList = names.split(/[,，\s]+/).filter(Boolean);
      if (nameList.length === 0) return;
      if (!confirm(t("确定要踢出 ") + nameList.length + t(" 个用户吗？"))) return;
      nameList.forEach(n => {
        fetch("/api/admin/kick-user/" + encodeURIComponent(state.roomname) + "?key=" + encodeURIComponent(k) + "&name=" + encodeURIComponent(n))
          .then(r => r.text()).then(t => addChatMessage(null, "* " + t));
      });
      break;
    }
    case "note": {
      let existing = getNote(target);
      let alias = prompt(existing ? "当前备注: " + existing + "\n输入新备注（留空清除）:" : "输入「" + target + t("」的备注名（留空清除）:"), existing || "");
      if (alias === null) return;
      setNote(target, alias);
      break;
    }
  }
}

import { saveBlockedUsers } from './state.js';
import { TAG_COLORS } from './vip.js';
import { getAuthToken } from './auth.js';
import { escapeHtml } from './renderers.js';

export async function showProfile(name) {
  let modal = document.getElementById("profile-modal");
  let content = document.getElementById("profile-content");
  modal.classList.add("show");
  content.innerHTML = t("加载中...");
  try {
    let r = await fetch("/api/user/profile?name=" + encodeURIComponent(name));
    let data = await r.json();
    let isSelf = name === state.username;
    content.innerHTML = "";
    if (data.avatar) {
      let img = document.createElement("img");
      img.className = "profile-avatar";
      img.src = data.avatar;
      content.appendChild(img);
    } else {
      let placeholder = document.createElement("div");
      placeholder.className = "profile-avatar";
      placeholder.style.cssText = "width:80px;height:80px;border-radius:50%;margin:0 auto 12px;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:32px;color:#fff;font-weight:700;border:3px solid var(--primary);";
      placeholder.textContent = (name[0] || "?").toUpperCase();
      content.appendChild(placeholder);
    }
    let nameEl = document.createElement("div");
    nameEl.className = "profile-name";
    nameEl.textContent = name;
    content.appendChild(nameEl);
    if (data.tag) {
      let tagEl = document.createElement("span");
      tagEl.className = "profile-tag";
      tagEl.textContent = data.tag;
      if (data.color && TAG_COLORS[data.color]) tagEl.style.backgroundColor = TAG_COLORS[data.color];
      if (data.border && TAG_COLORS[data.border]) { tagEl.style.outline = "2px solid " + TAG_COLORS[data.border]; tagEl.style.outlineOffset = "-1px"; }
      content.appendChild(tagEl);
    }
    if (data.bio) {
      let bio = document.createElement("div");
      bio.className = "profile-bio";
      bio.textContent = data.bio;
      content.appendChild(bio);
    }
    let stats = document.createElement("div");
    stats.className = "profile-stats";
    stats.innerHTML = '<div class="profile-stat"><div class="profile-stat-val">' + data.points + '</div><div class="profile-stat-label">积分</div></div>'
      + '<div class="profile-stat"><div class="profile-stat-val">' + (data.registered ? "是" : t("否")) + '</div><div class="profile-stat-label">已注册</div></div>';
    content.appendChild(stats);
    if (data.vip) {
      let vip = document.createElement("div");
      vip.className = "profile-vip";
      vip.textContent = "VIP " + data.vip.tier + " - " + data.vip.label;
      content.appendChild(vip);
    }
    if (isSelf) {
      let editBtn = document.createElement("button");
      editBtn.className = "profile-edit-btn";
      editBtn.textContent = t("编辑资料");
      editBtn.addEventListener("click", () => showProfileEditor(name, data));
      content.appendChild(editBtn);
    }
  } catch (e) {
    content.innerHTML = t("加载失败: ") + e.message;
  }
}

export function hideProfile() {
  document.getElementById("profile-modal").classList.remove("show");
}

async function showProfileEditor(name, data) {
  let content = document.getElementById("profile-content");
  content.innerHTML = '<div style="margin-bottom:10px;font-size:14px;font-weight:600;">编辑资料</div>'
    + '<div class="profile-avatar-edit"><label for="avatar-upload" style="font-size:12px;color:var(--primary);cursor:pointer;">上传头像</label><input type="file" id="avatar-upload" accept="image/*"></div>'
    + '<div style="margin-top:10px;"><textarea id="bio-input" maxlength="200" placeholder="个人简介（最多200字）" style="width:90%;height:60px;padding:6px;border:1px solid #ddd;border-radius:6px;resize:vertical;font-family:inherit;font-size:13px;">' + escapeHtml(data.bio || "") + '</textarea></div>'
    + '<div style="margin-top:10px;"><button class="profile-edit-btn" id="profile-save-btn">保存</button></div>';

  document.getElementById("avatar-upload").addEventListener("change", async (e) => {
    let file = e.target.files[0];
    if (!file) return;
    if (file.size > 200 * 1024) { alert("头像文件不能超过200KB"); return; }
    let reader = new FileReader();
    reader.onload = async (ev) => {
      let dataUri = ev.target.result;
      try {
        let r = await fetch("/api/user/avatar?name=" + encodeURIComponent(name), {method: "POST", body: JSON.stringify({avatar: dataUri, token: getAuthToken()}), headers: {"Content-Type": "application/json"}});
        if (r.ok) { alert("头像已更新"); showProfile(name); }
        else alert("更新失败");
      } catch (e) { alert("更新失败: " + e.message); }
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("profile-save-btn").addEventListener("click", async () => {
    let bio = document.getElementById("bio-input").value.trim().slice(0, 200);
    try {
      let r = await fetch("/api/user/bio?name=" + encodeURIComponent(name), {method: "POST", body: JSON.stringify({bio, token: getAuthToken()}), headers: {"Content-Type": "application/json"}});
      if (r.ok) { alert("资料已更新"); showProfile(name); }
      else alert("更新失败");
    } catch (e) { alert("更新失败: " + e.message); }
  });
}
