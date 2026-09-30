/**
 * v2 Main entry point — initializes auth, room, and chat modules
 * Uses v1-compatible DOM class names for full visual parity
 */
import { state, set, patch } from "./store.js";
import { checkAuth, login, register, skipAuth } from "./auth.js";
import { fetchRooms, joinRoom, createRoom, leaveRoom } from "./room.js";
import { initMessageListener, initConnListener, initOnlineUsersListener, handleSend, addSystemMessage, loadMessages } from "./chat.js";
import { buildChannelBar, updateChannelBadges } from "./modules/channels.override.js";
import { openDM, closeDM, updateDmBadge } from "./modules/dm.override.js";
import { toggleSearch, doSearch, searchPrev, searchNext } from "./modules/search.override.js";
import { openSettings, closeV2Settings, saveV2Settings, initSettings } from "./modules/settings.override.js";
import { toggleEmojiPanel } from "./modules/emoji-panel.override.js";
import { handleCommand } from "./modules/commands.override.js";
import { initKeyboardShortcuts } from "./modules/keyboard.override.js";
import { initNotifications, requestNotifPermission } from "./modules/notifications.override.js";
import { initImageUpload } from "./modules/image-upload.override.js";
import { openRoomInfo } from "./modules/roominfo.override.js";
import { isVip } from "./modules/vip.override.js";
import { checkAchievements, renderAchievementsPanel } from "./modules/achievements.override.js";
import { getV2State } from "./state.override.js";
import { initI18n } from "./modules/i18n.override.js";
import { showToast, showSuccess, showError } from "./modules/toast.override.js";
import { initVoiceRecord } from "./modules/voice-record.override.js";
import { triggerFileUpload } from "./modules/upload.override.js";

// ─── Window globals for HTML inline handlers ───
window.closeDM = closeDM;
window.openDM = openDM;
window.closeSettings = closeV2Settings;
window.hideProfile = () => { const m = document.getElementById("profile-modal"); if (m) m.style.display = "none"; };
window.sendDM = () => {
  const input = document.getElementById("dm-input");
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();
  input.value = "";
  if (state.ws?.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: "dm", target: state.dmTarget, message: text }));
  }
};

export async function initV2App() {
  try {
    console.log("[v2] app initializing");
    initI18n();
    initSettings();

    // Show auth form initially
    const authForm = document.getElementById("v2-auth-form");
    if (authForm) {
      authForm.style.display = "flex";
      authForm.style.alignItems = "center";
      authForm.style.justifyContent = "center";
      authForm.style.height = "100vh";
      authForm.style.position = "fixed";
      authForm.style.inset = "0";
      authForm.style.zIndex = "3";
      console.log("[v2] auth form shown");
    } else {
      console.error("[v2] v2-auth-form element NOT FOUND!");
    }

    const authResult = await checkAuth();
    console.log("[v2] auth result:", authResult);
    if (authResult.ok) {
      showRoomList();
    } else {
      setupAuthForm();
    }

  initMessageListener();
  initConnListener();
  initOnlineUsersListener();
  initKeyboardShortcuts();

  setTimeout(() => {
    initImageUpload();
    initVoiceRecord();
    checkAchievements(getV2State());
    requestNotifPermission();
  }, 500);
  } catch (e) {
    console.error("[v2] initV2App error:", e);
    const authForm = document.getElementById("v2-auth-form");
    if (authForm) {
      authForm.style.display = "flex";
      authForm.style.alignItems = "center";
      authForm.style.justifyContent = "center";
    }
  }
}

