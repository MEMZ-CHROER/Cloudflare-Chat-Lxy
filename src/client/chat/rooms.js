// 房间列表模块
import { state, t } from './state.js';
import { escapeHtml } from './renderers.js';
import { updateAccountBar } from './auth.js';
import { startChat } from './core.js';
import { join } from './websocket.js';

// 置顶房间管理
function getPinnedRooms() {
  try { return JSON.parse(localStorage.getItem("pinnedRooms") || "[]"); } catch (e) { return []; }
}
function togglePinRoom(name) {
  let pinned = getPinnedRooms();
  let idx = pinned.indexOf(name);
  if (idx >= 0) pinned.splice(idx, 1);
  else pinned.push(name);
  localStorage.setItem("pinnedRooms", JSON.stringify(pinned));
  return idx < 0; // true = pinned, false = unpinned
}

// 密码校验：有密码则弹窗确认，返回是否允许进入；通过后记录 state.roomPassword
async function resolveRoomPassword(name) {
  // v1.43 hacknet 对战游戏：若游戏接管了该房间密码验证则直接放行
  if (window.__hn && await window.__hn.enterPassword(name)) return true;
  try {
    let r = await fetch("/api/room/" + encodeURIComponent(name) + "/password-status");
    let data = await r.json();
    if (data.hasPassword) {
      let pwd = prompt("此房间需要密码才能进入：\n（留空取消）");
      if (!pwd) return false;
      let vr = await fetch("/api/room/" + encodeURIComponent(name) + "/verify-password", {
        method: "POST",
        body: JSON.stringify({password: pwd}),
        headers: {"Content-Type": "application/json"}
      });
      if (!vr.ok) { alert("密码错误"); return false; }
      state.roomPassword = pwd;
    }
  } catch (e) {}
  return true;
}

export async function checkAndJoinRoom(name) {
  // 已在聊天室中（含 /dc 退出后）：走通用切房重连；startChat 幂等，二次调用直接 return
  if (window._chatStarted) { switchRoom(name); return; }
  // 首次进入：密码校验通过后完整初始化
  // L34: state.roomname 只在密码校验通过/无需密码后才赋值，取消或密码错误不残留脏值
  if (!(await resolveRoomPassword(name))) return;
  state.roomname = name;
  startChat();
}

// 通用切房：已初始化时手动关旧连接重连，未初始化时完整 startChat
// startChat 幂等不会二次初始化，故二次切房必须手动关闭旧 WS 并重新 join
export function switchRoom(name) {
  return (async () => {
    if (!(await resolveRoomPassword(name))) return;
    if (!window._chatStarted) {
      state.roomname = name;
      startChat();
      return;
    }
    state.roomname = name;
    document.location.hash = "#" + name;
    // /dc 退出后 chatroom 被隐藏、房间列表轮询在跑：重连时恢复显示并停掉列表轮询（switchRoom 不调 startChat）
    state.chatroom.style.display = "block";
    let roomListFormEl = document.querySelector("#room-list-form");
    if (roomListFormEl) roomListFormEl.style.display = "none";
    if (state.roomListInterval) { clearInterval(state.roomListInterval); state.roomListInterval = null; }
    state.chatlog.innerHTML = "";
    state.roster.querySelectorAll("[data-name]").forEach(el => el.remove());
    // 手动切房：先抑制旧 WS 的 rejoin（join() 开头会复位标志），再关旧连接等它清理，最后连新房间
    state._manualDisconnect = true;
    if (state.currentWebSocket) {
      try {
        const old = state.currentWebSocket;
        old.close();
        await new Promise(res => {
          let done = false;
          const fin = () => { if (!done) { done = true; res(); } };
          old.addEventListener("close", () => setTimeout(fin, 150), { once: true });
          setTimeout(fin, 800); // 兜底超时，防止服务端关闭通知丢失
        });
      } catch (e) {}
    }
    state.currentWebSocket = null;
    join();
  })();
}

