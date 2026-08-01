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
  let textSpan = document.createElement("span"); textSpan.className = "toast-text"; textSpan.textContent = t(text);
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
    joinChat: "加入聊天", chooseRoom: "选择一个房间开始聊天", roomNamePlaceholder: "输入房间名称",
    enter: "进入", or: "或者", createPrivate: "创建私人房间",
    shop: "商城", lottery: "抽奖", tasks: "任务", games: "游戏", existingRooms: "已有房间",
    registered: "已注册", logout: "退出登录", guest: "游客", loginRegister: "登录/注册",
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
    joinChat: "Join chat", chooseRoom: "Pick a room to start chatting", roomNamePlaceholder: "Enter room name",
    enter: "Enter", or: "or", createPrivate: "Create private room",
    shop: "Shop", lottery: "Lottery", tasks: "Tasks", games: "Games", existingRooms: "Existing rooms",
    registered: "Registered", logout: "Logout", guest: "Guest", loginRegister: "Login/Register",
    // —— 自动翻译层：中文原文 → 英文（showToast 等输出自动查表，未命中回退原文）——
    "不能给自己发私信": "Cannot DM yourself",
    "不能给自己转账": "Cannot transfer to yourself",
    "不能踢出自己": "Cannot kick yourself",
    "保存失败：存储空间不足（本地图片太大），请使用图片 URL": "Save failed: storage full (image too large), use an image URL",
    "保存失败：存储空间不足（本地视频太大），请使用视频 URL": "Save failed: storage full (video too large), use a video URL",
    "修改标签失败: ": "Failed to change tag: ",
    "加载模块失败: ": "Failed to load module: ",
    "单次最多10万积分": "Max 100k points per red packet",
    "固定金额下每份至少1积分": "Each share needs at least 1 point (fixed mode)",
    "壁纸 URL 不合法，仅支持 https/http 或 data:image": "Invalid wallpaper URL, only https/http or data:image",
    "壁纸已应用": "Wallpaper applied",
    "字体颜色已设置为 ": "Font color set to ",
    "导出失败": "Export failed",
    "导出失败: ": "Export failed: ",
    "已取消屏蔽 ": "Unblocked ",
    "已取消或数量无效": "Cancelled or invalid count",
    "已取消视频壁纸": "Video wallpaper cancelled",
    "已将「": "Moved ",
    "已屏蔽 ": "Blocked ",
    "已恢复默认色调": "Restored default tint",
    "已清除「": "Cleared ",
    "已清除房间背景": "Room background cleared",
    "已设置房间背景: ": "Room background set: ",
    "已转发消息到 ": "Forwarded message to ",
    "当前没有定时消息": "No scheduled messages",
    "所有定时消息已取消": "All scheduled messages cancelled",
    "投票已创建": "Poll created",
    "投票至少需要2个选项": "Poll needs at least 2 options",
    "撤回失败: ": "Recall failed: ",
    "播放失败，尝试下一首": "Playback failed, trying next",
    "文件读取失败": "File read failed",
    "文件过大，上限 15MB": "File too large, max 15MB",
    "文字太长，最多15个字符": "Text too long, max 15 chars",
    "无效的颜色值": "Invalid color",
    "时间范围：1分钟 - 7天": "Range: 1 minute - 7 days",
    "最多100份": "Max 100 shares",
    "未找到 ": "Not found: ",
    "未找到引用的原始消息（可能已被清除）": "Original message not found (may have been cleared)",
    "未知命令: ": "Unknown command: ",
    "未连接到聊天室": "Not connected to chat room",
    "本地图片壁纸已应用": "Local image wallpaper applied",
    "本地聊天记录已清除": "Local chat log cleared",
    "本地视频壁纸已应用": "Local video wallpaper applied",
    "模块错误: ": "Module error: ",
    "正在导出聊天记录...": "Exporting chat log...",
    "消息已定时，将在 ": "Scheduled, will send in ",
    "消息已撤回": "Message recalled",
    "消息已置顶": "Message pinned",
    "消息链接已复制": "Message link copied",
    "积分数量必须大于 0": "Points must be greater than 0",
    "聊天记录已导出": "Chat log exported",
    "自动播放被浏览器拦截，请点击播放按钮": "Autoplay blocked by browser, click play",
    "视频 URL 不合法，仅支持 https/http 或 data:video": "Invalid video URL, only https/http or data:video",
    "视频壁纸已应用": "Video wallpaper applied",
    "请先登录后再转账": "Please login before transferring",
    "请先登录才能抽奖": "Please login to use lottery",
    "请先登录管理后台才能修改标签": "Please login to admin panel to change tag",
    "请先登录管理后台才能封禁IP": "Please login to admin panel to ban IP",
    "请先登录管理后台才能封禁用户": "Please login to admin panel to ban user",
    "请先登录管理后台才能批量踢出": "Please login to admin panel to batch kick",
    "请先登录管理后台才能踢出用户": "Please login to admin panel to kick users",
    "请先登录管理后台（访问 /admin）": "Please login to admin panel (/admin)",
    "请先登录管理后台（访问 /admin）才能修改标签": "Please login to admin panel (/admin) to change tag",
    "请先设置用户名": "Please set a username first",
    "请先选择私信对象": "Please pick a DM target first",
    "请输入图片 URL": "Please enter an image URL",
    "请输入搜索内容": "Please enter search text",
    "请输入视频 URL": "Please enter a video URL",
    "转发失败": "Forward failed",
    "转发失败，房间不存在？": "Forward failed, room not found?",
    "转发需要管理权限，请先登录后台": "Forward needs admin permission, please login",
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
  window.dispatchEvent(new Event("langchange"));
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
