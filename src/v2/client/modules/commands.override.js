// v2 commands override — local + server-command dispatch
import { state } from "../store.js";
import { addSystemMessage } from "../chat.js";

const COLOR_MAP = {
  red: "#dc3545", orange: "#e67e22", gold: "#f1c40f",
  green: "#28a745", cyan: "#17a2b8", blue: "#007bff",
  purple: "#6f42c1", pink: "#e83e8c", black: "#000000",
  white: "#ffffff", gray: "#6c757d"
};

const COMMANDS = {
  help:       { desc: "显示帮助",               exec: showHelp },
  color:      { desc: "设置消息字体颜色",        exec: setColor,    args: ["颜色名/#hex"] },
  bg:         { desc: "设置房间背景",            exec: setBackground, args: ["颜色/#hex/url 或 clear"] },
  clean:      { desc: "清除本地聊天记录",         exec: cleanLocal },
  info:       { desc: "房间信息",                exec: showRoomInfo },
  users:      { desc: "在线用户列表",            exec: listUsers },
  channels:   { desc: "查看频道列表",            exec: listChannels },
  version:    { desc: "显示版本",                exec: showVersion },
  roll:       { desc: "掷骰子",                  exec: rollDice,    args: ["[n]d[sides]"] },
  random:     { desc: "随机数",                  exec: randomNum,   args: ["min max"] },
  echo:       { desc: "回显消息（调试）",         exec: echo,        args: ["文本"] },
  icco:       { desc: "ICCO入侵警告动画",         exec: triggerIcco },
  wiki:       { desc: "搜索维基百科",             exec: wikiSearch,  args: ["关键词"] },
  announce:   { desc: "发布公告（管理员）",        exec: announceAdmin },
  pin:        { desc: "置顶最后一条消息",         exec: pinMessage },
  unpin:      { desc: "取消置顶",                exec: unpinMessage },
  clear:      { desc: "清空房间（超管）",         exec: clearRoom },
  kick:       { desc: "踢出用户（管理员）",        exec: kickUser,    args: ["用户名"] },
  ban:        { desc: "封禁用户（管理员）",        exec: banUser,     args: ["用户名"] },
  mute:       { desc: "禁言用户（管理员）",        exec: muteUser,    args: ["用户名 [时长]"] },
};

export function handleCommand(text) {
  if (!text.startsWith("/")) return false;
  const parts = text.slice(1).split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);
  const command = COMMANDS[cmd];
  if (!command) return false;
  try {
    command.exec(args);
    return true;
  } catch (e) {
    showLocalMessage("错误: " + e.message);
    return true;
  }
}

function showLocalMessage(text) {
  addSystemMessage(text);
}

function adminKey() {
  return localStorage.getItem("admin_key") || "";
}

function authParams() {
  const k = adminKey();
  return k ? "?key=" + encodeURIComponent(k) + "&auth=" + encodeURIComponent(k) : "";
}

function showHelp() {
  const lines = Object.entries(COMMANDS).map(function(entry) {
    var cmd = entry[0], info = entry[1];
    var args = info.args ? " " + info.args.join(" ") : "";
    return "  /" + cmd + args + " — " + info.desc;
  });
  showLocalMessage("可用命令:\n" + lines.join("\n"));
}

function setColor(args) {
  const arg = args[0] ? args[0].trim() : "";
  const key = "chat_color";
  if (!arg) {
    const current = localStorage.getItem(key) || "#000000";
    showLocalMessage("当前颜色: " + current + "（支持: red/orange/gold/green/cyan/blue/purple/pink/black/white/gray 或 #hex）");
    return;
  }
  let newColor = COLOR_MAP[arg.toLowerCase()] || arg;
  if (!/^#[0-9a-f]{6}$/i.test(newColor)) {
    showLocalMessage("无效颜色，可用: red/orange/gold/green/cyan/blue/purple/pink/black/white/gray 或 #hex");
    return;
  }
  localStorage.setItem(key, newColor);
  showLocalMessage("颜色已设置为 " + arg);
}

