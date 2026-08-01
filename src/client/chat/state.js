// 共享状态
export const state = {
  currentWebSocket: null,
  currentRelayId: null,
  selectedColor: localStorage.getItem("chat_color") || "#000000",

  // DOM 元素引用
  nameForm: document.querySelector("#name-form"),
  roomNameInput: document.querySelector("#room-name"),
  goPublicButton: document.querySelector("#go-public"),
  goPrivateButton: document.querySelector("#go-private"),
  chatroom: document.querySelector("#chatroom"),
  chatlog: document.querySelector("#chatlog"),
  chatInput: document.querySelector("#chat-input"),
  roster: document.querySelector("#roster"),

  isAtBottom: true,
  username: undefined,
  roomname: undefined,
  roomListInterval: null,

  blockedUsers: new Set(),
  hostname: window.location.host || "edge-chat-demo.cloudflareworkers.com",

  lastSeenTimestamp: 0,
  wroteWelcomeMessages: false,
  originalDocTitle: document.title,
  unreadCount: 0,

  menuTargetUser: null,

  dmCache: {},
  dmTarget: null,
  dmUnread: 0,
  dmUnreadTimer: null,

  replyTarget: null,
  replyText: null,

  soundMuted: false,

  typingTimers: {},
  lastTypingSent: 0,

  searchResults: [],
  searchIndex: -1,

  origTitle: document.title,
  titleInterval: null,

  customEmoji: null, // {name: dataURL, ...} — loaded on startChat
};

export function loadBlockedUsers() {
  try { state.blockedUsers = new Set(JSON.parse(localStorage.getItem("chat_blocked") || "[]")); } catch (e) { state.blockedUsers = new Set(); }
}
export function saveBlockedUsers() {
  localStorage.setItem("chat_blocked", JSON.stringify([...state.blockedUsers]));
}
loadBlockedUsers();
window.addEventListener("storage", (e) => { if (e.key === "chat_blocked") loadBlockedUsers(); });

// Toast 通知系统 — 内联以避免独立模块的 CDN 缓存问题
let _toastContainer = null;
function _ensureToastContainer() {
  if (!_toastContainer || !document.body.contains(_toastContainer)) {
    _toastContainer = document.getElementById("toast-container");
    if (!_toastContainer) {
      _toastContainer = document.createElement("div");
      _toastContainer.id = "toast-container";
      document.body.appendChild(_toastContainer);
    }
  }
  return _toastContainer;
}
function _removeToast(toast) {
  if (toast.classList.contains("removing")) return;
  toast.classList.add("removing");
  setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 200);
}
export function showToast(text, type, duration) {
  type = type || "info"; duration = duration || 3000;
  _ensureToastContainer();
  let toast = document.createElement("div");
  toast.className = "toast toast-" + type;
  let icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  let iconSpan = document.createElement("span"); iconSpan.className = "toast-icon"; iconSpan.textContent = icons[type] || icons.info;
  toast.appendChild(iconSpan);
  let textSpan = document.createElement("span"); textSpan.className = "toast-text"; textSpan.textContent = text;
  toast.appendChild(textSpan);
  let close = document.createElement("span"); close.className = "toast-close"; close.textContent = "×";
  close.addEventListener("click", () => _removeToast(toast)); toast.appendChild(close);
  _toastContainer.appendChild(toast);
  if (duration > 0) setTimeout(() => _removeToast(toast), duration);
  return toast;
}
export function showSuccess(text, duration) { return showToast(text, "success", duration); }
export function showError(text, duration) { return showToast(text, "error", duration || 4000); }
export function showWarning(text, duration) { return showToast(text, "warning", duration || 4000); }
export function showInfo(text, duration) { return showToast(text, "info", duration); }

