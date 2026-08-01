// 斜杠命令处理
import { state, t } from './state.js';
import { addChatMessage, updatePointsDisplay, applyRoomBackground } from './renderers.js';
import { renderTextToAsciiCanvas } from './ascii.js';
import { showToast, showSuccess, showError, showInfo } from './state.js';
import { switchChannel } from './channels.js';

export async function handleCommand(text) {
  // 应急回滚命令（公开管理功能）：透传给服务端处理，不拦截为前端命令
  if (/^\/rollback\s+\S+\s+\S+/i.test(text)) {
    if (state.currentWebSocket) state.currentWebSocket.send(JSON.stringify({message: text}));
    return;
  }
  let parts = text.split(/\s+/);
  let cmd = parts[0].toLowerCase();
  let arg = parts.slice(1).join(" ");

  switch (cmd) {
    case "/help":
      addChatMessage(null, t("* 可用命令: /pay <用户> <数量> 转积分 | /w <用户> <消息> 私聊 | /color <颜色> 字体颜色 | /kick <用户> 踢出 | /ban <用户> 封禁(含IP) | /unban <用户> 解封 | /tag <用户> <标签> [颜色] [边框] 设置标签(支持[color]多色) | /untag <用户> 移除标签 | /redpacket <总积分> <份数> [fixed] 发红包 | /clear 清空(需管理) | /clean 本地清屏 | /zifu <文字> 生成字符画 | 发送 @所有人 可@全体成员 | /help 帮助"));
      break;

    case "/kick": {
      if (!arg) { showError(t("用法: /kick <用户名>")); break; }
      let adminKey = "";
      if (document.cookie.indexOf("admin_logged=1") === -1) { showError(t("请先登录管理后台（访问 /admin）")); break; }
      try {
        let r = await fetch("/api/admin/kick-user/" + encodeURIComponent(state.roomname) + "?key=" + encodeURIComponent(adminKey) + "&name=" + encodeURIComponent(arg) + "&caller=" + encodeURIComponent(state.username));
        addChatMessage(null, "* " + await r.text());
      } catch (e) { addChatMessage(null, t("* 操作失败: ") + e.message); }
      break;
    }

    case "/batch-kick":
    case "/bkick": {
      let names = (arg || "").split(/[,，\s]+/).filter(Boolean);
      if (names.length < 1) { showError(t("用法: /batch-kick <用户名1>,<用户名2>,...")); break; }
      let adminKeyK = "";
      if (!adminKeyK) { showError(t("请先登录管理后台（访问 /admin）")); break; }
      if (!confirm("确定要踢出 " + names.length + t(" 个用户: ") + names.join(", ") + " ?")) break;
      let results = [];
      for (let n of names) {
        try {
          let r = await fetch("/api/admin/kick-user/" + encodeURIComponent(state.roomname) + "?key=" + encodeURIComponent(adminKeyK) + "&name=" + encodeURIComponent(n));
          results.push(n + ": " + await r.text());
        } catch (e) { results.push(n + t(": 失败 - ") + e.message); }
      }
      results.forEach(r => addChatMessage(null, "* " + r));
      break;
    }

    case "/ban": {
      if (!arg) { showError(t("用法: /ban <用户名>")); break; }
      let adminKey = "";
      if (document.cookie.indexOf("admin_logged=1") === -1) { showError(t("请先登录管理后台（访问 /admin）")); break; }
      try {
        await fetch("/api/admin/global-kick?key=" + encodeURIComponent(adminKey) + "&name=" + encodeURIComponent(arg));
        let r = await fetch("/api/admin/ban/add?key=" + encodeURIComponent(adminKey) + "&name=" + encodeURIComponent(arg));
        addChatMessage(null, "* " + await r.text());
      } catch (e) { addChatMessage(null, t("* 操作失败: ") + e.message); }
      break;
    }

    case "/unban": {
      if (!arg) { showError(t("用法: /unban <用户名>")); break; }
      let adminKey = "";
      if (document.cookie.indexOf("admin_logged=1") === -1) { showError(t("请先登录管理后台（访问 /admin）")); break; }
      try {
        let r = await fetch("/api/admin/ban/remove?key=" + encodeURIComponent(adminKey) + "&name=" + encodeURIComponent(arg));
        addChatMessage(null, "* " + await r.text());
      } catch (e) { addChatMessage(null, t("* 操作失败: ") + e.message); }
      break;
    }

    case "/color": {
      if (!arg) {
        addChatMessage(null, "* 当前字体颜色: " + state.selectedColor + t("（支持颜色名: red/orange/gold/green/cyan/blue/purple/pink/black/white 或 #hex 值）"));
        break;
      }
      const colorMap = { "red": "#dc3545", "orange": "#e67e22", "gold": "#f1c40f", "green": "#28a745", "cyan": "#17a2b8", "blue": "#007bff", "purple": "#6f42c1", "pink": "#e83e8c", "black": "#000000", "white": "#ffffff", "gray": "#6c757d" };
      let newColor = colorMap[arg.toLowerCase()] || arg;
      if (!/^#[0-9a-f]{6}$/i.test(newColor)) { showError(t("无效颜色，可用: red/orange/gold/green/cyan/blue/purple/pink/black/white/gray 或 #hex")); break; }
      state.selectedColor = newColor;
      localStorage.setItem("chat_color", newColor);
      showSuccess(t("字体颜色已设置为 ") + arg);
      break;
    }

    case "/bg": {
      if (!arg) { addChatMessage(null, "* 当前房间背景: " + (localStorage.getItem("chat_bg_" + state.roomname) || "默认") + t("。用法: /bg <颜色/#hex/url> 或 /bg 清除")); break; }
      if (arg === t("清除") || arg === "reset" || arg === "default") { localStorage.removeItem("chat_bg_" + state.roomname); applyRoomBackground(state.roomname); showSuccess(t("已清除房间背景")); break; }
      localStorage.setItem("chat_bg_" + state.roomname, arg);
      applyRoomBackground(state.roomname);
      showSuccess(t("已设置房间背景: ") + arg);
      break;
    }

    case "/jl": {
      if (!state.currentWebSocket) { showError(t("未连接到聊天室")); break; }
      if (!arg) { state.currentWebSocket.send(JSON.stringify({type: "relay-list"})); break; }
      if (arg === "结束") { state.currentWebSocket.send(JSON.stringify({type: "relay-end", relayId: state.currentRelayId})); break; }
      let p = arg.split(/\s+/);
      let first = p[0], rest = p.slice(1).join(" ");
      let num = parseInt(first, 10);
      if (!isNaN(num) && rest) { state.currentWebSocket.send(JSON.stringify({type: "relay-add", relayId: state.currentRelayId, number: num, content: rest})); break; }
      if (!isNaN(num) && !rest) { showError(t("用法: /jl <数字> <内容>")); break; }
      state.currentWebSocket.send(JSON.stringify({type: "relay-create", topic: arg}));
      break;
    }

    case "/draw": {
      let poolName = arg || "default";
      if (!state.username) { showError(t("请先登录才能抽奖")); break; }
      try {
        let r = await fetch("/api/lottery/draw", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name: state.username, pool: poolName, token: localStorage.getItem("chat_token") || ""})});
        let data = await r.json();
        if (data.ok && data.prize) {
          addChatMessage(null, "* 🎉 恭喜 " + state.username + t(" 抽中了: ") + data.prize.name + "!");
          if (data.prize.tag) addChatMessage(null, t("* 🏷️ 标签 ") + data.prize.tag + t(" 已自动装备！"));
        } else { addChatMessage(null, "* " + (data.error || t("抽奖失败"))); }
      } catch (e) { addChatMessage(null, t("* 抽奖失败: ") + e.message); }
      break;
    }

    case "/pools": {
      try {
        let r = await fetch("/api/lottery/pools");
        let data = await r.json();
        if (data && data.length > 0) {
          addChatMessage(null, t("* 可用抽奖池:"));
          data.forEach(p => addChatMessage(null, "*   " + p.name + " - 每次 " + p.cost + t(" 积分 (奖品: ") + p.prizes.length + t(" 种)")));
        } else { addChatMessage(null, t("* 当前没有可用的抽奖池")); }
      } catch (e) { addChatMessage(null, t("* 获取奖池失败: ") + e.message); }
      break;
    }

    case "/pay": {
      let target = parts[1];
      let amount = parseInt(parts[2], 10);
      if (!target || !amount) { showError(t("用法: /pay <用户名> <积分数量>")); break; }
      if (amount <= 0) { showError(t("积分数量必须大于 0")); break; }
      if (!state.username) { showError(t("请先登录后再转账")); break; }
      try {
        let token = localStorage.getItem("chat_token") || "";
        let r = await fetch("/api/points/transfer?sender=" + encodeURIComponent(state.username) + "&receiver=" + encodeURIComponent(target) + "&amount=" + amount + "&token=" + encodeURIComponent(token));
        if (r.status === 403) { addChatMessage(null, t("* 转账失败：请先登录账号")); break; }
        addChatMessage(null, "* " + await r.text());
        updatePointsDisplay();
      } catch (e) { addChatMessage(null, t("* 转账失败: ") + e.message); }
      break;
    }

    case "/w":
    case "/whisper": {
      let target = parts[1];
      let whisperText = parts.slice(2).join(" ");
      if (!target || !whisperText) { showError(t("用法: /w <用户名> <消息>")); break; }
      if (!state.currentWebSocket) { showError(t("未连接到聊天室")); break; }
      state.currentWebSocket.send(JSON.stringify({type: "whisper", target, message: whisperText}));
      break;
    }

    case "/tag": {
      let targetUser = parts[1], tagValue = parts[2], tagColor = parts[3] || "", tagBorder = parts[4] || "";
      if (!targetUser || !tagValue) { showError(t("用法: /tag <用户名> <标签> [颜色] [边框颜色]\n  支持多色: /tag 1 [red]五[green]彩[blue]斑斓")); break; }
      let adminKey = "";
      if (document.cookie.indexOf("admin_logged=1") === -1) { showError(t("请先登录管理后台（访问 /admin）")); break; }
      try {
        let url = "/api/admin/tag/set?key=" + encodeURIComponent(adminKey) + "&name=" + encodeURIComponent(targetUser) + "&tag=" + encodeURIComponent(tagValue);
        if (tagColor) url += "&color=" + encodeURIComponent(tagColor);
        if (tagBorder) url += "&border=" + encodeURIComponent(tagBorder);
        addChatMessage(null, "* " + await (await fetch(url)).text());
      } catch (e) { addChatMessage(null, t("* 操作失败: ") + e.message); }
      break;
    }

    case "/untag": {
      let targetUser = parts[1];
      if (!targetUser) { showError(t("用法: /untag <用户名>")); break; }
      let adminKey = "";
      if (document.cookie.indexOf("admin_logged=1") === -1) { showError(t("请先登录管理后台（访问 /admin）")); break; }
      try {
        let r = await fetch("/api/admin/tag/remove?key=" + encodeURIComponent(adminKey) + "&name=" + encodeURIComponent(targetUser));
        addChatMessage(null, "* " + await r.text());
      } catch (e) { addChatMessage(null, t("* 操作失败: ") + e.message); }
      break;
    }

    case "/clear": {
      let adminKey = "";
      if (document.cookie.indexOf("admin_logged=1") === -1) { showError(t("请先登录管理后台（访问 /admin）")); break; }
      if (!confirm(t("确定清空 ") + state.roomname + t(" 的聊天记录吗？"))) break;
      try {
        let r = await fetch("/api/admin/clear-room/" + encodeURIComponent(state.roomname) + "?key=" + encodeURIComponent(adminKey));
        addChatMessage(null, "* " + await r.text() + t(" 即将刷新聊天室..."));
        setTimeout(() => document.location.reload(), 200);
      } catch (e) { addChatMessage(null, t("* 操作失败: ") + e.message); }
      break;
    }

    case "/clean": {
      state.chatlog.querySelectorAll(".chat-msg, .system-msg").forEach(el => el.remove());
      showSuccess(t("本地聊天记录已清除"));
      break;
    }

    case "/签到":
    case "/daily": {
      let checkinName = state.username || localStorage.getItem("chat_user") || "";
      if (!checkinName) { showError(t("请先设置用户名")); break; }
      try {
        let r = await fetch("/api/checkin", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name: checkinName})});
        let data = await r.json();
        if (data.ok) {
          addChatMessage(null, "* ✅ " + checkinName + t(" 签到成功！获得 ") + Number(data.reward).toLocaleString() + t(" 积分，当前共 ") + Number(data.total).toLocaleString() + t(" 积分"));
        } else {
          addChatMessage(null, "* " + (data.error || t("签到失败")));
        }
      } catch (e) { addChatMessage(null, t("* 签到失败: ") + e.message); }
      break;
    }

    case "/game":
    case "/games": {
      // 动态导入游戏模块，打开游戏面板
      import('./games.js').then(m => m.openGames());
      break;
    }

    case "/wave": {
      applyWaveEffect();
      if (state.currentWebSocket) state.currentWebSocket.send(JSON.stringify({type: "effect", effect: "wave"}));
      break;
    }

    case "/crash": {
      applyCrashEffect();
      if (state.currentWebSocket) state.currentWebSocket.send(JSON.stringify({type: "effect", effect: "crash"}));
      break;
    }

    case "/zifu": {
      if (!arg) { showError(t("用法: /zifu <文字>")); break; }
      if (arg.length > 15) { showError(t("文字太长，最多15个字符")); break; }
      try {
        let art = renderTextToAsciiCanvas(arg);
        if (state.currentWebSocket) state.currentWebSocket.send(JSON.stringify({type: "zifu", message: art}));
      } catch (e) { addChatMessage(null, t("* 字符画生成失败: ") + e.message); }
      break;
    }

    case "/redpacket":
    case "/rp": {
      let p = text.split(/\s+/);
      let total = parseInt(p[1], 10);
      let count = parseInt(p[2], 10);
      let mode = p[3] === "fixed" ? "fixed" : "random";
      if (!total || !count) { showError(t("用法: /redpacket <总积分> <份数> [fixed]")); break; }
      if (total > 100000) { showError(t("单次最多10万积分")); break; }
      if (count > 100) { showError(t("最多100份")); break; }
      if (mode === "fixed" && total < count) { showError(t("固定金额下每份至少1积分")); break; }
      if (!state.currentWebSocket) { showError(t("未连接到聊天室")); break; }
      state.currentWebSocket.send(JSON.stringify({type: "redpacket", action: "create", total, count, mode}));
      addChatMessage(null, t("* 🧧 红包已发出，等待领取..."));
      break;
    }

    case "/channel": {
      let sub = arg.trim().split(/\s+/);
      let action = sub[0] || "";
      let name = sub[1] || "";
      if (!action || !name) { showError("用法: /channel add <名称> 或 /channel remove <名称>"); break; }
      if (state.currentWebSocket) state.currentWebSocket.send(JSON.stringify({type: "channel", action, name}));
      break;
    }
    case "/switch": {
      let name = arg.trim();
      if (name) switchChannel(name);
      else showError("用法: /switch <频道名>");
      break;
    }
    default:
      showError(t("未知命令: ") + cmd + t("，输入 /help 查看可用命令"));
  }
}