function setBackground(args) {
  const room = state.currentRoom;
  const key = "chat_bg_" + room;
  const arg = args.join(" ").trim();
  if (!arg) {
    showLocalMessage("当前背景: " + (localStorage.getItem(key) || "默认"));
    return;
  }
  if (arg === "清除" || arg === "reset" || arg === "default") {
    localStorage.removeItem(key);
    applyRoomBackground(room);
    showLocalMessage("已清除房间背景");
    return;
  }
  localStorage.setItem(key, arg);
  applyRoomBackground(room);
  showLocalMessage("已设置房间背景: " + arg);
}

function applyRoomBackground(room) {
  const bg = localStorage.getItem("chat_bg_" + room);
  const chatroom = document.getElementById("chatroom");
  if (bg && chatroom) {
    if (bg.startsWith("#") || bg.startsWith("rgb") || bg.startsWith("url")) {
      chatroom.style.background = bg;
    } else {
      chatroom.style.backgroundImage = "url(" + bg + ")";
      chatroom.style.backgroundSize = "cover";
    }
  } else if (chatroom) {
    chatroom.style.background = "";
    chatroom.style.backgroundImage = "";
  }
}

function cleanLocal() {
  const chatlog = document.getElementById("chatlog");
  if (chatlog) {
    chatlog.querySelectorAll(".chat-msg, .system-msg").forEach(el => el.remove());
    showLocalMessage("本地聊天记录已清除");
  }
}

function showRoomInfo() {
  const count = state.onlineUsers ? state.onlineUsers.length : 0;
  showLocalMessage("房间: " + state.currentRoom + " | 在线: " + count + " | 频道: " + ((state.channels || []).map(function(c) { return c.name; }).join(", ")));
}

function listUsers() {
  // 从 WebSocket 状态显示；如果为空则尝试重新获取
  const users = (state.onlineUsers || []);
  if (users.length === 0) {
    showLocalMessage("在线用户: （连接中...）");
    fetch("/api/room/" + encodeURIComponent(state.currentRoom) + "/users")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          patch({ onlineUsers: data });
          showLocalMessage("在线用户: " + (data.join(", ") || "无"));
        }
      })
      .catch(e => showLocalMessage("获取用户列表失败: " + e.message));
  } else {
    showLocalMessage("在线用户: " + (users.join(", ") || "无"));
  }
}

function listChannels() {
  const chs = (state.channels || []).map(function(c) { return "#" + c.name + " (" + c.type + ")"; }).join(", ");
  showLocalMessage("频道: " + (chs || "无"));
}

function showVersion() {
  showLocalMessage("CloudChat v2.4.3 — Dual Worker Architecture");
}

function rollDice(args) {
  const match = (args[0] || "1d6").match(/(\d+)d(\d+)/);
  if (!match) throw new Error("用法: /roll [次数]d[面数]，如 /roll 2d6");
  const count = parseInt(match[1]);
  const sides = parseInt(match[2]);
  let total = 0;
  const rolls = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(Math.random() * sides) + 1;
    rolls.push(r);
    total += r;
  }
  showLocalMessage("掷骰子 " + count + "d" + sides + ": [" + rolls.join(",") + "] = " + total);
}

function randomNum(args) {
  const min = parseInt(args[0]) || 1;
  const max = parseInt(args[1]) || 100;
  const result = Math.floor(Math.random() * (max - min + 1)) + min;
  showLocalMessage("随机数(" + min + "-" + max + "): " + result);
}

function echo(args) {
  showLocalMessage("Echo: " + args.join(" "));
}

function triggerIcco() {
  window.__v2_triggerIcco?.();
}

function wikiSearch(args) {
  const query = args.join(" ");
  if (!query) throw new Error("请提供搜索关键词");
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: "wiki", query: query }));
  }
}

function announceAdmin(args) {
  const text = args.join(" ");
  if (!text) throw new Error("请提供公告内容");
  const k = adminKey();
  if (!k) { showLocalMessage("* 请先登录管理后台才能发布公告"); return; }
  fetch("/api/admin/announcement/" + encodeURIComponent(state.currentRoom) + authParams() + "&text=" + encodeURIComponent(text))
    .then(r => r.text())
    .then(t => showLocalMessage("* " + t))
    .catch(e => showLocalMessage("操作失败: " + e.message));
}