// —— 多语言 i18n（内联到 state.js，避免独立模块 CDN 缓存/暴露问题）——
export const LANG_KEY = "lang";
const i18nDict = {
  zh: {
    login: "登录", register: "注册", skipLogin: "跳过，直接进入聊天", send: "发送", settings: "设置",
    checkingAuth: "正在验证登录状态...", loginIng: "登录中...", loginOk: "登录成功", loginFailed: "登录失败",
    registerIng: "注册中...", registerMinLen: "密码至少6个字符",
    networkError: "网络错误", pleaseFill: "请填写用户名和密码", username: "用户名", password: "密码",
    language: "语言", close: "关闭", save: "保存", cancel: "取消", confirm: "确认",
    apply: "应用", enterRoom: "进入聊天室", roomPlaceholder: "输入房间名，回车进入",
    bgOpacity: "背景透明度", bgBlur: "磨砂程度", uiColor: "界面色调",
    customWallpaper: "自定义壁纸", videoWallpaper: "视频壁纸",
    restoreRandom: "恢复随机", cancelWallpaper: "取消壁纸", restoreDefault: "恢复默认",
    wallpaperHint: "设置自定义图片壁纸，点击\"恢复随机\"返回随机背景。",
    videoHint: "设置视频动态壁纸，视频将循环静音播放。",
    wallpaperUrl: "图片 URL", videoUrl: "视频 URL", uploadImage: "上传本地图片", uploadVideo: "上传本地视频",
    chatInputPlaceholder: "输入消息...", searchPlaceholder: "搜索消息...", userMenuTitle: "用户",
    at: "@ 提及", dm: "私信", kick: "踢出", ban: "封禁", banip: "封禁IP", batchKick: "批量踢出",
    image: "图片", file: "文件", moreTools: "更多工具", search: "搜索", more: "更多",
    reconnectBanner: "连接已断开，正在尝试重新连接...",
  },
  en: {
    login: "Login", register: "Register", skipLogin: "Skip, enter as guest", send: "Send", settings: "Settings",
    checkingAuth: "Verifying login...", loginIng: "Logging in...", loginOk: "Login successful", loginFailed: "Login failed",
    registerIng: "Registering...", registerMinLen: "Password must be at least 6 characters",
    networkError: "Network error", pleaseFill: "Please enter username and password", username: "Username", password: "Password",
    language: "Language", close: "Close", save: "Save", cancel: "Cancel", confirm: "Confirm",
    apply: "Apply", enterRoom: "Enter chat room", roomPlaceholder: "Type a room name, press Enter",
    bgOpacity: "Background opacity", bgBlur: "Frosted blur", uiColor: "UI tint",
    customWallpaper: "Custom wallpaper", videoWallpaper: "Video wallpaper",
    restoreRandom: "Restore random", cancelWallpaper: "Cancel wallpaper", restoreDefault: "Restore default",
    wallpaperHint: "Set a custom image wallpaper. Click \"Restore random\" to go back.",
    videoHint: "Set a looping muted video wallpaper.",
    wallpaperUrl: "Image URL", videoUrl: "Video URL", uploadImage: "Upload local image", uploadVideo: "Upload local video",
    chatInputPlaceholder: "Type a message...", searchPlaceholder: "Search messages...", userMenuTitle: "User",
    at: "@ Mention", dm: "DM", kick: "Kick", ban: "Ban", banip: "Ban IP", batchKick: "Batch kick",
    image: "Image", file: "File", moreTools: "More tools", search: "Search", more: "More",
    reconnectBanner: "Disconnected, reconnecting...",
  }
};
export function getLang() {
  return localStorage.getItem(LANG_KEY) || "zh";
}
export function setLang(l) {
  l = l === "en" ? "en" : "zh";
  localStorage.setItem(LANG_KEY, l);
  applyI18n();
  document.documentElement.setAttribute("lang", l);
}
export function t(key) {
  const lang = getLang();
  const d = i18nDict[lang] || i18nDict.zh;
  return d[key] !== undefined ? d[key] : (i18nDict.zh[key] !== undefined ? i18nDict.zh[key] : key);
}
export function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
  });
  document.documentElement.setAttribute("lang", getLang());
}