function setupAuthForm() {
  const loginBtn = document.getElementById("v2-login-btn");
  const regBtn = document.getElementById("v2-reg-btn");
  const skipBtn = document.getElementById("v2-skip-auth");
  const loginTab = document.querySelector('[data-tab="login"]');
  const regTab = document.querySelector('[data-tab="register"]');
  const loginSection = document.getElementById("v2-auth-login");
  const regSection = document.getElementById("v2-auth-register");
  const langSelect = document.getElementById("v2-lang-select");

  if (loginTab && regTab) {
    loginTab.addEventListener("click", () => {
      loginTab.classList.add("active");
      regTab.classList.remove("active");
      loginSection.style.display = "block";
      regSection.style.display = "none";
    });
    regTab.addEventListener("click", () => {
      regTab.classList.add("active");
      loginTab.classList.remove("active");
      regSection.style.display = "block";
      loginSection.style.display = "none";
    });
  }

  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      const username = document.getElementById("v2-login-name")?.value.trim();
      const password = document.getElementById("v2-login-pass")?.value;
      if (!username || !password) { showError("请输入用户名和密码"); return; }
      const result = await login(username, password);
      if (result.ok) { showSuccess("登录成功"); showRoomList(); }
      else { showError(result.error || "登录失败"); }
    });
  }

  if (regBtn) {
    regBtn.addEventListener("click", async () => {
      const username = document.getElementById("v2-reg-name")?.value.trim();
      const password = document.getElementById("v2-reg-pass")?.value;
      if (!username || !password || password.length < 6) { showError("用户名必填，密码至少6位"); return; }
      const result = await register(username, password);
      if (result.ok) { showSuccess("注册成功"); showRoomList(); }
      else { showError(result.error || "注册失败"); }
    });
  }

  if (skipBtn) {
    skipBtn.addEventListener("click", () => { skipAuth(); showRoomList(); });
  }

  // Enter key support
  ["v2-login-name", "v2-login-pass"].forEach(id => {
    document.getElementById(id)?.addEventListener("keydown", e => { if (e.key === "Enter") loginBtn?.click(); });
  });
  ["v2-reg-name", "v2-reg-pass"].forEach(id => {
    document.getElementById(id)?.addEventListener("keydown", e => { if (e.key === "Enter") regBtn?.click(); });
  });

  if (langSelect) {
    langSelect.addEventListener("change", () => {
      const lang = langSelect.value;
      localStorage.setItem("chat_lang", lang);
      showToast(lang === "zh" ? "语言已切换为中文" : "Language switched to English", "info");
    });
  }
}

async function showRoomList() {
  // Hide auth, show room list
  document.getElementById("v2-auth-form").style.display = "none";
  const roomListEl = document.getElementById("v2-room-list");
  roomListEl.style.display = "block";
  roomListEl.style.position = "fixed";
  roomListEl.style.inset = "0";
  roomListEl.style.zIndex = "2";
  roomListEl.style.background = "var(--frosted)";
  roomListEl.style.backdropFilter = "var(--frosted-blur)";
  roomListEl.style.webkitBackdropFilter = "var(--frosted-blur)";
  roomListEl.style.overflowY = "auto";
  roomListEl.style.padding = "0";

  // Account bar
  const accountBar = document.getElementById("account-bar");
  if (accountBar) {
    accountBar.style.display = "block";
    accountBar.innerHTML = `${escapeHtml(state.user?.name || "Guest")}${isVip() ? '<span style="background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:4px;">VIP</span>' : ''}`;
  }

  const rooms = await fetchRooms();
  const listEl = document.getElementById("v2-room-list-items");
  if (listEl) {
    if (rooms.length > 0) {
      listEl.innerHTML = rooms.map(r => `
        <div class="room-item" data-room="${escapeHtml(r.name)}">
          <span class="room-name">${escapeHtml(r.name)}</span>
          <span class="room-count">${r.members || 0} 人在线</span>
        </div>
      `).join("");
      listEl.querySelectorAll(".room-item").forEach(item => {
        item.addEventListener("click", () => joinRoom(item.dataset.room));
      });
    } else {
      listEl.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px;">暂无房间，创建一个吧</div>';
    }
  }

  // Join button
  const joinBtn = document.getElementById("v2-join-room");
  if (joinBtn) {
    joinBtn.addEventListener("click", () => {
      const name = document.getElementById("v2-room-name")?.value.trim();
      if (name) joinRoom(name);
    });
  }
  const roomNameInput = document.getElementById("v2-room-name");
  if (roomNameInput) {
    roomNameInput.addEventListener("keydown", e => { if (e.key === "Enter") joinBtn?.click(); });
  }

  // Create room button
  const createBtn = document.getElementById("v2-create-room");
  if (createBtn) {
    createBtn.addEventListener("click", async () => {
      const name = prompt("输入房间名称：");
      if (!name) return;
      const pwd = prompt("设置房间密码（留空则无密码）：");
      await createRoom(name, pwd || undefined);
      showRoomList();
    });
  }
}

