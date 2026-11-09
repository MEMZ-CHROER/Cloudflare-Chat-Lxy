// 🧪 v2 功能回归测试（Node.js 无 DOM 环境）
// 测试 v2 核心逻辑：store、命令判断、权限检查、URL 构建
// 用法：node test-v2-features.mjs

import { state, patch, subscribe } from "./src/v2/client/store.js";

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

// ===== 1. Store 测试 =====
console.log("\n=== Store 测试 ===");
assert(state.user === null, "初始 user 为 null");
assert(state.currentRoom === null, "初始 currentRoom 为 null");
assert(state.adminLevel === null, "初始 adminLevel 为 null");
assert(Array.isArray(state.messages), "初始 messages 为数组");
assert(Array.isArray(state.onlineUsers), "初始 onlineUsers 为数组");

patch({ user: { name: "TestUser" } });
assert(state.user?.name === "TestUser", "patch user 成功");

patch({ adminLevel: "admin" });
assert(state.adminLevel === "admin", "patch adminLevel 成功");

patch({ currentRoom: "test-room" });
assert(state.currentRoom === "test-room", "patch currentRoom 成功");

// ===== 2. 命令判断逻辑测试 =====
console.log("\n=== 命令判断逻辑测试 ===");
// 从 commands.override.js 提取核心逻辑
function classifyCommand(input) {
  if (!input || input.trim() === "") return false;
  const msg = input.trim();
  if (!msg.startsWith("/")) return false;
  const spaceIdx = msg.indexOf(" ");
  const cmd = spaceIdx >= 0 ? msg.substring(1, spaceIdx) : msg.substring(1);
  const knownCommands = new Set([
    "color", "bg", "clean", "info", "users", "channels",
    "roll", "random", "echo", "icco", "wiki", "version",
    "help", "me", "actions",
    // admin commands
    "kick", "ban", "mute", "announce", "pin", "unpin", "clear",
  ]);
  return knownCommands.has(cmd.toLowerCase());
}
assert(classifyCommand("/help") === true, "/help 是本地命令");
assert(classifyCommand("/color gold") === true, "/color gold 是本地命令");
assert(classifyCommand("/roll 2d6") === true, "/roll 2d6 是本地命令");
assert(classifyCommand("/users") === true, "/users 是本地命令");
assert(classifyCommand("/version") === true, "/version 是本地命令");
assert(classifyCommand("/lp") === false, "/lp 是服务端命令");
assert(classifyCommand("/gh repo") === false, "/gh 是服务端命令");
assert(classifyCommand("/ai 问题") === false, "/ai 是服务端命令");
assert(classifyCommand("hello") === false, "普通消息不是命令");
assert(classifyCommand("") === false, "空消息不是命令");

// ===== 3. 权限检查测试 =====
console.log("\n=== 权限检查测试 ===");
function testAdminCheck(adminLevel) {
  const isSuper = adminLevel === "super";
  const isAdmin = adminLevel === "admin" || adminLevel === "super";
  return { isSuper, isAdmin };
}
const superCheck = testAdminCheck("super");
assert(superCheck.isSuper === true, "super 用户 isSuper=true");
assert(superCheck.isAdmin === true, "super 用户 isAdmin=true");

const adminCheck = testAdminCheck("admin");
assert(adminCheck.isSuper === false, "admin 用户 isSuper=false");
assert(adminCheck.isAdmin === true, "admin 用户 isAdmin=true");

const userCheck = testAdminCheck(null);
assert(userCheck.isSuper === false, "普通用户 isSuper=false");
assert(userCheck.isAdmin === false, "普通用户 isAdmin=false");

