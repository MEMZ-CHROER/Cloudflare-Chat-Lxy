// 私信面板
import { state } from './state.js';
import { formatTime, addChatMessage } from './renderers.js';
import { showToast, showError } from './state.js';

export function updateDmBadge() {
  let items = document.querySelectorAll('.user-menu-item[data-action="dm"]');
  items.forEach(el => {
    if (state.dmUnread > 0) {
      el.innerHTML = '💬 私信 <span class="dm-badge">' + state.dmUnread + '</span>';
    } else {
      el.innerHTML = '💬 私信';
    }
  });
}

export function openDM(user) {
  if (user === state.username) { showError("不能给自己发私信"); return; }
  state.dmTarget = user;
  document.querySelector("#dm-username").textContent = "私信: " + user;
  document.querySelector("#dm-panel").style.display = "flex";
  renderDMLog(user);
  state.dmUnread = 0;
  updateDmBadge();
  let inp = document.querySelector("#dm-input");
  if (inp) { inp.focus(); inp.select(); }
}

export function closeDM() {
  document.querySelector("#dm-panel").style.display = "none";
  state.dmTarget = null;
}

function renderDMLog(user) {
  let log = document.querySelector("#dm-log");
  let msgs = state.dmCache[user] || [];
  if (msgs.length === 0) { log.innerHTML = '<div class="dm-system">还没有消息，开始聊天吧</div>'; return; }
  log.innerHTML = '';
  msgs.forEach(m => {
    if (m.divider) {
      let div = document.createElement("div"); div.className = "dm-divider"; div.textContent = m.divider; log.appendChild(div); return;
    }
    if (m.system) {
      let div = document.createElement("div"); div.className = "dm-system"; div.textContent = m.system; log.appendChild(div); return;
    }
    let wrapper = document.createElement("div");
    wrapper.className = "dm-msg" + (m.isSelf ? " dm-self" : " dm-other");
    let textEl = document.createElement("span"); textEl.className = "dm-msg-text"; textEl.textContent = m.message;
    let timeEl = document.createElement("span"); timeEl.className = "dm-msg-time"; timeEl.textContent = formatTime(m.timestamp);
    wrapper.appendChild(textEl); wrapper.appendChild(timeEl); log.appendChild(wrapper);
  });
  log.scrollTop = log.scrollHeight;
}

export function addToDMCache(user, msg, isSelf) {
  if (!state.dmCache[user]) state.dmCache[user] = [];
  state.dmCache[user].push({...msg, isSelf});
  if (state.dmTarget === user) renderDMLog(user);
}

export function sendDM() {
  let input = document.querySelector("#dm-input");
  let text = input.value.trim();
  if (!text) return;
  if (!state.dmTarget) { showError("请先选择私信对象"); return; }
  if (!state.currentWebSocket) { showError("未连接到聊天室"); return; }
  input.value = "";
  state.currentWebSocket.send(JSON.stringify({type: "whisper", target: state.dmTarget, message: text}));
  addToDMCache(state.dmTarget, {from: state.username, message: text, timestamp: Date.now()}, true);
}

export function clearDM(user) {
  if (user && state.dmCache[user]) {
    delete state.dmCache[user];
    if (state.dmTarget === user) renderDMLog(user);
  }
}