export function showChat(roomName) {
  if (roomName) state.currentRoom = roomName;

  // Hide room list, show chat
  document.getElementById("v2-room-list").style.display = "none";
  const chatroom = document.getElementById("chatroom");
  chatroom.style.display = "flex";
  chatroom.style.flexDirection = "column";
  chatroom.style.position = "fixed";
  chatroom.style.inset = "0";
  chatroom.style.zIndex = "1";

  // Set room name in header area
  document.querySelector("#chatroom h2")?.remove(); // remove any leftover title
  const roomTitle = document.createElement("div");
  roomTitle.style.cssText = "padding:12px 16px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;";
  roomTitle.innerHTML = `
    <div>
      <div style="font-size:16px;font-weight:700;color:var(--text)">#${escapeHtml(state.currentRoom)}</div>
      <div style="font-size:12px;color:var(--text-secondary)" id="v2-room-status">连接中...</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <span id="v2-user-info" style="font-size:13px;color:var(--text-secondary)">${escapeHtml(state.user?.name || "Guest")}${isVip() ? '<span style="background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:4px;">VIP</span>' : ''}</span>
      <button class="floating-btn" id="v2-back-btn" title="返回房间列表" style="position:static;width:32px;height:32px;font-size:12px;" onclick="window.__v2_leaveRoom()">↩</button>
    </div>
  `;
  chatroom.prepend(roomTitle);

  // Build channel bar
  buildChannelBar();

  // Back to room list
  const backBtn = document.getElementById("v2-back-btn");
  if (backBtn) {
    backBtn.addEventListener("click", () => leaveRoom());
  }

  // Chat input setup
  const chatInput = document.getElementById("chat-input");
  if (chatInput) {
    chatInput.addEventListener("keydown", e => {
      // Mention dropdown navigation
      const md = document.querySelector("#mention-dropdown");
      if (md && md.classList.contains("show")) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const items = md.querySelectorAll(".mention-item");
          const active = md.querySelector(".mention-item.active");
          let idx = Array.from(items).indexOf(active);
          if (active) active.classList.remove("active");
          idx = Math.min(idx + 1, items.length - 1);
          if (items[idx]) { items[idx].classList.add("active"); items[idx].scrollIntoView({ block: "nearest" }); }
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          const items = md.querySelectorAll(".mention-item");
          const active = md.querySelector(".mention-item.active");
          let idx = Array.from(items).indexOf(active);
          if (active) active.classList.remove("active");
          idx = Math.max(idx - 1, 0);
          if (items[idx]) { items[idx].classList.add("active"); items[idx].scrollIntoView({ block: "nearest" }); }
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const active = md.querySelector(".mention-item.active");
          if (active && active.dataset.name) {
            const name = active.dataset.name;
            const start = chatInput.selectionStart;
            chatInput.value = chatInput.value.substring(0, start) + "@" + name + " ";
            chatInput.setSelectionRange(start + name.length + 2, start + name.length + 2);
          }
          md.classList.remove("show");
          return;
        }
        if (e.key === "Escape") { md.classList.remove("show"); return; }
      }
      // Send on Enter (not Shift+Enter)
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        chatroom.requestSubmit();
        return;
      }
    });

    // Auto-resize textarea
    chatInput.addEventListener("input", () => {
      chatInput.style.height = "auto";
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
    });
  }

  // Form submit = send message
  chatroom.addEventListener("submit", e => {
    e.preventDefault();
    const text = chatInput?.value.trim();
    if (!text) return;
    if (text.startsWith("/")) {
      if (handleCommand(text)) { chatInput.value = ""; return; }
    }
    if (window.__v2_handleSend?.(text)) { chatInput.value = ""; }
  });

  // Floating button behaviors
  document.getElementById("sound-toggle")?.addEventListener("click", () => {
    state.soundMuted = !state.soundMuted;
    const btn = document.getElementById("sound-toggle");
    if (btn) btn.textContent = state.soundMuted ? "🔇" : "🔊";
  });

  document.getElementById("dark-toggle")?.addEventListener("click", () => {
    const on = document.body.classList.toggle("dark");
    localStorage.setItem("darkMode", on ? "1" : "0");
    const btn = document.getElementById("dark-toggle");
    if (btn) btn.textContent = on ? "☀️" : "🌙";
  });

  document.getElementById("search-toggle")?.addEventListener("click", () => window.__v2_toggleSearch?.());
  document.getElementById("settings-toggle")?.addEventListener("click", () => window.__v2_openSettings?.());
  document.getElementById("music-toggle")?.addEventListener("click", () => window.__v2_initMusic?.());
  document.getElementById("more-menu-btn")?.addEventListener("click", () => {
    const panel = document.getElementById("more-menu-panel");
    const backdrop = document.getElementById("more-menu-backdrop");
    if (panel && backdrop) {
      panel.classList.toggle("show");
      backdrop.classList.toggle("show");
    }
  });
  document.getElementById("more-menu-backdrop")?.addEventListener("click", () => {
    document.getElementById("more-menu-panel")?.classList.remove("show");
    document.getElementById("more-menu-backdrop")?.classList.remove("show");
  });

  // More menu actions
  document.querySelectorAll("#more-menu-panel .more-menu-item").forEach(item => {
    item.addEventListener("click", () => {
      const action = item.dataset.action;
      document.getElementById("more-menu-panel")?.classList.remove("show");
      document.getElementById("more-menu-backdrop")?.classList.remove("show");
      switch (action) {
        case "achievements": window.__v2_renderAchievements?.(); break;
        case "favorites": window.__v2_toggleSearch?.(); break; // placeholder
        case "highlights": break;
        case "room-info": window.__v2_openRoomInfo?.(); break;
        case "changelog": window.open("/changelog", "_blank"); break;
        case "archive": window.open("/archive", "_blank"); break;
        case "export": window.__v2_exportChatLog?.(); break;
      }
    });
  });

  // Emoji button
  document.getElementById("emoji-btn")?.addEventListener("click", () => window.__v2_toggleEmoji?.());

  // Voice button
  document.getElementById("voice-btn")?.addEventListener("click", () => {
    const btn = document.getElementById("voice-btn");
    if (btn) btn.classList.toggle("recording");
  });

  // Image button
  document.getElementById("image-btn")?.addEventListener("click", () => {
    document.getElementById("image-picker")?.click();
  });
  document.getElementById("image-picker")?.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    import("./modules/upload.override.js").then(m => m.uploadFile(file)).then(url => {
      if (url && state.ws?.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type: "image", url }));
      }
    });
    e.target.value = "";
  });

  // File button
  document.getElementById("file-btn")?.addEventListener("click", () => {
    document.getElementById("file-picker")?.click();
  });

  // Search bar
  document.getElementById("search-input")?.addEventListener("input", e => doSearch(e.target.value));
  document.getElementById("search-prev")?.addEventListener("click", () => searchPrev());
  document.getElementById("search-next")?.addEventListener("click", () => searchNext());
  document.getElementById("search-close")?.addEventListener("click", () => window.__v2_toggleSearch?.());

  // Markdown toolbar
  document.querySelectorAll(".md-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const wrap = btn.dataset.wrap || "";
      const suffix = btn.dataset.suffix || "";
      if (chatInput) {
        const start = chatInput.selectionStart;
        const end = chatInput.selectionEnd;
        const selected = chatInput.value.substring(start, end);
        chatInput.value = chatInput.value.substring(0, start) + wrap + selected + suffix + chatInput.value.substring(end);
        const newPos = start + wrap.length + (selected ? selected.length : 0) + (suffix ? suffix.length : 0);
        chatInput.setSelectionRange(newPos, newPos);
        chatInput.focus();
      }
    });
  });

  // Scroll to bottom button
  document.getElementById("scroll-bottom-btn")?.addEventListener("click", () => {
    const msgList = document.getElementById("chatlog");
    if (msgList) msgList.scrollTop = msgList.scrollHeight;
  });

  // Reply bar cancel
  document.body.addEventListener("click", e => {
    if (e.target.classList.contains("reply-cancel")) {
      state.replyTarget = null;
      state.replyText = null;
      state.replyId = null;
      const bar = document.getElementById("reply-bar");
      if (bar) bar.style.display = "none";
    }
  });

  // Mention click → user menu
  document.body.addEventListener("click", e => {
    const mention = e.target.closest(".mention");
    if (mention) {
      e.preventDefault();
      const name = mention.dataset.mention;
      if (name) showUserMenu(name, e.clientX, e.clientY);
    }
  });

  // Lightbox close
  document.getElementById("lightbox")?.addEventListener("click", e => {
    if (e.target.classList.contains("lb-close") || e.target === e.currentTarget) {
      document.getElementById("lightbox").style.display = "none";
      _galleryImages = [];
      _galleryIndex = -1;
    }
  });
  document.getElementById("gallery-prev")?.addEventListener("click", e => { e.stopPropagation(); galleryPrev(); });
  document.getElementById("gallery-next")?.addEventListener("click", e => { e.stopPropagation(); galleryNext(); });

  // Lightbox — click image to open
  document.getElementById("chatlog")?.addEventListener("click", e => {
    const img = e.target.closest(".chat-msg img");
    if (img && img.src) {
      buildGallery();
      _galleryIndex = _galleryImages.indexOf(img.src);
      const lb = document.getElementById("lightbox");
      const lbImg = document.getElementById("lightbox-img");
      if (lbImg) lbImg.src = img.src;
      if (lb) { lb.style.display = "flex"; updateGalleryNav(); }
    }
  });

  // Mobile bottom bar
  document.getElementById("mbb-sound")?.addEventListener("click", () => {
    state.soundMuted = !state.soundMuted;
    const btn = document.getElementById("mbb-sound");
    if (btn) btn.textContent = state.soundMuted ? "🔇" : "🔊";
    const st = document.getElementById("sound-toggle");
    if (st) st.textContent = state.soundMuted ? "🔇" : "🔊";
  });
  document.getElementById("mbb-dark")?.addEventListener("click", () => {
    const on = document.body.classList.toggle("dark");
    localStorage.setItem("darkMode", on ? "1" : "0");
    const btn = document.getElementById("mbb-dark");
    if (btn) btn.textContent = on ? "☀️" : "🌙";
    const dt = document.getElementById("dark-toggle");
    if (dt) dt.textContent = on ? "☀️" : "🌙";
  });
  document.getElementById("mbb-search")?.addEventListener("click", () => window.__v2_toggleSearch?.());
  document.getElementById("mbb-more")?.addEventListener("click", () => {
    document.getElementById("more-menu-btn")?.click();
  });

  // Global Escape
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeV2Settings();
      window.__v2_toggleEmoji?.();
    }
  });

  // DM input enter
  document.getElementById("dm-input")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDM(); }
  });

  // Start loading messages
  loadHistory();
}

