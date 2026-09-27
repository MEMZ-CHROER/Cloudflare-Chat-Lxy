/**
 * v2 Main entry point — initializes auth, room, and chat modules
 * Integrates all override modules for full v2 UI
 */
import { state, set, patch } from "./store.js";
import { checkAuth, login, register, skipAuth } from "./auth.js";
import { fetchRooms, joinRoom, createRoom, leaveRoom } from "./room.js";
import { initMessageListener, initConnListener, initOnlineUsersListener, handleSend, addSystemMessage, loadMessages } from "./chat.js";
import { buildChannelBar, updateChannelBadges } from "./modules/channels.override.js";
import { openDM, closeDM, updateDmBadge } from "./modules/dm.override.js";
import { toggleSearch, doSearch } from "./modules/search.override.js";
import { openSettings, closeV2Settings, saveV2Settings, initSettings } from "./modules/settings.override.js";
import { toggleEmojiPanel } from "./modules/emoji-panel.override.js";
import { handleCommand } from "./modules/commands.override.js";
import { initKeyboardShortcuts } from "./modules/keyboard.override.js";
import { initNotifications, requestNotifPermission } from "./modules/notifications.override.js";
import { initImageUpload } from "./modules/image-upload.override.js";
import { openRoomInfo } from "./modules/roominfo.override.js";
import { isVip, initVipUI } from "./modules/vip.override.js";
import { checkAchievements, renderAchievementsPanel } from "./modules/achievements.override.js";
import { getV2State } from "./state.override.js";
import { initI18n } from "./modules/i18n.override.js";
import { showToast, showSuccess, showError } from "./modules/toast.override.js";

export async function initV2App() {
  console.log("[v2] app initializing");

  // Init i18n and settings first
  initI18n();
  initSettings();

  const authResult = await checkAuth();
  if (authResult.ok) {
    showRoomList();
  } else {
    showAuthForm();
  }

  initMessageListener();
  initConnListener();
  initOnlineUsersListener();
  initKeyboardShortcuts();

  // Delayed inits (need DOM)
  setTimeout(() => {
    initImageUpload();
    initVipUI();
    checkAchievements(getV2State());
    requestNotifPermission();
  }, 500);
}

function showAuthForm() {
  const app = document.getElementById("v2-app");
  app.innerHTML = `
    <div id="v2-auth">
      <div class="v2-auth-card">
        <h1>CloudChat v2</h1>
        <div class="v2-auth-subtitle">Dual Worker Architecture</div>
        <div class="v2-auth-tabs">
          <button class="v2-auth-tab active" data-tab="login">登录</button>
          <button class="v2-auth-tab" data-tab="register">注册</button>
        </div>
        <div id="v2-auth-login">
          <input id="v2-login-name" class="v2-auth-input" placeholder="用户名" maxlength="32">
          <input id="v2-login-pass" type="password" class="v2-auth-input" placeholder="密码">
          <button id="v2-login-btn" class="v2-auth-btn">登录</button>
          <div id="v2-login-error" class="v2-auth-error"></div>
          <button id="v2-skip-auth" class="v2-auth-skip">跳过，以游客身份进入</button>
        </div>
        <div id="v2-auth-register" style="display:none">
          <input id="v2-reg-name" class="v2-auth-input" placeholder="用户名" maxlength="32">
          <input id="v2-reg-pass" type="password" class="v2-auth-input" placeholder="密码（至少6位）">
          <button id="v2-reg-btn" class="v2-auth-btn">注册</button>
          <div id="v2-reg-error" class="v2-auth-error"></div>
        </div>
        <div class="v2-auth-footer">
          <button class="v2-lang-btn" onclick="window.__v2_setLanguage('en')">EN</button>
          <button class="v2-lang-btn" onclick="window.__v2_setLanguage('zh')">中文</button>
        </div>
      </div>
    </div>
  `;
  app.querySelectorAll(".v2-auth-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      app.querySelectorAll(".v2-auth-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.getElementById("v2-auth-login").style.display = tab === "login" ? "block" : "none";
      document.getElementById("v2-auth-register").style.display = tab === "register" ? "block" : "none";
    });
  });
  document.getElementById("v2-login-btn").addEventListener("click", async () => {
    const username = document.getElementById("v2-login-name").value.trim();
    const password = document.getElementById("v2-login-pass").value;
    if (!username || !password) { showError("请输入用户名和密码"); return; }
    const result = await login(username, password);
    if (result.ok) { showSuccess("登录成功"); showRoomList(); }
    else { showError(result.error || "登录失败"); }
  });
  document.getElementById("v2-reg-btn").addEventListener("click", async () => {
    const username = document.getElementById("v2-reg-name").value.trim();
    const password = document.getElementById("v2-reg-pass").value;
    if (!username || !password || password.length < 6) { showError("用户名必填，密码至少6位"); return; }
    const result = await register(username, password);
    if (result.ok) { showSuccess("注册成功"); showRoomList(); }
    else { showError(result.error || "注册失败"); }
  });
  document.getElementById("v2-skip-auth").addEventListener("click", () => { skipAuth(); showRoomList(); });
  document.getElementById("v2-login-name").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("v2-login-btn").click(); });
  document.getElementById("v2-login-pass").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("v2-login-btn").click(); });
  document.getElementById("v2-reg-name").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("v2-reg-btn").click(); });
  document.getElementById("v2-reg-pass").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("v2-reg-btn").click(); });
}

