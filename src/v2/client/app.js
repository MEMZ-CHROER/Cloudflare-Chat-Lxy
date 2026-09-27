/**
 * v2 Main entry point — initializes auth, room, and chat modules
 */
import { state, set, patch } from "./store.js";
import { checkAuth, login, register, skipAuth } from "./auth.js";
import { fetchRooms, joinRoom, createRoom, leaveRoom } from "./room.js";
import { initMessageListener, initConnListener, initOnlineUsersListener, handleSend, addSystemMessage, loadMessages } from "./chat.js";

export async function initV2App() {
  console.log("[v2] app initializing");
  const authResult = await checkAuth();
  if (authResult.ok) {
    showRoomList();
  } else {
    showAuthForm();
  }
  initMessageListener();
  initConnListener();
  initOnlineUsersListener();
}

function showAuthForm() {
  const app = document.getElementById("v2-app");
  app.innerHTML = `
    <div id="v2-auth">
      <div class="v2-auth-card">
        <h1>CloudChat v2</h1>
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
    if (!username || !password) { showAuthError("v2-login-error", "请输入用户名和密码"); return; }
    const result = await login(username, password);
    if (result.ok) { showRoomList(); } else { showAuthError("v2-login-error", result.error); }
  });
  document.getElementById("v2-reg-btn").addEventListener("click", async () => {
    const username = document.getElementById("v2-reg-name").value.trim();
    const password = document.getElementById("v2-reg-pass").value;
    if (!username || !password || password.length < 6) { showAuthError("v2-reg-error", "用户名必填，密码至少6位"); return; }
    const result = await register(username, password);
    if (result.ok) { showRoomList(); } else { showAuthError("v2-reg-error", result.error); }
  });
  document.getElementById("v2-skip-auth").addEventListener("click", () => { skipAuth(); showRoomList(); });
  document.getElementById("v2-login-name").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("v2-login-btn").click(); });
  document.getElementById("v2-login-pass").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("v2-login-btn").click(); });
  document.getElementById("v2-reg-name").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("v2-reg-btn").click(); });
  document.getElementById("v2-reg-pass").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("v2-reg-btn").click(); });
}

function showAuthError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = "block"; }
}

async function showRoomList() {
  const app = document.getElementById("v2-app");
  const rooms = await fetchRooms();
  app.innerHTML = `
    <div id="v2-room-list">
      <div class="v2-header">
        <h1>CloudChat v2</h1>
        <span id="v2-user-info">${escapeHtml(state.user?.name || "Guest")}</span>
      </div>
      <div class="v2-room-input">
        <input id="v2-room-name" placeholder="输入房间名称" maxlength="32">
        <button id="v2-join-room">进入</button>
      </div>
      <div class="v2-room-divider">或选择已有房间</div>
      <div id="v2-rooms">
        ${rooms.map(r => `<button class="v2-room-btn" data-room="${escapeHtml(r.name)}">${escapeHtml(r.name)}</button>`).join("")}
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

export function showChat() {
  const app = document.getElementById("v2-app");
  app.innerHTML = `
    <div id="v2-chat">
      <div class="v2-header">
        <h1>CloudChat v2</h1>
        <span class="v2-room-name" id="v2-room-name">${escapeHtml(state.currentRoom)}</span>
        <span id="v2-status">connecting...</span>
      </div>
      <div id="v2-chat-body">
        <div id="v2-messages">
          <div id="v2-msg-spinner" style="text-align:center;padding:20px;color:#64748b;">加载历史消息...</div>
        </div>
        <div id="v2-input-area">
          <textarea id="v2-msg-input" placeholder="输入消息... (Shift+Enter 换行)" maxlength="5000" rows="1"></textarea>
          <button id="v2-send-btn">发送</button>
        </div>
      </div>
    </div>
  `;

  // Send message
  document.getElementById("v2-send-btn").addEventListener("click", handleSend);
  const input = document.getElementById("v2-msg-input");
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  // Auto-resize textarea
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

// Export for room.js
window.__v2_showChat = showChat;
// Export for HTML script
window.__v2_init = initV2App;