async function loadHistory() {
  const spinner = document.getElementById("spacer");
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch(`/api/room/${encodeURIComponent(state.currentRoom)}/messages?limit=100`, {
      headers: { "Cookie": `token=${token}` }
    });
    const msgs = await res.json();
    if (spinner) spinner.remove();
    const chatlog = document.getElementById("chatlog");
    if (chatlog && Array.isArray(msgs) && msgs.length > 0) {
      const isSelf = n => n === state.user?.name;
      for (const msg of msgs) {
        const el = renderMsg(msg, isSelf);
        if (el) chatlog.appendChild(el);
      }
      chatlog.scrollTop = chatlog.scrollHeight;
    }
  } catch (e) {
    if (spinner) spinner.textContent = "加载历史消息失败";
  }
}

function renderMsg(msg, isSelf) {
  if (!msg.name) {
    const p = document.createElement("p");
    p.className = "system-msg";
    p.textContent = msg.content || msg.message || "";
    return p;
  }
  const div = document.createElement("div");
  div.className = "chat-msg " + (isSelf ? "self" : "other");
  if (msg.id) div.dataset.msgId = String(msg.id);

  // Header (tag + name)
  const header = document.createElement("div");
  header.className = "msg-header";
  if (msg.tag) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = msg.tag;
    if (msg.tagColor) tag.style.backgroundColor = msg.tagColor;
    header.appendChild(tag);
  }
  const nameSpan = document.createElement("span");
  nameSpan.className = "username";
  nameSpan.textContent = msg.name;
  if (!isSelf) {
    nameSpan.style.cursor = "pointer";
    nameSpan.addEventListener("click", e => {
      e.stopPropagation();
      showUserMenu(msg.name, e.clientX, e.clientY);
    });
  }
  header.appendChild(nameSpan);
  div.appendChild(header);

  // Bubble
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const text = msg.content || msg.message || "";
  if (msg.type === "image") {
    const img = document.createElement("img");
    img.src = text;
    img.style.maxWidth = "240px";
    img.style.borderRadius = "8px";
    img.style.display = "block";
    img.style.cursor = "zoom-in";
    img.addEventListener("click", () => {
      buildGallery();
      _galleryIndex = _galleryImages.indexOf(text);
      const lb = document.getElementById("lightbox");
      const lbImg = document.getElementById("lightbox-img");
      if (lbImg) lbImg.src = text;
      if (lb) { lb.style.display = "flex"; updateGalleryNav(); }
    });
    bubble.appendChild(img);
  } else {
    bubble.innerHTML = formatMarkdown(text);
  }
  div.appendChild(bubble);

  // Time
  if (msg.timestamp) {
    const time = document.createElement("div");
    time.className = "msg-time";
    time.textContent = new Date(msg.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    div.appendChild(time);
  }

  return div;
}

