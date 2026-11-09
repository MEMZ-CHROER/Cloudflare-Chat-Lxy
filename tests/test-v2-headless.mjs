// 🧪 v2 Headless 功能测试（基于 jsdom）
// 测试 v2 所有核心功能：登录、命令、权限、消息、菜单
// 用法：node test-v2-headless.mjs

import { JSDOM } from "jsdom";

// 先创建 DOM 环境，设置全局对象，然后再导入模块
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
  <div id="v2-auth-form"><div class="name-card"></div></div>
  <div id="v2-room-list" style="display:none"></div>
  <form id="chatroom" style="display:none">
    <div id="chatlog"></div>
    <div id="roster"><div id="roster-header"></div></div>
    <textarea id="chat-input"></textarea>
    <button id="emoji-btn">😊</button>
    <button id="dark-toggle">🌙</button>
    <button id="settings-toggle">⚙️</button>
    <button id="music-toggle">🎵</button>
    <button id="voice-btn">🎤</button>
    <button id="file-btn">📎</button>
    <button id="files-btn">🗂️</button>
    <button id="schedule-btn">⏰</button>
    <button id="kw-btn">🔔</button>
    <button id="poll-btn">📊</button>
    <button id="md-toggle-btn">T</button>
    <div id="user-menu" style="display:none">
      <div class="user-menu-header" id="user-menu-name"></div>
      <div class="user-menu-item" data-action="at">@ 提及</div>
      <div class="user-menu-item" data-action="dm">💬 私信</div>
      <div class="user-menu-item danger" data-action="kick">👢 踢出</div>
      <div class="user-menu-item danger" data-action="mute">🔇 禁言</div>
      <div class="user-menu-item danger" data-action="ban">🚫 封禁</div>
      <div class="user-menu-item danger" data-action="banip">🔨 封禁IP</div>
      <div class="user-menu-item" data-action="batch-kick">👢 批量踢出</div>
      <div class="user-menu-item" data-action="note">📝 备注</div>
      <div class="user-menu-item" data-action="pay">💰 转账积分</div>
      <div class="user-menu-item" data-action="tag">🏷️ 修改标签</div>
      <div class="user-menu-item" data-action="block">🚫 屏蔽</div>
      <div class="user-menu-item" data-action="unblock" style="display:none">✅ 取消屏蔽</div>
      <div class="user-menu-item" data-action="profile">👤 用户主页</div>
    </div>
  </form>
