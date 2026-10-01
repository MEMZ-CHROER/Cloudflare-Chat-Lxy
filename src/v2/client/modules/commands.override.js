// v2 commands override — /command handler for v2 chat
import { state } from "../store.js";
import { addSystemMessage } from "../chat.js";

const COMMANDS = {
  help: { desc: "显示帮助", exec: showHelp },
  nick: { desc: "修改昵称", exec: changeNick, args: ["新名字"] },
  tag: { desc: "设置标签", args: ["标签名 [颜色]"], exec: changeTag },
  color: { desc: "设置消息颜色", args: ["颜色名"], exec: changeColor },
  channels: { desc: "查看频道列表", exec: listChannels },
  pin: { desc: "置顶当前消息", exec: pinMessage },
  unpin: { desc: "取消置顶", exec: unpinMessage },
  clear: { desc: "清空当前频道消息（管理员）", exec: clearChannel },
  info: { desc: "房间信息", exec: showRoomInfo },
  users: { desc: "在线用户列表", exec: listUsers },
  kick: { desc: "踢出用户（管理员）", args: ["用户名"], exec: kickUser },
  ban: { desc: "封禁用户（管理员）", args: ["用户名"], exec: banUser },
  mute: { desc: "禁言用户（管理员）", args: ["用户名 [时长]"], exec: muteUser },
  announce: { desc: "发布公告（管理员）", args: ["公告内容"], exec: announce },
  version: { desc: "显示版本", exec: showVersion },
  echo: { desc: "回显消息（调试）", args: ["文本"], exec: echo },
  random: { desc: "随机数", args: ["min max"], exec: randomNum },
  roll: { desc: "掷骰子", args: ["[次数]d[面数]"], exec: rollDice },
  icco: { desc: "ICCO入侵警告动画", exec: triggerIcco },

  wiki: { desc: "搜索维基百科", args: ["关键词"], exec: wikiSearch },
};

export function handleCommand(text) {
  if (!text.startsWith("/")) return false;

  const parts = text.slice(1).split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  const command = COMMANDS[cmd];
  if (!command) {
    showLocalMessage("未知命令: /" + cmd + "，输入 /help 查看帮助");
    return true;
  }

  try {
    command.exec(args);
    return true;
  } catch (e) {
    showLocalMessage("命令执行错误: " + e.message);
    return true;
  }
}

// 仅本地显示，不发送到服务端（避免被当作普通消息处理）
function showLocalMessage(text) {
  addSystemMessage(text);
}

function sendCommand(type, data) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(Object.assign({ type: type }, data)));
  }
}

function showHelp() {
  const lines = Object.entries(COMMANDS).map(function(entry) {
    var cmd = entry[0], info = entry[1];
    var args = info.args ? " " + info.args.join(" ") : "";
    return "  /" + cmd + args + " — " + info.desc;
  });
  showLocalMessage("可用命令:\n" + lines.join("\n"));
}

function changeNick(args) {
  const name = args[0] ? args[0].trim() : "";
  if (!name) throw new Error("请提供新名字");
  sendCommand("rename", { name: name });
}

function changeTag(args) {
  const tag = args[0] ? args[0].trim() : "";
  const color = args[1] || "blue";
  if (!tag) throw new Error("请提供标签名");
  sendCommand("tag", { tag: tag, tagColor: color });
}

function changeColor(args) {
  const color = args[0] ? args[0].trim() : "";
  if (!color) throw new Error("请提供颜色名称");
  sendCommand("color", { color: color });
}

function listChannels() {
  const chs = (state.channels || []).map(function(c) { return "#" + c.name + " (" + c.type + ")"; }).join(", ");
  showLocalMessage("频道: " + (chs || "无"));
}

function pinMessage() {
  const msgList = document.getElementById("chatlog");
  const lastMsg = msgList ? msgList.querySelector(".chat-msg") : null;
  if (!lastMsg) throw new Error("没有可置顶的消息");
  const msgId = lastMsg.dataset.msgId;
  sendCommand("pin", { msgId: msgId });
}

function unpinMessage() {
  sendCommand("unpin", {});
}

function clearChannel() {
  sendCommand("clear-channel", {});
}

function showRoomInfo() {
  const count = state.onlineUsers ? state.onlineUsers.length : 0;
  showLocalMessage("房间: " + state.currentRoom + " | 在线: " + count + " | 频道: " + ((state.channels || []).map(function(c) { return c.name; }).join(", ")));
}

function listUsers() {
  const users = (state.onlineUsers || []).join(", ");
  showLocalMessage("在线用户: " + (users || "无"));
}

function kickUser(args) {
  const target = args[0] ? args[0].trim() : "";
  if (!target) throw new Error("请提供用户名");
  sendCommand("kick", { target: target });
}

function banUser(args) {
  const target = args[0] ? args[0].trim() : "";
  if (!target) throw new Error("请提供用户名");
  sendCommand("ban", { target: target });
}

function muteUser(args) {
  const target = args[0] ? args[0].trim() : "";
  if (!target) throw new Error("请提供用户名");
  const duration = args[1] || "60";
  sendCommand("mute", { name: target, duration: parseInt(duration) || 60 });
}

function announce(args) {
  const text = args.join(" ");
  if (!text) throw new Error("请提供公告内容");
  sendCommand("announce", { text: text });
}

function showVersion() {
  showLocalMessage("CloudChat v2.3.1 — Dual Worker Architecture");
}

function echo(args) {
  showLocalMessage("Echo: " + args.join(" "));
}

function randomNum(args) {
  const min = parseInt(args[0]) || 1;
  const max = parseInt(args[1]) || 100;
  const result = Math.floor(Math.random() * (max - min + 1)) + min;
  showLocalMessage("随机数(" + min + "-" + max + "): " + result);
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

function triggerIcco() {
  window.__v2_triggerIcco?.();
}

function wikiSearch(args) {
  const query = args.join(" ");
  if (!query) throw new Error("请提供搜索关键词");
  sendCommand("wiki", { query: query });
}

window.__v2_handleCommand = handleCommand;