// ========== 全房间可见效果函数 ==========

let _waveActive = false;

export function applyWaveEffect() {
  if (_waveActive) return;
  _waveActive = true;
  let el = document.querySelector(".chat-area") || document.getElementById("chatlog") || document.querySelector("main") || document.body;
  let orig = el.style.transform || "";
  let waveInterval = setInterval(() => {
    let x = (Math.random() - 0.5) * 14;
    let y = (Math.random() - 0.5) * 10;
    el.style.transform = "translate(" + x + "px," + y + "px)";
  }, 40);

  let escHandler = function(e) {
    if (e.key !== "Escape") return;
    clearInterval(waveInterval);
    _waveActive = false;
    el.style.transform = orig;
    document.removeEventListener("keydown", escHandler);
  };
  document.addEventListener("keydown", escHandler);
}

export function applyCrashEffect() {
  let container = document.querySelector(".chat-area") || document.getElementById("chatlog") || document.querySelector("main") || document.body;
  let originalTransform = container.style.transform || "";

  let overlay = document.createElement("div");
  overlay.id = "crash-glitch";
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:99998;pointer-events:none;overflow:hidden;font-family:monospace;font-size:12px;color:#0f0;line-height:1.2;opacity:0.6";
  document.body.appendChild(overlay);

  let shakeInterval = setInterval(() => {
    let x = (Math.random() - 0.5) * 20;
    let y = (Math.random() - 0.5) * 14;
    container.style.transform = "translate(" + x + "px," + y + "px)";
  }, 30);

  let colorInterval = setInterval(() => {
    let colors = ["#0a0", "#f00", "#00f", "#a0f", "#fa0", "#0aa", "#000", "#fff"];
    let bg = colors[Math.floor(Math.random() * colors.length)];
    let ct = document.querySelector(".chat-container") || document.querySelector("main") || document.body;
    ct.style.transition = "background 0.05s";
    ct.style.background = bg;
    ct.style.filter = "hue-rotate(" + Math.floor(Math.random() * 360) + "deg)";
  }, 100);

  let chars = "ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍｦｲｸｺｿﾁﾄﾉﾌﾔﾖﾙﾚﾛﾝァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロワヲン";
  let glitchRows = [];
  for (let i = 0; i < 20; i++) {
    let row = document.createElement("div");
    row.style.cssText = "position:absolute;left:" + (Math.random() * 90) + "%;top:" + (Math.random() * 100) + "%;white-space:nowrap;opacity:" + (0.3 + Math.random() * 0.7) + ";font-size:" + (10 + Math.random() * 14) + "px;color:" + (Math.random() > 0.5 ? "#0f0" : Math.random() > 0.5 ? "#f00" : "#0ff");
    let txt = "";
    for (let j = 0; j < 20 + Math.floor(Math.random() * 40); j++) txt += chars[Math.floor(Math.random() * chars.length)];
    row.textContent = txt;
    overlay.appendChild(row);
    glitchRows.push(row);
  }

  let scanlines = document.createElement("div");
  scanlines.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.15) 0px,rgba(0,0,0,0.15) 1px,transparent 1px,transparent 3px)";
  document.body.appendChild(scanlines);

  let borderEl = document.createElement("div");
  borderEl.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:99997;pointer-events:none;border:4px solid #000;box-sizing:border-box;transition:border-color 0.1s";
  document.body.appendChild(borderEl);
  let borderInterval = setInterval(() => {
    let bc = ["#f00","#0f0","#00f","#ff0","#f0f","#0ff","#fff","#000"];
    borderEl.style.borderColor = bc[Math.floor(Math.random() * bc.length)];
    borderEl.style.borderWidth = (2 + Math.floor(Math.random() * 6)) + "px";
  }, 80);

  let blackout = document.createElement("div");
  blackout.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:100000;pointer-events:none;background:#000;opacity:0";
  document.body.appendChild(blackout);
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      blackout.style.transition = "opacity 0.05s";
      blackout.style.opacity = "0.9";
      setTimeout(() => { blackout.style.opacity = "0"; }, 60 + Math.random() * 60);
    }, 400 + i * 900);
  }

  let escHandler = function(e) {
    if (e.key !== "Escape") return;
    clearInterval(shakeInterval);
    clearInterval(colorInterval);
    clearInterval(borderInterval);
    glitchRows.forEach(r => r.remove());
    overlay.remove();
    scanlines.remove();
    borderEl.remove();
    blackout.remove();
    let ct = document.querySelector(".chat-container") || document.querySelector("main") || document.body;
    ct.style.background = "";
    ct.style.transition = "";
    ct.style.filter = "";
    container.style.transform = originalTransform;
    document.removeEventListener("keydown", escHandler);
  };
  document.addEventListener("keydown", escHandler);
}