function pinMessage() {
  const msgList = document.getElementById("chatlog");
  const lastMsg = msgList ? msgList.querySelector(".chat-msg") : null;
  if (!lastMsg) throw new Error("没有可置顶的消息");
  const ts = lastMsg.dataset.timestamp;
  if (!ts) throw new Error("无法获取消息时间戳");
  const k = adminKey();
  if (!k) { showLocalMessage("* 请先登录管理后台才能置顶消息"); return; }
  fetch("/api/admin/pin/set/" + encodeURIComponent(state.currentRoom) + authParams() + "&timestamp=" + encodeURIComponent(ts))
    .then(r => r.text())
    .then(t => showLocalMessage("* " + t))
    .catch(e => showLocalMessage("操作失败: " + e.message));
}

function unpinMessage() {
  const k = adminKey();
  if (!k) { showLocalMessage("* 请先登录管理后台才能取消置顶"); return; }
  fetch("/api/admin/pin/get/" + encodeURIComponent(state.currentRoom) + authParams())
    .then(r => r.json())
    .then(data => {
      const pinned = data.pinned || {};
      const general = pinned.general;
      if (!general || !general.timestamp) throw new Error("当前没有置顶消息");
      return fetch("/api/admin/pin/clear/" + encodeURIComponent(state.currentRoom) + authParams() + "&timestamp=" + encodeURIComponent(general.timestamp))
        .then(r2 => r2.text())
        .then(t => showLocalMessage("* " + t));
    })
    .catch(e => showLocalMessage(e.message || "操作失败: " + e.message));
}

function clearRoom() {
  const k = adminKey();
  if (!k) { showLocalMessage("* 请先登录管理后台才能清空房间"); return; }
  if (!confirm("确定清空 " + state.currentRoom + " 的聊天记录吗？")) return;
  fetch("/api/admin/clear-room/" + encodeURIComponent(state.currentRoom) + authParams())
    .then(r => r.text())
    .then(t => { showLocalMessage("* " + t + " 即将刷新聊天室..."); setTimeout(() => location.reload(), 500); })
    .catch(e => showLocalMessage("操作失败: " + e.message));
}

function kickUser(args) {
  const userName = args[0];
  if (!userName) throw new Error("用法: /kick <用户名>");
  const k = adminKey();
  if (!k) { showLocalMessage("* 请先登录管理后台"); return; }
  fetch("/api/admin/kick-user/" + encodeURIComponent(state.currentRoom) + authParams() + "&name=" + encodeURIComponent(userName) + "&caller=" + encodeURIComponent(state.user?.name || ""))
    .then(r => r.text())
    .then(t => showLocalMessage("* " + t))
    .catch(e => showLocalMessage("操作失败: " + e.message));
}

function banUser(args) {
  const userName = args[0];
  if (!userName) throw new Error("用法: /ban <用户名>");
  const k = adminKey();
  if (!k) { showLocalMessage("* 请先登录管理后台"); return; }
  fetch("/api/admin/ban/add?" + authParams() + "&name=" + encodeURIComponent(userName))
    .then(r => r.text())
    .then(t => showLocalMessage("* " + t))
    .catch(e => showLocalMessage("操作失败: " + e.message));
}

function muteUser(args) {
  const userName = args[0];
  if (!userName) throw new Error("用法: /mute <用户名> [时长]");
  const k = adminKey();
  if (!k) { showLocalMessage("* 请先登录管理后台"); return; }
  const duration = args[1] || "0";
  fetch("/api/admin/mute?" + authParams(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: userName, duration: parseInt(duration) || 0 })
  })
    .then(r => r.text())
    .then(t => showLocalMessage("* " + t))
    .catch(e => showLocalMessage("操作失败: " + e.message));
}

window.__v2_handleCommand = handleCommand;
