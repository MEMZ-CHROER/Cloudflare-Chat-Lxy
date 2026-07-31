// 认证模块 - 登录/注册 UI + 辅助函数
import { state } from './state.js';
import { escapeHtml } from './renderers.js';
import { startRoomList } from './rooms.js';

export function startNameChooser() {
  // ====== 自动登录：检查本地 token 是否有效 ======
  let savedUser = localStorage.getItem("chat_user");
  let savedToken = localStorage.getItem("chat_token");
  if (savedUser && savedToken) {
    // 显示加载
    let nameForm = document.querySelector("#name-form");
    if (nameForm) nameForm.style.display = "none";
    let loadingEl = document.querySelector("#auth-loading");
    if (loadingEl) loadingEl.style.display = "block";
    // 验证 token
    fetch("/api/check-auth?name=" + encodeURIComponent(savedUser) + "&token=" + encodeURIComponent(savedToken)).then(r => r.json()).then(data => {
      if (data.authenticated) {
        state.username = savedUser;
        if (loadingEl) loadingEl.style.display = "none";
        startRoomList();
        return;
      }
      // token 过期，回退到登录界面
      localStorage.removeItem("chat_token");
      if (loadingEl) loadingEl.style.display = "none";
      if (nameForm) nameForm.style.display = "block";
      showLoginForm();
    }).catch(() => {
      // 网络错误，允许离线进入
      state.username = savedUser;
      if (loadingEl) loadingEl.style.display = "none";
      startRoomList();
    });
  } else {
    showLoginForm();
  }

  // tab 切换
  document.querySelectorAll(".auth-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      let target = tab.dataset.tab;
      document.querySelector("#auth-login").style.display = target === "login" ? "block" : "none";
      document.querySelector("#auth-register").style.display = target === "register" ? "block" : "none";
      document.querySelector("#login-error").textContent = "";
      document.querySelector("#register-error").textContent = "";
    });
  });

  document.querySelector("#login-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    let name = document.querySelector("#login-name").value.trim();
    let password = document.querySelector("#login-password").value;
    let errEl = document.querySelector("#login-error");
    let btn = document.querySelector("#login-btn");
    errEl.textContent = "";
    errEl.style.display = "none";
    if (!name || !password) { errEl.textContent = "请填写用户名和密码"; errEl.style.display = "block"; return; }
    btn.disabled = true;
    btn.textContent = "登录中...";
    try {
      let r = await fetch("/api/login", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name, password})});
      let data = await r.json();
      if (data.ok) {
        state.username = data.name;
        localStorage.setItem("chat_token", data.token);
        localStorage.setItem("chat_user", data.name);
        startRoomList();
      } else {
        errEl.textContent = data.error || "登录失败";
        errEl.style.display = "block";
      }
    } catch (e) {
      errEl.textContent = "网络错误: " + e.message;
      errEl.style.display = "block";
    }
    btn.disabled = false;
    btn.textContent = "登录";
  });

  document.querySelector("#register-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    let name = document.querySelector("#register-name").value.trim();
    let password = document.querySelector("#register-password").value;
    let errEl = document.querySelector("#register-error");
    let btn = document.querySelector("#register-btn");
    errEl.textContent = "";
    errEl.style.display = "none";
    if (!name || !password) { errEl.textContent = "请填写用户名和密码"; errEl.style.display = "block"; return; }
    if (password.length < 6) { errEl.textContent = "密码至少6个字符"; errEl.style.display = "block"; return; }
    btn.disabled = true;
    btn.textContent = "注册中...";
    try {
      let r = await fetch("/api/register", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name, password})});
      let data = await r.json();
      if (data.ok) {
        errEl.textContent = "";
        errEl.style.display = "none";
        let r2 = await fetch("/api/login", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name, password})});
        let data2 = await r2.json();
        if (data2.ok) {
          state.username = data2.name;
          localStorage.setItem("chat_token", data2.token);
          localStorage.setItem("chat_user", data2.name);
          startRoomList();
        }
      } else {
        errEl.textContent = data.error || "注册失败";
        errEl.style.display = "block";
      }
    } catch (e) {
      errEl.textContent = "网络错误: " + e.message;
      errEl.style.display = "block";
    }
    btn.disabled = false;
    btn.textContent = "注册";
  });

  document.querySelector("#skip-auth").addEventListener("click", (e) => {
    e.preventDefault();
    let name = document.querySelector("#login-name").value.trim() || "游客" + Math.floor(Math.random() * 10000);
    state.username = name;
    localStorage.removeItem("chat_token");
    localStorage.removeItem("chat_user");
    startRoomList();
  });

  document.querySelector("#login-password").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); document.querySelector("#login-btn").click(); }
  });
  document.querySelector("#login-name").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); document.querySelector("#login-btn").click(); }
  });
  document.querySelector("#register-password").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); document.querySelector("#register-btn").click(); }
  });
  document.querySelector("#register-name").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); document.querySelector("#register-btn").click(); }
  });
  document.querySelector("#login-name").focus();
}

function showLoginForm() {
  let nameForm = document.querySelector("#name-form");
  if (nameForm) nameForm.style.display = "block";
  // 重新绑定事件（已被 startRoomList 隐藏过）
  let tabs = document.querySelectorAll(".auth-tab");
  if (tabs.length > 0) tabs[0].click();
  let loginName = document.querySelector("#login-name");
  if (loginName) loginName.focus();
  // 更新账户状态显示
  updateAccountBar();
}

export function updateAccountBar() {
  let bar = document.querySelector("#account-bar");
  if (!bar) return;
  let token = localStorage.getItem("chat_token");
  let user = state.username || localStorage.getItem("chat_user") || "";
  if (token && user) {
    bar.innerHTML = '🔒 <strong>' + escapeHtml(user) + '</strong> (已注册) · <a href="#" id="logout-link" style="color:#e74c3c;text-decoration:none">退出登录</a>';
  } else if (user) {
    bar.innerHTML = '👤 <strong>' + escapeHtml(user) + '</strong> (游客) · <a href="#" id="logout-link" style="color:#4a6cf7;text-decoration:none">登录/注册</a>';
  } else {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "block";
  let logoutLink = document.querySelector("#logout-link");
  if (logoutLink) {
    logoutLink.addEventListener("click", (e) => {
      e.preventDefault();
      doLogout();
    });
  }
}

export function doLogout() {
  localStorage.removeItem("chat_token");
  localStorage.removeItem("chat_user");
  state.username = "";
  // 回到登录界面
  let roomList = document.querySelector("#room-list-form");
  if (roomList) roomList.style.display = "none";
  let nameForm = document.querySelector("#name-form");
  if (nameForm) nameForm.style.display = "block";
  document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
  let firstTab = document.querySelector(".auth-tab");
  if (firstTab) { firstTab.classList.add("active"); firstTab.click(); }
  let loginName = document.querySelector("#login-name");
  if (loginName) { loginName.value = ""; loginName.focus(); }
  updateAccountBar();
}

export function getAuthName() {
  return state.username || localStorage.getItem("chat_user") || "";
}
export function getAuthToken() {
  return localStorage.getItem("chat_token") || "";
}
export function isAuthenticated() {
  return !!getAuthToken() && !!getAuthName();
}
