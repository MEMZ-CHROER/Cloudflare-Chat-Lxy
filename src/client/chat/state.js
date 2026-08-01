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
    // —— 全量片段翻译（自动包裹 t() 的拼接片段）——
    "  @了全体成员": "  @ everyone",
    " (发起: ": " (started by: ",
    " 个用户: ": " users: ",
    " 个用户吗？": " users?",
    " 分钟后发送": " minutes to send",
    " 即将刷新聊天室...": " chat will refresh...",
    " 发了 ": " sent ",
    " 发来私信": " sent you a DM",
    " 回应": " reacted",
    " 已自动装备！": " auto-equipped!",
    " 已被踢出房间": " was kicked from the room",
    " 房间！打个招呼吧！": " room! Say hi!",
    " 抽中了: ": " won: ",
    " 提到了 ": " mentioned ",
    " 收藏": " favorite",
    " 条，由 ": " messages, by ",
    " 来到 ": " came to ",
    " 用户": " user",
    " 的IP记录": "'s IP records",
    " 的消息": "'s messages",
    " 的聊天记录吗？": "'s chat log?",
    " 种)": " kinds)",
    " 积分": " points",
    " 积分 (奖品: ": " points (prize: ",
    " 积分 · ": " points · ",
    " 积分！当前积分: ": " points! Current: ",
    " 积分，当前共 ": " points, total ",
    " 签到成功！获得 ": " Check-in success! Got ",
    " 结束": " ended",
    " 聊天室！": " chat room!",
    " 转发: ": " forwarded: ",
    " 进入了聊天室": " entered the room",
    "* [接龙结束] 共 ": "* [relay ended] total ",
    "* 你已被踢出房间，即将刷新页面...": "* You were kicked from the room, page will refresh...",
    "* 可用命令: /pay <用户> <数量> 转积分 | /w <用户> <消息> 私聊 | /color <颜色> 字体颜色 | /kick <用户> 踢出 | /ban <用户> 封禁(含IP) | /unban <用户> 解封 | /tag <用户> <标签> [颜色] [边框] 设置标签(支持[color]多色) | /untag <用户> 移除标签 | /redpacket <总积分> <份数> [fixed] 发红包 | /clear 清空(需管理) | /clean 本地清屏 | /zifu <文字> 生成字符画 | 发送 @所有人 可@全体成员 | /help 帮助": "* Commands: /pay <user> <amount> send points | /w <user> <msg> DM | /color <color> font color | /kick <user> kick | /ban <user> ban (incl. IP) | /unban <user> unban | /tag <user> <tag> [color] [border] set tag | /untag <user> remove tag | /redpacket <total> <count> [fixed] red packet | /clear clear (admin) | /clean local clear | /zifu <text> ASCII art | send @everyone to ping all | /help help",
    "* 可用抽奖池:": "* Available pools:",
    "* 字符画生成失败: ": "* ASCII art failed: ",
    "* 定时消息已取消": "* Scheduled message cancelled",
    "* 定时消息已设置（ID: ": "* Scheduled message set (ID: ",
    "* 当前没有可用的抽奖池": "* No available lottery pools",
    "* 当前没有进行中的接龙": "* No active relay",
    "* 当前进行中的接龙:": "* Active relay:",
    "* 抽奖失败: ": "* Lottery failed: ",
    "* 提示: 聊天室参与者是互联网上的匿名用户，名称未经认证，任何人都可以使用相同名称，请仔细甄别信息；请勿随意相信陌生人的链接或与陌生人交易": "* Note: chat participants are anonymous internet users; names are not verified and anyone can use the same name. Please stay cautious and do not trust strangers' links or trade with them.",
    "* 操作失败: ": "* Operation failed: ",
    "* 欢迎来到 #": "* Welcome to #",
    "* 签到失败: ": "* Check-in failed: ",
    "* 聊天记录已被管理员清空，即将刷新...": "* Chat log cleared by admin, refreshing...",
    "* 获取奖池失败: ": "* Failed to get pools: ",
    "* 转账失败: ": "* Transfer failed: ",
    "* 转账失败：请先登录账号": "* Transfer failed: please login first",
    "* 这是一个私人房间。你可以通过分享URL邀请他人加入。": "* This is a private room. Share the URL to invite others.",
    "* 这是一个网页聊天室，无需注册即可畅聊。": "* This is a web chat room, no registration needed.",
    "* 错误: ": "* Error: ",
    "* 🏷️ 标签 ": "* 🏷️ Tag ",
    "* 🧧 红包已发出，等待领取...": "* 🧧 Red packet sent, waiting...",
    ": 失败 - ": ": failed - ",
    "[图片]": "[Image]",
    "[图片已过期]": "[Image expired]",
    "[文件]": "[File]",
    "↗️ 转房间": "↗️ Forward room",
    "↩️ 撤回": "↩️ Recall",
    "─ 以下是新消息 ─": "─ New messages below ─",
    "✏️ 编辑": "✏️ Edit",
    "❌ 未连接": "❌ Not connected",
    "⭐ 精华": "⭐ Highlight",
    "。用法: /bg <颜色/#hex/url> 或 /bg 清除": ". Usage: /bg <color/#hex/url> or /bg clear",
    "」吗？": "」?",
    "」吗？（将同时封禁IP）": "」? (IP will also be banned)",
    "」的IP吗？": "」's IP?",
    "」的备注": "」's note",
    "」的备注名（留空清除）:": "」's note name (leave empty to clear):",
    "」的备注设为: ": "」's note set to: ",
    "」的新标签（留空取消）:": "」's new tag (leave empty to cancel):",
    "」的积分数量：": "」's points amount: ",
    "中文": "Chinese",
    "保存": "Save",
    "取消": "Cancel",
    "否": "No",
    "好的": "OK",
    "收到": "Got it",
    "谢谢": "Thanks",
    "错误": "Error",
    "未知": "Unknown",
    "清除": "Clear",
    "添加": "Add",
    "复制": "Copy",
    "已复制": "Copied",
    "删除「": "Delete ",
    "副管理员": "Co-admin",
    "管理员": "Admin",
    "系统": "System",
    "游客": "Guest",
    "自定义": "Custom",
    "加载中...": "Loading...",
    "加载失败: ": "Load failed: ",
    "无结果": "No results",
    "未知错误": "Unknown error",
    "更多操作": "More actions",
    "编辑资料": "Edit profile",
    "置顶房间": "Pin room",
    "添加关键词...": "Add keyword...",
    "新短语...": "New phrase...",
    "正在上传...": "Uploading...",
    "正在处理图片...": "Processing image...",
    "正在读取文件... ": "Reading file... ",
    "注册失败": "Registration failed",
    "签到失败": "Check-in failed",
    "抽奖失败": "Lottery failed",
    "请求失败": "Request failed",
    "私信: ": "DM: ",
    "点击修改标签": "Click to change tag",
    "点击操作": "Click to operate",
    "点击跳转到原文": "Click to jump to original",
    "欢迎 ": "Welcome ",
    "翻译中...": "Translating...",
    "翻译失败: ": "Translation failed: ",
    "添加 ": "Add ",
    "投票": "Poll",
    "拼手气": "Lucky draw",
    "已抢": "Claimed",
    "已抢完": "All claimed",
    "确定清空 ": "Clear ",
    "确定要封禁「": "Ban ",
    "确定要永久封禁「": "Permanently ban ",
    "确定要踢出 ": "Kick ",
    "确定要踢出「": "Kick ",
    "用法: /ban <用户名>": "Usage: /ban <username>",
    "用法: /batch-kick <用户名1>,<用户名2>,...": "Usage: /batch-kick <user1>,<user2>,...",
    "用法: /jl <数字> <内容>": "Usage: /jl <number> <content>",
    "用法: /kick <用户名>": "Usage: /kick <username>",
    "用法: /pay <用户名> <积分数量>": "Usage: /pay <username> <points>",
    "用法: /redpacket <总积分> <份数> [fixed]": "Usage: /redpacket <total> <count> [fixed]",
    "用法: /tag <用户名> <标签> [颜色] [边框颜色]\\n  支持多色: /tag 1 [red]五[green]彩[blue]斑斓": "Usage: /tag <username> <tag> [color] [border color]\\n  multi-color: /tag 1 [red]a[green]b[blue]c",
    "用法: /unban <用户名>": "Usage: /unban <username>",
    "用法: /untag <用户名>": "Usage: /untag <username>",
    "用法: /w <用户名> <消息>": "Usage: /w <username> <message>",
    "用法: /zifu <文字>": "Usage: /zifu <text>",
    "所有音乐 API 均不可用": "All music APIs unavailable",
    "无效的房间名称。": "Invalid room name.",
    "无效颜色，可用: red/orange/gold/green/cyan/blue/purple/pink/black/white/gray 或 #hex": "Invalid color. Available: red/orange/gold/green/cyan/blue/purple/pink/black/white/gray or #hex",
    "暂无关键词，添加后聊天中出现时将通知你": "No keywords yet; you'll be notified when they appear in chat",
    "条 (发起: ": " messages (started by: ",
    "金标大佬": "Gold VIP",
    "金边红大佬": "Gold-red VIP",
    "🌐 翻译": "🌐 Translate",
    "💬 回复": "💬 Reply",
    "💬 私信": "💬 DM",
    "📌 置顶": "📌 Pin",
    "📍 标记": "📍 Mark",
    "📎 文件": "📎 File",
    "🔍 搜索房间...": "🔍 Search rooms...",
    "🔗 复制链接": "🔗 Copy link",
    "🖼 图片": "🖼 Image",
    "（支持颜色名: red/orange/gold/green/cyan/blue/purple/pink/black/white 或 #hex 值）": " (Supported colors: red/orange/gold/green/cyan/blue/purple/pink/black/white or #hex)",
    "（留空结束）：": " (leave empty to end):",
    "，输入 /help 查看可用命令": ", type /help for commands",
    // —— game 模块 ——
    " 个水果，获得 ": " fruits, got ",
    " 个泡泡，获得 ": " bubbles, got ",
    " 个障碍，获得 ": " obstacles, got ",
    " 个，获得 ": ", got ",
    " 分": " points",
    " 只小鸡，获得 ": " chicks, got ",
    " 次": " times",
    " 次，获得 ": " times, got ",
    " 步，获得 ": " steps, got ",
    " 瓶": " bottles",
    " 瓶，获得 ": " bottles, got ",
    " 积分": " points",
    " 积分！": " points!",
    " 轮正确！+200": " rounds correct! +200",
    "'>⏰ 时间到！抓住 ": "'>⏰ Time's up! Catch ",
    "'>⏰ 时间到！接到 ": "'>⏰ Time's up! Caught ",
    "'>✈️ 飞过了 ": "'>✈️ Flew past ",
    "'>🎪 套中 ": "'>🎪 Ringed ",
    "'>🎳 共击倒 ": "'>🎳 Knocked down ",
    "'>🏓 得分 ": "'>🏓 Score ",
    "'>🔫 命中 ": "'>🔫 Hit ",
    "'>🖱️ 戳破 ": "'>🖱️ Popped ",
    "/10 个飞碟，获得 ": "/10 saucers, got ",
    "⏰ 超时！": "⏰ Time's up!",
    "⏰ 超时！答案是 ": "⏰ Time's up! The answer is ",
    "⏰ 飞碟飞走了！": "⏰ Saucer flew away!",
    "⏳ 加载中...": "⏳ Loading...",
    "✅ +10 分": "✅ +10 points",
    "✅ 正确！连对 ": "✅ Correct! Streak ",
    "✅ 第 ": "✅ Round ",
    "✅ 继续点 ": "✅ Keep clicking ",
    "❌ 应该点 ": "❌ Should click ",
    "❌ 抢跑了！等变绿": "❌ Too early! Wait for green",
    "❌ 没套中": "❌ Missed",
    "❌ 没打中！": "❌ Missed!",
    "下一张比它大还是小？": "Next card higher or lower?",
    "亿+": "100M+",
    "击倒 ": "Knocked down ",
    "剪刀": "Scissors",
    "很遗憾，没有中奖 😢": "Sorry, no prize 😢",
    "拖动滑块匹配目标颜色！": "Drag the slider to match the target color!",
    "旋转中...": "Spinning...",
    "步数: ": "Steps: ",
    "游戏中...": "In game...",
    "点击 🎯 目标！": "Click 🎯 the target!",
    "点击小鸡抓住它们！": "Click chicks to catch them!",
    "点击数字移到空格位置！": "Click numbers to move to the blank!",
    "点击方块让它落下！": "Click blocks to drop them!",
    "点击泡泡戳破它们！": "Click bubbles to pop them!",
    "点击蓄力条释放滚球！": "Click the power bar to release the ball!",
    "点击让小鸟飞！": "Click to make the bird fly!",
    "点击释放套圈！": "Click to release the ring!",
    "点击飞碟射击！": "Click to shoot the saucer!",
    "点击！": "Click!",
    "点数: ": "Points: ",
    "猜大小": "Guess high/low",
    "猜骰子点数大小，最高 2 倍赔付": "Guess dice high/low, up to 2x payout",
    "目标颜色 ": "Target color ",
    "相差 ": "Difference ",
    "移动鼠标/手指控制挡板！": "Move mouse/finger to control the paddle!",
    "移动鼠标接水果！": "Move mouse to catch fruit!",
    "等待绿色...": "Wait for green...",
    "要牌还是停牌？": "Hit or stand?",
    "🎉 两个相同！获得 ": "🎉 Two match! Got ",
    "🎉🎉🎉 恭喜！三连大奖！获得 ": "🎉🎉🎉 Congrats! Triple win! Got ",
    "🎡 再转一次": "🎡 Spin again",
    "🎮 加载游戏中心...": "🎮 Loading game center...",
    "🎯 命中！+": "🎯 Hit! +",
    "🎯 套中了！+20": "🎯 Ringed! +20",
    "🎯 轮到你！按顺序点击": "🎯 Your turn! Click in order",
    "🎰 再来一次": "🎰 Try again",
    "🎳 球滚出... 力度 ": "🎳 Ball rolled... power ",
    "👀 注意看！": "👀 Watch closely!",
    "😢 庄家赢了，再试试": "😢 Dealer won, try again",
    "😢 输了（你出 ": "😢 Lost (you played ",
    "😢 输了，再试试": "😢 Lost, try again",
    "🤝 平局！退换赌注": "🤝 Draw! Bet returned",
    "🤝 平局，继续！": "🤝 Draw, continue!",
    "🤝 平局，退换赌注": "🤝 Draw, bet returned",
    "，电脑出 ": ", computer played ",
    "，获得 ": ", got ",
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