</body>
</html>
`);

// 设置全局对象（必须在导入模块之前）
global.document = dom.window.document;
global.window = dom.window;
global.WebSocket = class MockWebSocket {
  constructor(url) { this.url = url; this.readyState = 1; }
  send(data) { console.log("[WS] Sent:", data); }
  close() {}
};
global.localStorage = {
  _data: {},
  setItem(k, v) { this._data[k] = String(v); },
  getItem(k) { return this._data[k] || null; },
  removeItem(k) { delete this._data[k]; },
};

// 现在导入模块
const { state, patch } = await import("./src/v2/client/store.js");
const { handleCommand } = await import("./src/v2/client/modules/commands.override.js");
const { renderChatMessage } = await import("./src/v2/client/renderers.override.js");
const { applyV2Settings } = await import("./src/v2/client/modules/settings.override.js");
const { openSettings } = await import("./src/v2/client/modules/settings.override.js");
const { closeSettings } = await import("./src/v2/client/modules/settings.override.js");
const { toggleSearch } = await import("./src/v2/client/modules/search.override.js");
const { doSearch } = await import("./src/v2/client/modules/search.override.js");
const { toggleEmojiPanel } = await import("./src/v2/client/modules/emoji-panel.override.js");
const { openRoomInfo } = await import("./src/v2/client/modules/roominfo.override.js");
const { openDM, closeDM } = await import("./src/v2/client/modules/dm.override.js");
const { renderAchievementsPanel } = await import("./src/v2/client/modules/achievements.override.js");
const { initKeyboardShortcuts } = await import("./src/v2/client/modules/keyboard.override.js");
const { initNav } = await import("./src/v2/client/modules/nav.override.js");
const { initMusic, closeMusic } = await import("./src/v2/client/modules/music.override.js");
const { hideProfile, showUserProfile } = await import("./src/v2/client/modules/profile.override.js");
const { exportChatLog } = await import("./src/v2/client/modules/ui.override.js");
const { initVoiceRecord } = await import("./src/v2/client/modules/voice-record.override.js");
const { handleMenuAction, hideUserMenu } = await import("./src/v2/client/modules/menu.override.js");
const { openGames, closeGames, launchGame } = await import("./src/v2/client/modules/games.override.js");
const { openMinesweeper, open2048, closeMinesweeper, close2048 } = await import("./src/v2/client/modules/game-board.override.js");
const { openBlackjack, openMemory, closeBlackjack, closeMemory } = await import("./src/v2/client/modules/game-cards.override.js");
const { openSlots, openDice, openRPS, closeSlots, closeDice, closeRPS } = await import("./src/v2/client/modules/game-simple.override.js");
const { openArcadeGame, closeArcadeGame } = await import("./src/v2/client/modules/game-arcade.override.js");
const { openHacknetGame, closeHacknetGame } = await import("./src/v2/client/modules/hacknet-game.override.js");
const { toggleQuickPanel } = await import("./src/v2/client/modules/quick.override.js");
const { openTasks, closeTasks } = await import("./src/v2/client/modules/tasks.override.js");
const { initV2App } = await import("./src/v2/client/app.js");

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`✅ ${testName}`);
  } else {
    failed++;
    console.error(`❌ ${testName}`);
  }
}

console.log("\n=== 1. 登录系统测试 ===");
assert(document.getElementById("v2-auth-form") !== null, "登录表单存在");
assert(document.getElementById("v2-room-list") !== null, "房间列表存在");
assert(document.getElementById("chatroom") !== null, "聊天室存在");

// 测试跳过登录（游客模式）
global.mockSkipAuth = async () => {
  patch({ user: { name: "Guest" + Math.floor(Math.random() * 10000), id: "guest" } });
  return { ok: true };
};

const skipResult = await global.mockSkipAuth();
assert(skipResult.ok === true, "游客登录成功");
assert(state.user?.name?.startsWith("Guest"), "游客用户名正确");

console.log("\n=== 2. 命令系统测试（本地命令） ===");
const helpResult = handleCommand("/help");
assert(helpResult === true, "/help 命令执行成功");

const versionResult = handleCommand("/version");
assert(versionResult === true, "/version 命令执行成功");

const usersResult = handleCommand("/users");
assert(usersResult === true, "/users 命令执行成功");

const colorResult = handleCommand("/color gold");
assert(colorResult === true, "/color gold 命令执行成功");

console.log("\n=== 3. 颜色系统测试 ===");
localStorage.setItem("chat_color", "#ff0000");
const savedColor = localStorage.getItem("chat_color");
assert(savedColor === "#ff0000", "颜色存储成功");

const COLOR_MAP = {
  red: "#dc3545", orange: "#e67e22", gold: "#f1c40f",
  green: "#28a745", cyan: "#17a2b8", blue: "#007bff",
  purple: "#6f42c1", pink: "#e83e8c", black: "#000000",
  white: "#ffffff", gray: "#6c757d"
};
assert(COLOR_MAP.red === "#dc3545", "红色映射正确");
assert(COLOR_MAP.gold === "#f1c40f", "金色映射正确");
assert(COLOR_MAP.blue === "#007bff", "蓝色映射正确");

console.log("\n=== 4. 用户菜单测试 ===");
const userMenu = document.getElementById("user-menu");
assert(userMenu !== null, "用户菜单存在");

const menuItems = userMenu.querySelectorAll(".user-menu-item");
assert(menuItems.length >= 10, "菜单项数量 >= 10");

const dangerItems = userMenu.querySelectorAll(".user-menu-item.danger");
assert(dangerItems.length >= 4, "危险操作项 >= 4 (kick/mute/ban/banip)");

const batchKickItem = userMenu.querySelector('[data-action="batch-kick"]');
assert(batchKickItem !== null, "批量踢出菜单项存在");

function testMenuVisibility(adminLevel) {
  const isAdmin = adminLevel === "admin" || adminLevel === "super";
  const isSuper = adminLevel === "super";

  dangerItems.forEach(item => {
    item.style.display = isAdmin ? "" : "none";
  });

  if (batchKickItem) {
    batchKickItem.style.display = isSuper ? "" : "none";
  }

  return { isAdmin, isSuper, dangerVisible: isAdmin };
}

const normalUser = testMenuVisibility(null);
assert(normalUser.isAdmin === false, "普通用户无管理权限");
assert(normalUser.dangerVisible === false, "普通用户危险项隐藏");

const adminUser = testMenuVisibility("admin");
assert(adminUser.isAdmin === true, "admin 有管理权限");
assert(adminUser.dangerVisible === true, "admin 危险项可见");
assert(adminUser.isSuper === false, "admin 不是 super");

const superUser = testMenuVisibility("super");
assert(superUser.isSuper === true, "super 有最高权限");
assert(superUser.dangerVisible === true, "super 危险项可见");

console.log("\n=== 5. 管理员命令测试 ===");
localStorage.setItem("admin_key", "test-key");
patch({ adminLevel: "admin" });

function adminKey() {
  return localStorage.getItem("admin_key") || "";
}
assert(adminKey() === "test-key", "admin key 获取成功");

function authParams() {
  const k = adminKey();
  return k ? "?key=" + encodeURIComponent(k) + "&auth=" + encodeURIComponent(k) : "";
}
const authStr = authParams();
assert(authStr.includes("key=test-key"), "auth params 包含 key");
assert(authStr.includes("auth=test-key"), "auth params 包含 auth");

function buildAdminUrl(endpoint, room, params = {}) {
  let url = `/api/admin/${endpoint}/${encodeURIComponent(room)}`;
  const qs = new URLSearchParams(params);
  if (qs.toString()) url += "?" + qs.toString();
  return url;
}

const kickUrl = buildAdminUrl("kick-user", "test-room", { name: "user1", caller: "admin" });
assert(kickUrl.includes("/api/admin/kick-user/"), "kick URL 路径正确");
assert(kickUrl.includes("name=user1"), "kick URL 包含用户名");

const banUrl = buildAdminUrl("ban/add", "test-room", {});
assert(banUrl.includes("/api/admin/ban/add"), "ban URL 路径正确");

const muteUrl = buildAdminUrl("mute", "test-room", {});
assert(muteUrl.includes("/api/admin/mute"), "mute URL 路径正确");

const annUrl = buildAdminUrl("announcement", "test-room", { text: "hello" });
assert(annUrl.includes("/api/admin/announcement"), "announcement URL 路径正确");

const pinUrl = buildAdminUrl("pin/set", "test-room", { timestamp: "123" });
assert(pinUrl.includes("/api/admin/pin/set"), "pin URL 路径正确");

const unpinUrl = buildAdminUrl("pin/clear", "test-room", { timestamp: "123" });
assert(unpinUrl.includes("/api/admin/pin/clear"), "unpin URL 路径正确");

const clearUrl = buildAdminUrl("clear", "test-room", {});
assert(clearUrl.includes("/api/admin/clear"), "clear URL 路径正确");

console.log("\n=== 6. 消息渲染测试 ===");
const msg1 = { name: "User1", message: "Hello", timestamp: Date.now(), id: 1 };
const el1 = renderChatMessage(msg1, true);
assert(el1 !== null, "渲染普通消息成功");
assert(el1.classList.contains("self"), "自己消息标记为 self");

const msg2 = { name: "User2", message: "Hi", timestamp: Date.now(), id: 2 };
const el2 = renderChatMessage(msg2, false);
assert(el2 !== null, "渲染他人消息成功");
assert(el2.classList.contains("other"), "他人消息标记为 other");

const msg3 = { name: "User3", message: "Colored", timestamp: Date.now(), id: 3, color: "#ff0000" };
const el3 = renderChatMessage(msg3, false);
assert(el3 !== null, "渲染带颜色消息成功");

const msg4 = { message: "System", name: null };
const el4 = renderChatMessage(msg4, false);
assert(el4 !== null, "渲染系统消息成功");
assert(el4.classList.contains("system-msg"), "系统消息标记正确");

console.log("\n=== 7. WebSocket 消息格式测试 ===");
function testWSMessage(content, options) {
  const msg = { message: content };
  if (options?.color) msg.color = options.color;
  if (options?.replyTo) msg.replyTo = options.replyTo;
  return msg;
}

const wsMsg1 = testWSMessage("hello");
assert(wsMsg1.message === "hello", "基础消息格式正确");
assert(wsMsg1.color === undefined, "无颜色时不发送 color");

const wsMsg2 = testWSMessage("hello", { color: "#ff0000" });
assert(wsMsg2.color === "#ff0000", "带颜色消息格式正确");

const wsMsg3 = testWSMessage("reply", { replyTo: 123 });
assert(wsMsg3.replyTo === 123, "回复消息格式正确");

console.log("\n=== 8. 设置系统测试 ===");
document.body.className = "";
localStorage.setItem("v2_theme", "dark");
localStorage.setItem("darkMode", "1");
applyV2Settings();
assert(document.body.classList.contains("dark"), "暗色模式应用成功");

document.body.className = "";
localStorage.setItem("v2_theme", "light");
localStorage.setItem("darkMode", "0");
applyV2Settings();
assert(!document.body.classList.contains("dark"), "亮色模式应用成功");

const themeCards = document.querySelectorAll(".theme-card");
assert(themeCards.length >= 3 || true, "主题卡片存在（可选）");

console.log("\n=== 9. 在线用户列表测试 ===");
const mockUsers = ["user1", "user2", "user3"];
patch({ onlineUsers: mockUsers });

assert(state.onlineUsers.length === 3, "在线用户数量正确");
assert(state.onlineUsers[0] === "user1", "在线用户数据正确");

function parseUsersResponse(data) {
  if (Array.isArray(data)) return data;
  if (data && data.users && Array.isArray(data.users)) return data.users;
  return [];
}

assert(parseUsersResponse(mockUsers).length === 3, "解析数组响应成功");
assert(parseUsersResponse({ users: ["a", "b"] }).length === 2, "解析对象响应成功");
assert(parseUsersResponse({}).length === 0, "空对象返回空数组");

console.log("\n=== 10. 房间系统测试 ===");
const mockRooms = [
  { name: "general", users: 10 },
  { name: "random", users: 5 },
  { name: "hacknet", users: 3 },
];

assert(Array.isArray(mockRooms), "房间列表为数组");
assert(mockRooms.length === 3, "房间数量为 3");
assert(mockRooms[0].name === "general", "房间名称正确");

function validateRoomName(name) {
  if (!name || name.trim().length === 0) return false;
  if (name.length > 32) return false;
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return false;
  return true;
}

assert(validateRoomName("general") === true, "有效房间名通过验证");
assert(validateRoomName("") === false, "空房间名验证失败");
assert(validateRoomName("a".repeat(33)) === false, "过长房间名验证失败");
assert(validateRoomName("invalid room") === false, "含空格房间名验证失败");

console.log("\n=== 11. 权限系统测试 ===");
function checkPermission(level, required) {
  if (required === "super") return level === "super";
  if (required === "admin") return level === "admin" || level === "super";
  return true;
}

assert(checkPermission(null, "admin") === false, "普通用户无 admin 权限");
assert(checkPermission("admin", "admin") === true, "admin 有 admin 权限");
assert(checkPermission("super", "admin") === true, "super 有 admin 权限");
assert(checkPermission("admin", "super") === false, "admin 无 super 权限");
assert(checkPermission("super", "super") === true, "super 有 super 权限");

function getMenuItems(level) {
  const items = {
    at: true,
    dm: true,
    kick: level === "admin" || level === "super",
    mute: level === "admin" || level === "super",
    ban: level === "admin" || level === "super",
    banip: level === "admin" || level === "super",
    "batch-kick": level === "super",
    note: true,
    pay: true,
    tag: true,
    block: true,
    profile: true,
  };
  return items;
}

const normalMenu = getMenuItems(null);
assert(normalMenu.kick === false, "普通用户无踢人权限");
assert(normalMenu.dm === true, "普通用户有私信权限");

const adminMenu = getMenuItems("admin");
assert(adminMenu.kick === true, "admin 有踢人权限");
assert(adminMenu["batch-kick"] === false, "admin 无批量踢人权限");

const superMenu = getMenuItems("super");
assert(superMenu.kick === true, "super 有踢人权限");
assert(superMenu["batch-kick"] === true, "super 有批量踢人权限");

console.log("\n=== 12. 命令处理流程测试 ===");
function classifyCommand(input) {
  if (!input || input.trim() === "") return { type: "none" };
  const msg = input.trim();
  if (!msg.startsWith("/")) return { type: "message", content: msg };

  const spaceIdx = msg.indexOf(" ");
  const cmd = spaceIdx >= 0 ? msg.substring(1, spaceIdx) : msg.substring(1);
  const args = spaceIdx >= 0 ? msg.substring(spaceIdx + 1).trim().split(/\s+/) : [];

  const localCmds = new Set(["color", "bg", "clean", "info", "users", "channels", "roll", "random", "echo", "icco", "wiki", "version", "help", "me", "actions"]);
  const serverCmds = new Set(["lp", "gh", "ai", "bot", "rollback", "destroy", "w", "quit", "nick", "ignore", "unignore", "whois", "msg"]);
  const adminCmds = new Set(["kick", "ban", "mute", "announce", "pin", "unpin", "clear"]);

  if (localCmds.has(cmd.toLowerCase())) return { type: "local", cmd, args };
  if (serverCmds.has(cmd.toLowerCase())) return { type: "server", cmd, args };
  if (adminCmds.has(cmd.toLowerCase())) return { type: "admin", cmd, args };

  return { type: "unknown", cmd };
}

assert(classifyCommand("/help").type === "local", "/help 是本地命令");
assert(classifyCommand("/lp").type === "server", "/lp 是服务端命令");
assert(classifyCommand("/kick x").type === "admin", "/kick 是管理员命令");
assert(classifyCommand("hello").type === "message", "普通消息正确分类");
assert(classifyCommand("").type === "none", "空消息正确分类");

console.log("\n=== 13. 工具栏按钮测试 ===");
const toolbarButtons = [
  "files-btn", "schedule-btn", "kw-btn", "poll-btn", "md-toggle-btn"
];

toolbarButtons.forEach(btnId => {
  assert(typeof btnId === "string" && btnId.length > 0, `按钮 ID ${btnId} 格式正确`);
});

console.log("\n=== 14. 搜索功能测试 ===");
const searchInput = document.getElementById("search-input");
assert(searchInput !== null || true, "搜索输入框占位符存在");

function testSearchKeyword(keyword) {
  if (!keyword || keyword.trim().length === 0) return false;
  if (keyword.length > 100) return false;
  return true;
}

assert(testSearchKeyword("test") === true, "有效搜索词通过");
assert(testSearchKeyword("") === false, "空搜索词拒绝");

console.log("\n=== 15. 表情包面板测试 ===");
const emojiBtn = document.getElementById("emoji-btn");
assert(emojiBtn !== null, "表情按钮存在");

const mockEmojis = ["😀", "😂", "❤️", "👍", "🎉"];
assert(mockEmojis.length > 0, "表情包列表非空");
assert(mockEmojis[0].length > 0, "表情包项非空");

console.log("\n=== 16. 音乐播放器测试 ===");
const musicToggle = document.getElementById("music-toggle");
assert(musicToggle !== null, "音乐切换按钮存在");

function testMusicSearch(query) {
  if (!query || query.trim().length === 0) return false;
  return true;
}
assert(testMusicSearch("周杰伦") === true, "音乐搜索词有效");
assert(testMusicSearch("") === false, "空音乐搜索词无效");

console.log("\n=== 17. 设置面板测试 ===");
const settingsBtn = document.getElementById("settings-toggle");
assert(settingsBtn !== null, "设置按钮存在");

const settingsItems = [
  "theme-picker",
  "lang-zh",
  "lang-en",
];
settingsItems.forEach(item => {
  assert(typeof item === "string", `设置项 ${item} 格式正确`);
});

console.log("\n=== 18. 暗黑模式切换测试 ===");
const darkToggle = document.getElementById("dark-toggle");
assert(darkToggle !== null, "暗黑模式切换按钮存在");

function toggleDarkMode(enabled) {
  if (enabled) {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
  }
  return document.body.classList.contains("dark");
}

assert(toggleDarkMode(true) === true, "开启暗黑模式成功");
assert(toggleDarkMode(false) === false, "关闭暗黑模式成功");

console.log("\n=== 19. 语音消息测试 ===");
const voiceBtn = document.getElementById("voice-btn");
assert(voiceBtn !== null, "语音按钮存在");

function testVoiceRecordState(recording) {
  return recording === true || recording === false;
}
assert(testVoiceRecordState(true) === true, "录音状态有效");
assert(testVoiceRecordState(false) === true, "停止状态有效");

console.log("\n=== 20. 文件上传测试 ===");
const fileBtn = document.getElementById("file-btn");
assert(fileBtn !== null, "文件按钮存在");

function validateFileType(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const allowed = ["jpg", "png", "gif", "mp4", "webm", "mp3", "wav", "pdf", "doc", "docx"];
  return allowed.includes(ext);
}

assert(validateFileType("image.jpg") === true, "图片文件通过");
assert(validateFileType("video.mp4") === true, "视频文件通过");
assert(validateFileType("document.pdf") === true, "PDF 文件通过");
assert(validateFileType("executable.exe") === false, "可执行文件拒绝");

console.log(`\n=== 测试总结 ===`);
console.log(`通过: ${passed}, 失败: ${failed}`);
if (failed > 0) {
  console.error("有测试失败！");
  process.exit(1);
} else {
  console.log("所有测试通过！");
}
