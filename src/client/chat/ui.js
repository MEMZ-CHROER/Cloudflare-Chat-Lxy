// UI 通用组件 - 声音、输入提示、lightbox、标题闪烁、回复、撤回等
import { state } from './state.js';
import { addChatMessage } from './renderers.js';
import { showToast, showSuccess, showError, showInfo } from './state.js';

export async function modifyOwnTag(currentTag, currentColor) {
  let adminKey = localStorage.getItem("admin_key");
  if (!adminKey) { showError("请先登录管理后台（访问 /admin）才能修改标签"); return; }
  let newTag = prompt("输入新标签（留空取消）:", currentTag || "");
  if (newTag === null || !newTag.trim()) return;
  let colorPrompt = "输入颜色（留空为默认）:\n可选: red, blue, green, purple, pink, cyan, gray, orange, yellow, teal, indigo, brown, lime, deeporange, rose, crimson, coral, gold, amber, forest, seagreen, turquoise, steel, royalblue, mediumpurple, darkviolet, chocolate, olive, firebrick, slateblue, darkcyan, mediumseagreen, indianred, cadetblue";
  let newColor = prompt(colorPrompt, currentColor || "");
  if (newColor === null) newColor = "";
  try {
    let url = "/api/admin/tag/set?key=" + encodeURIComponent(adminKey) + "&name=" + encodeURIComponent(state.username) + "&tag=" + encodeURIComponent(newTag.trim());
    if (newColor) url += "&color=" + encodeURIComponent(newColor);
    let r = await fetch(url);
    let t = await r.text();
    addChatMessage(null, "* " + t);
  } catch (e) { showError("修改标签失败: " + e.message); }
}

export function startReply(name, text) {
  state.replyTarget = name;
  state.replyText = text;
  let bar = document.getElementById("reply-bar");
  bar.innerHTML = "";
  let nameSpan = document.createElement("span");
  nameSpan.className = "reply-name";
  nameSpan.textContent = "@" + name;
  bar.appendChild(nameSpan);
  bar.appendChild(document.createTextNode(" " + (text.length > 60 ? text.slice(0, 60) + "..." : text)));
  let cancel = document.createElement("span");
  cancel.className = "reply-cancel";
  cancel.textContent = "取消";
  bar.appendChild(cancel);
  bar.style.display = "block";
  state.chatInput.focus();
}

export function cancelReply() {
  state.replyTarget = null;
  state.replyText = null;
  document.getElementById("reply-bar").style.display = "none";
}

export function playMsgSound() {
  if (state.soundMuted) return;
  try {
    let ctx = new (window.AudioContext || window.webkitAudioContext)();
    let osc = ctx.createOscillator();
    let gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 520;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
  } catch (e) {}
}

export function playMentionSound() {
  if (state.soundMuted) return;
  try {
    let ctx = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880].forEach((freq, i) => {
      let osc = ctx.createOscillator();
      let gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.15);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.15);
    });
  } catch (e) {}
}

export async function recallMessage(timestamp) {
  if (!timestamp || !state.roomname) return;
  try {
    let token = localStorage.getItem("chat_token") || "";
    let r = await fetch("/api/recall/" + encodeURIComponent(state.roomname) + "?timestamp=" + encodeURIComponent(timestamp) + "&name=" + encodeURIComponent(state.username) + "&token=" + encodeURIComponent(token));
    let text = await r.text();
    if (r.ok) showSuccess("消息已撤回");
    else showError("撤回失败: " + text);
  } catch (e) { showError("撤回失败: " + e.message); }
}

export function sendTyping() {
  if (!state.currentWebSocket || !state.username) return;
  let now = Date.now();
  if (now - state.lastTypingSent < 3000) return;
  state.lastTypingSent = now;
  state.currentWebSocket.send(JSON.stringify({type: "typing"}));
}