export function startRoomList() {
  state.nameForm.style.display = "none";
  document.querySelector("#room-list-form").style.display = "block";
  updateAccountBar();

  // 添加房间搜索框
  let container = document.querySelector("#room-list-form");
  let existingSearch = document.getElementById("room-search-input");
  if (!existingSearch) {
    let searchDiv = document.createElement("div");
    searchDiv.style.cssText = "padding:6px 12px 0;";
    let searchInput = document.createElement("input");
    searchInput.id = "room-search-input";
    searchInput.type = "text";
    searchInput.placeholder = t("🔍 搜索房间...");
    searchInput.style.cssText = "width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--bg);color:var(--text);outline:none;box-sizing:border-box;";
    searchInput.addEventListener("input", () => {
      let v = searchInput.value.trim().toLowerCase();
      document.querySelectorAll("#room-list .room-item").forEach(el => {
        let name = el.querySelector(".room-name")?.textContent?.toLowerCase() || "";
        el.style.display = name.includes(v) ? "" : "none";
      });
    });
    searchDiv.appendChild(searchInput);
    container.insertBefore(searchDiv, document.querySelector("#room-list"));
  }

  let msgRefId = null;
  if (document.location.hash.length > 1) {
    let hashMatch = document.location.hash.match(/^#([^:]+):(\d+)$/);
    if (hashMatch) {
      state.roomname = hashMatch[1];
      msgRefId = hashMatch[2];
    } else {
      state.roomname = document.location.hash.slice(1);
    }
    startChat();
    if (msgRefId) {
      let scrollTimer = setInterval(() => {
        let target = state.chatlog.querySelector('[data-msg-id="' + msgRefId + '"]');
        if (target) {
          target.scrollIntoView({behavior: "smooth", block: "center"});
          target.classList.add("msg-ref-highlight");
          setTimeout(() => target.classList.remove("msg-ref-highlight"), 3000);
          clearInterval(scrollTimer);
        }
      }, 200);
      setTimeout(() => clearInterval(scrollTimer), 15000);
    }
    return;
  }

  state.roomNameInput.addEventListener("input", event => {
    if (event.currentTarget.value.length > 32) event.currentTarget.value = event.currentTarget.value.slice(0, 32);
  });

  state.goPublicButton.addEventListener("click", event => {
    let name = state.roomNameInput.value;
    if (name.length > 0) checkAndJoinRoom(name);
  });

  state.goPrivateButton.addEventListener("click", async event => {
    state.roomNameInput.disabled = true;
    state.goPublicButton.disabled = true;
    event.currentTarget.disabled = true;
    let response = await fetch("https://" + state.hostname + "/api/room", {method: "POST"});
    if (!response.ok) { alert("出现错误"); document.location.reload(); return; }
    let name = await response.text();
    checkAndJoinRoom(name);
  });

  state.roomNameInput.focus();
  state.roomNameInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      let name = state.roomNameInput.value;
      if (name.length > 0) checkAndJoinRoom(name);
    }
  });

  loadRoomList();
  state.roomListInterval = setInterval(loadRoomList, 5000);
}

export async function loadRoomList() {
  let container = document.querySelector("#room-list");
  container.innerHTML = '<div id="room-list-loading">加载中...</div>';
  try {
    let response = await fetch("/api/rooms/list");
    if (!response.ok) throw new Error(t("请求失败"));
    let rooms = await response.json();
    let entries = Object.entries(rooms);
    if (entries.length === 0) { container.innerHTML = '<div id="room-list-empty">暂无公开房间</div>'; return; }
    container.innerHTML = "";

    let pinnedNames = getPinnedRooms();
    entries.sort(([aName], [bName]) => {
      let aIdx = pinnedNames.indexOf(aName);
      let bIdx = pinnedNames.indexOf(bName);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return 0;
    });

    entries.forEach(([name, info]) => {
      let isPinned = pinnedNames.includes(name);
      let div = document.createElement("div");
      div.className = "room-item" + (isPinned ? " pinned" : "");
      let count = typeof info === "object" ? info.count : info;
      let hasPwd = typeof info === "object" && info.hasPassword;
      let pinIcon = isPinned ? ' <span class="pin-indicator">📌</span>' : '';
      div.innerHTML = '<span class="room-name">#' + escapeHtml(name) + (hasPwd ? ' <span style="font-size:12px;">🔒</span>' : '') + pinIcon + '</span><span class="room-count">' + escapeHtml(count) + ' 在线</span>';

      // Pin toggle button
      let pinBtn = document.createElement("span");
      pinBtn.className = "pin-btn";
      pinBtn.textContent = isPinned ? "📌" : "📍";
      pinBtn.title = isPinned ? "取消置顶" : t("置顶房间");
      pinBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePinRoom(name);
        loadRoomList();
      });
      div.querySelector(".room-count").after(pinBtn);

      // Left click = join room (unless hitting the pin button)
      div.addEventListener("click", (e) => {
        if (e.target.closest(".pin-btn")) return;
        checkAndJoinRoom(name);
      });

      // Right-click to pin/unpin
      div.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        togglePinRoom(name);
        loadRoomList();
      });

      container.appendChild(div);
    });
  } catch (err) {
    container.innerHTML = '<div id="room-list-error">加载房间列表失败</div>';
  }
}