async function showRoomList() {
  const app = document.getElementById("v2-app");
  const rooms = await fetchRooms();
  app.innerHTML = `
    <div id="v2-room-list">
      <div class="v2-header">
        <h1>CloudChat v2</h1>
        <div class="v2-header-actions">
          <span id="v2-user-info">${escapeHtml(state.user?.name || "Guest")}${isVip() ? '<span class="v2-vip-badge">VIP</span>' : ''}</span>
          <button class="v2-header-btn" onclick="window.__v2_openSettings()">⚙️</button>
          <button class="v2-header-btn" onclick="window.__v2_renderAchievements()">🏆</button>
        </div>
      </div>
      <div class="v2-room-input">
        <input id="v2-room-name" placeholder="输入房间名称" maxlength="32">
        <button id="v2-join-room">进入</button>
      </div>
      <div class="v2-room-divider">或选择已有房间</div>
      <div id="v2-rooms">
        ${rooms.length > 0 ? rooms.map(r => `<button class="v2-room-btn" data-room="${escapeHtml(r.name)}">${escapeHtml(r.name)}</button>`).join("") : '<div class="v2-no-rooms">暂无房间，创建一个吧</div>'}
      </div>
      <div class="v2-room-footer">
        <button class="v2-create-room-btn" onclick="window.__v2_showCreateRoom()">+ 创建房间</button>
      </div>
    </div>
  `;
  app.querySelectorAll(".v2-room-btn").forEach(btn => {
    btn.addEventListener("click", () => joinRoom(btn.dataset.room));
  });
  document.getElementById("v2-join-room").addEventListener("click", () => {
    const roomName = document.getElementById("v2-room-name").value.trim();
    if (roomName) joinRoom(roomName);
  });
  document.getElementById("v2-room-name").addEventListener("keydown", e => {
    if (e.key === "Enter") { const rn = e.target.value.trim(); if (rn) joinRoom(rn); }
  });
}

function showCreateRoom() {
  const name = prompt("输入房间名称：");
  if (!name) return;
  const password = prompt("设置房间密码（留空则无密码）：");
  joinRoom(name, password || undefined);
}

export function showChat(roomName) {
  if (roomName) state.currentRoom = roomName;

  const app = document.getElementById("v2-app");
  app.innerHTML = `
    <div id="v2-chat">
      <div class="v2-header">
        <h1>CloudChat v2</h1>
        <div class="v2-header-center">
          <span class="v2-room-name" id="v2-room-name" onclick="window.__v2_openRoomInfo()">#${escapeHtml(state.currentRoom)}</span>
          <span class="v2-channel-tabs" id="v2-channel-bar"></span>
        </div>
        <div class="v2-header-actions">
          <span id="v2-status">connecting...</span>
          <span id="v2-dm-badge" class="v2-dm-badge" style="display:none">0</span>
          <button class="v2-header-btn" onclick="window.__v2_openSettings()">⚙️</button>
          <button class="v2-header-btn" onclick="window.__v2_toggleSearch()">🔍</button>
          <button class="v2-header-btn" onclick="window.__v2_openRoomInfo()">ℹ️</button>
        </div>
      </div>
      <div id="v2-chat-body">
        <div id="v2-messages">
          <div id="v2-msg-spinner" style="text-align:center;padding:20px;color:#64748b;">加载历史消息...</div>
        </div>
        <div id="v2-input-area">
          <button class="v2-emoji-btn" onclick="window.__v2_toggleEmoji()">😊</button>
          <button class="v2-upload-btn" onclick="window.__v2_triggerFileUpload()">📎</button>
          <textarea id="v2-msg-input" placeholder="输入消息... (Shift+Enter 换行, / 命令)" maxlength="5000" rows="1"></textarea>
          <button id="v2-send-btn">发送</button>
        </div>
      </div>
    </div>
  `;

  // Build channel bar
  buildChannelBar();

  // Send message
  document.getElementById("v2-send-btn").addEventListener("click", () => {
    const input = document.getElementById("v2-msg-input");
    const text = input.value.trim();
    if (!text) return;

    // Check for commands
    if (text.startsWith("/")) {
      if (handleCommand(text)) {
        input.value = "";
        return;
      }
    }

    if (window.__v2_handleSend?.(text)) {
      input.value = "";
    }
  });

  const input = document.getElementById("v2-msg-input");
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.getElementById("v2-send-btn").click();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 200) + "px";
  });

  // Back to room list
  document.querySelector(".v2-header").addEventListener("click", e => {
    if (e.target.classList.contains("v2-room-name")) { leaveRoom(); showRoomList(); }
  }, true);

  // Load historical messages
  loadHistory();
}

async function loadHistory() {
  const spinner = document.getElementById("v2-msg-spinner");
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch(`/api/room/${encodeURIComponent(state.currentRoom)}/messages?limit=100`, {
      headers: { "Cookie": `token=${token}` }
    });
    const msgs = await res.json();
    if (spinner) spinner.remove();
    if (Array.isArray(msgs) && msgs.length > 0) {
      const msgList = document.getElementById("v2-messages");
      loadMessages(msgList, msgs);
    }
  } catch (e) {
    if (spinner) spinner.textContent = "加载历史消息失败";
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Export all functions for window access
window.__v2_showChat = showChat;
window.__v2_init = initV2App;
window.__v2_showRoomList = showRoomList;
window.__v2_showAuth = showAuthForm;
window.__v2_showCreateRoom = showCreateRoom;
window.__v2_handleSend = handleSend;