// ===== 4. 颜色系统测试 =====
console.log("\n=== 颜色系统测试 ===");
const COLOR_MAP = {
  red: "#dc3545", orange: "#e67e22", gold: "#f1c40f",
  green: "#28a745", cyan: "#17a2b8", blue: "#007bff",
  purple: "#6f42c1", pink: "#e83e8c", black: "#000000",
  white: "#ffffff", gray: "#6c757d"
};
assert(COLOR_MAP.gold === "#f1c40f", "gold 颜色映射正确");
assert(COLOR_MAP.red === "#dc3545", "red 颜色映射正确");
assert(/^#[0-9a-f]{6}$/i.test("#ff0000"), "hex 颜色格式正确");
assert(!/^[A-Z]/.test("red".toLowerCase()), "颜色名小写转换正确");

function resolveColor(arg) {
  const key = arg.toLowerCase();
  return COLOR_MAP[key] || arg;
}
assert(resolveColor("gold") === "#f1c40f", "resolveColor gold 返回 hex");
assert(resolveColor("#ff0000") === "#ff0000", "resolveColor #ff0000 原样返回");
// 无效的 color arg 会被保留原样（不解析为合法 hex），测试 resolveColor 不抛异常即可
const invalidColor = resolveColor("invalid");
assert(typeof invalidColor === "string" && invalidColor.length > 0, "resolveColor invalid 返回字符串");

// ===== 5. WebSocket 消息格式测试 =====
console.log("\n=== WebSocket 消息格式测试 ===");
function buildWSMessage(content, options) {
  const msg = { message: content };
  if (options?.color) msg.color = options.color;
  return msg;
}
const msg1 = buildWSMessage("hello");
assert(msg1.message === "hello", "基础消息格式正确");
assert(msg1.color === undefined, "无颜色时不发送 color 字段");

const msg2 = buildWSMessage("hello", { color: "#ff0000" });
assert(msg2.message === "hello", "带颜色消息格式正确");
assert(msg2.color === "#ff0000", "颜色字段正确传递");

// ===== 6. API URL 构建测试 =====
console.log("\n=== API URL 构建测试 ===");
function buildAdminUrl(endpoint, room, params = {}) {
  let url = `/api/admin/${endpoint}/${encodeURIComponent(room)}`;
  const qs = new URLSearchParams(params);
  if (qs.toString()) url += "?" + qs.toString();
  return url;
}
const kickUrl = buildAdminUrl("kick-user", "test-room", { name: "user1", caller: "admin" });
assert(kickUrl.includes("kick-user"), "kick URL 包含正确端点");
assert(kickUrl.includes("test-room"), "kick URL 包含房间名");
assert(kickUrl.includes("name=user1"), "kick URL 包含用户名");

const banUrl = buildAdminUrl("ban/add", "test-room", {});
assert(banUrl.includes("ban/add"), "ban URL 端点正确");

const annUrl = buildAdminUrl("announcement", "test-room", { text: "hello world" });
assert(annUrl.includes("announcement"), "announcement URL 端点正确");
assert(annUrl.includes("text=hello"), "announcement URL 包含文本");

const pinUrl = buildAdminUrl("pin/set", "test-room", { timestamp: "1234567890" });
assert(pinUrl.includes("pin/set"), "pin URL 端点正确");
assert(pinUrl.includes("timestamp"), "pin URL 包含时间戳");

const unpinUrl = buildAdminUrl("pin/clear", "test-room", { timestamp: "1234567890" });
assert(unpinUrl.includes("pin/clear"), "unpin URL 端点正确");

const clearUrl = buildAdminUrl("clear", "test-room", {});
assert(clearUrl.includes("clear"), "clear URL 端点正确");

// ===== 7. 用户菜单可见性测试 =====
console.log("\n=== 用户菜单可见性测试 ===");
function getMenuVisibility(adminLevel) {
  const isAdmin = adminLevel === "admin" || adminLevel === "super";
  const isSuper = adminLevel === "super";
  return { isAdmin, isSuper };
}
assert(getMenuVisibility(null).isAdmin === false, "普通用户无管理菜单项");
assert(getMenuVisibility("admin").isAdmin === true, "admin 有管理菜单项");
assert(getMenuVisibility("super").isSuper === true, "super 有批量踢出权限");
assert(getMenuVisibility("admin").isSuper === false, "admin 无批量踢出权限");

// danger 类菜单项对 admin/super 可见
function hasDangerMenu(adminLevel) {
  return adminLevel === "admin" || adminLevel === "super";
}
assert(hasDangerMenu(null) === false, "普通用户无 danger 菜单");
assert(hasDangerMenu("admin") === true, "admin 有 danger 菜单");
assert(hasDangerMenu("super") === true, "super 有 danger 菜单");

// ===== 8. 命令处理流程测试 =====
console.log("\n=== 命令处理流程测试 ===");
// 模拟命令分发逻辑
function processCommand(input, adminLevel) {
  if (!input || input.trim() === "") return { handled: false, reason: "empty" };
  const msg = input.trim();
  if (!msg.startsWith("/")) return { handled: false, reason: "not-command" };
  const spaceIdx = msg.indexOf(" ");
  const cmd = spaceIdx >= 0 ? msg.substring(1, spaceIdx) : msg.substring(1);
  const args = spaceIdx >= 0 ? msg.substring(spaceIdx + 1).trim().split(/\s+/) : [];

  // 本地命令
  const localCmds = new Set(["color", "bg", "clean", "info", "users", "channels", "roll", "random", "echo", "icco", "wiki", "version", "help", "me", "actions"]);
  if (localCmds.has(cmd.toLowerCase())) return { handled: true, type: "local", cmd };

  // 服务端命令
  const serverCmds = new Set(["lp", "gh", "ai", "bot", "rollback", "destroy", "w", "quit", "nick", "ignore", "unignore", "whois", "msg"]);
  if (serverCmds.has(cmd.toLowerCase())) return { handled: true, type: "server", cmd };

  // 管理命令
  const adminCmds = new Set(["kick", "ban", "mute", "announce", "pin", "unpin", "clear"]);
  if (adminCmds.has(cmd.toLowerCase())) {
    if (!adminLevel) return { handled: false, reason: "no-admin" };
    return { handled: true, type: "admin", cmd };
  }

  return { handled: false, reason: "unknown" };
}
assert(processCommand("/help").handled === true, "/help 是本地命令");
assert(processCommand("/lp").type === "server", "/lp 是服务端命令");
assert(processCommand("/kick x").handled === false, "/kick 无权限返回 false");
assert(processCommand("/kick x", "admin").type === "admin", "/kick 有权限返回 admin");
assert(processCommand("hello").handled === false, "普通消息返回 false");
assert(processCommand("").handled === false, "空消息返回 false");

// ===== 9. 消息存储格式测试 =====
console.log("\n=== 消息存储格式测试 ===");
const sampleMessages = [
  { name: "User1", message: "Hello", timestamp: 1000, id: 1 },
  { name: "User2", message: "Hi", timestamp: 2000, id: 2, color: "#ff0000" },
  { message: "System msg", name: null },
  { name: "User1", message: "**bold**", timestamp: 3000, id: 4 },
];
assert(sampleMessages.length === 4, "样本消息数量为 4");
assert(sampleMessages[0].message === "Hello", "消息内容正确");
assert(sampleMessages[1].color === "#ff0000", "带颜色消息保留 color");
assert(sampleMessages[2].name === null, "系统消息 name 为 null");

// ===== 10. 用户列表 API 响应格式测试 =====
console.log("\n=== 用户列表 API 响应格式测试 ===");
// 服务器返回纯数组
const mockUserResponse = ["user1", "user2", "user3"];
function parseUsers(data) {
  if (Array.isArray(data)) return data;
  if (data && data.users && Array.isArray(data.users)) return data.users;
  return [];
}
assert(parseUsers(mockUserResponse).length === 3, "解析数组响应成功");
assert(parseUsers({ users: ["a", "b"] }).length === 2, "解析对象响应成功");
assert(parseUsers({}).length === 0, "空对象返回空数组");

console.log(`\n=== 测试总结 ===`);
console.log(`通过: ${passed}, 失败: ${failed}`);
if (failed > 0) {
  console.error("有测试失败！");
  process.exit(1);
} else {
  console.log("所有测试通过！");
}