function formatMarkdown(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showUserMenu(name, x, y) {
  const menu = document.getElementById("user-menu");
  if (!menu) return;
  const nameEl = document.getElementById("user-menu-name");
  if (nameEl) nameEl.textContent = name;
  menu.style.left = Math.min(x, window.innerWidth - 180) + "px";
  menu.style.top = Math.min(y, window.innerHeight - 300) + "px";
  menu.style.display = "block";
  menu.classList.add("show");
}

window.addEventListener("click", e => {
  const menu = document.getElementById("user-menu");
  if (menu && menu.classList.contains("show") && !menu.contains(e.target) && !e.target.closest(".username")) {
    menu.classList.remove("show");
    menu.style.display = "none";
  }
});

// Gallery state
let _galleryImages = [];
let _galleryIndex = -1;

function buildGallery() {
  const chatlog = document.getElementById("chatlog");
  if (!chatlog) return;
  _galleryImages = [];
  chatlog.querySelectorAll(".chat-msg img").forEach(img => {
    if (img.src && !_galleryImages.includes(img.src)) _galleryImages.push(img.src);
  });
}

function updateGalleryNav() {
  const prev = document.getElementById("gallery-prev");
  const next = document.getElementById("gallery-next");
  if (prev) prev.style.display = _galleryIndex > 0 ? "block" : "none";
  if (next) next.style.display = _galleryIndex < _galleryImages.length - 1 ? "block" : "none";
}

function galleryPrev() {
  if (_galleryImages.length < 2 || _galleryIndex <= 0) return;
  _galleryIndex--;
  const img = document.getElementById("lightbox-img");
  if (img) img.src = _galleryImages[_galleryIndex];
  updateGalleryNav();
}

function galleryNext() {
  if (_galleryImages.length < 2 || _galleryIndex >= _galleryImages.length - 1) return;
  _galleryIndex++;
  const img = document.getElementById("lightbox-img");
  if (img) img.src = _galleryImages[_galleryIndex];
  updateGalleryNav();
}
window.__v2_leaveRoom = () => { leaveRoom(); showRoomList(); };
window.__v2_showChat = showChat;
window.__v2_init = initV2App;
window.__v2_showRoomList = showRoomList;
window.__v2_handleSend = handleSend;
window.__v2_galleryPrev = galleryPrev;
window.__v2_galleryNext = galleryNext;