export async function exportChatLog() {
  let fmt = confirm("确定导出为TXT格式？\n取消将导出为JSON格式") ? "txt" : "json";
  try {
    showInfo("正在导出聊天记录...");
    // 🔒 安全修复（W1/A2）：密码房间导出需携带密码
    let exportUrl = "/api/room/" + encodeURIComponent(state.roomname) + "/export?format=" + fmt;
    if (state.roomPassword) exportUrl += "&password=" + encodeURIComponent(state.roomPassword);
    let r = await fetch(exportUrl);
    if (!r.ok) { showError("导出失败"); return; }
    let blob = await r.blob();
    let url = URL.createObjectURL(blob);
    let a = document.createElement("a");
    a.href = url;
    a.download = "chatlog_" + state.roomname + "_" + new Date().toISOString().slice(0,10) + "." + fmt;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSuccess("聊天记录已导出");
  } catch (e) { showError("导出失败: " + e.message); }
}

export function showTyping(name) {
  let el = document.getElementById("typing-indicator");
  if (!el) return;
  el.textContent = name + " 正在输入...";
  el.classList.add("show");
  if (state.typingTimers[name]) clearTimeout(state.typingTimers[name]);
  state.typingTimers[name] = setTimeout(() => {
    let el2 = document.getElementById("typing-indicator");
    if (el2) el2.classList.remove("show");
    delete state.typingTimers[name];
  }, 2500);
}

let _galleryImages = [];
let _galleryIndex = -1;

function buildGallery() {
  _galleryImages = [];
  state.chatlog.querySelectorAll(".chat-msg img").forEach(img => {
    if (img.src && !_galleryImages.includes(img.src)) _galleryImages.push(img.src);
  });
}

export function showLightbox(src) {
  buildGallery();
  _galleryIndex = _galleryImages.indexOf(src);
  let lb = document.getElementById("lightbox");
  let img = document.getElementById("lightbox-img");
  img.src = src;
  lb.classList.add("show");
  updateGalleryNav();
}

export function hideLightbox() {
  document.getElementById("lightbox").classList.remove("show");
  _galleryImages = [];
  _galleryIndex = -1;
}

export function galleryPrev() {
  if (_galleryImages.length < 2 || _galleryIndex <= 0) return;
  _galleryIndex--;
  document.getElementById("lightbox-img").src = _galleryImages[_galleryIndex];
  updateGalleryNav();
}

export function galleryNext() {
  if (_galleryImages.length < 2 || _galleryIndex >= _galleryImages.length - 1) return;
  _galleryIndex++;
  document.getElementById("lightbox-img").src = _galleryImages[_galleryIndex];
  updateGalleryNav();
}

function updateGalleryNav() {
  let prevBtn = document.getElementById("gallery-prev");
  let nextBtn = document.getElementById("gallery-next");
  if (prevBtn) prevBtn.style.display = _galleryIndex > 0 ? "flex" : "none";
  if (nextBtn) nextBtn.style.display = _galleryIndex < _galleryImages.length - 1 ? "flex" : "none";
}

export function flashTitle(text) {
  state.origTitle = document.title;
  if (state.titleInterval) clearInterval(state.titleInterval);
  let flash = true;
  state.titleInterval = setInterval(() => {
    document.title = flash ? text : state.origTitle;
    flash = !flash;
  }, 800);
  setTimeout(() => {
    if (state.titleInterval) { clearInterval(state.titleInterval); state.titleInterval = null; document.title = state.origTitle; }
  }, 12000);
  window.addEventListener("focus", () => {
    if (state.titleInterval) { clearInterval(state.titleInterval); state.titleInterval = null; document.title = state.origTitle; }
  }, { once: true });
}

export function updateTitleUnread() {
  if (document.hidden && state.unreadCount > 0) {
    document.title = "(" + state.unreadCount + ") " + state.originalDocTitle;
  }
}

export function checkAtMention(msgText, senderName) {
  if (!msgText || !state.username) return;
  if (/@everyone\b/i.test(msgText)) {
    playMentionSound();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("@" + senderName + " @了所有人", { body: msgText.length > 80 ? msgText.slice(0, 80) + "..." : msgText });
    }
    flashTitle("@" + senderName + " @了所有人");
    return;
  }
  let re = new RegExp("@(" + state.username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "i");
  if (re.test(msgText)) {
    playMentionSound();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("@" + senderName + " 提到了你", { body: msgText.length > 80 ? msgText.slice(0, 80) + "..." : msgText });
    }
    flashTitle("@" + senderName + " 提到了你");
  }
}
