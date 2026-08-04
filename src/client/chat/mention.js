// @提及 下拉：实时筛选在线成员 + 插入昵称（v1.41 模块化拆分自 core.js）
import { state } from './state.js';

let mentionDropdown = null;
let mentionUsers = [];
let mentionQuery = "";

function getDropdown() {
  if (!mentionDropdown) mentionDropdown = document.querySelector("#mention-dropdown");
  return mentionDropdown;
}

export function showMentionDropdown(query) {
  let md = getDropdown();
  if (!md) return;
  mentionQuery = query;
  mentionUsers = [];
  state.roster.querySelectorAll("[data-name]").forEach(el => {
    let n = el.dataset.name;
    if (n && n.toLowerCase().includes(query.toLowerCase())) mentionUsers.push(n);
  });
  mentionUsers = [...new Set(mentionUsers)].filter(n => n !== state.username);
  if (mentionUsers.length === 0) { hideMentionDropdown(); return; }
  md.innerHTML = "";
  mentionUsers.forEach((name, i) => {
    let item = document.createElement("div");
    item.className = "mention-item" + (i === 0 ? " active" : "");
    item.dataset.name = name;
    let rosterEl = state.roster.querySelector('[data-name="' + name.replace(/["\\]/g, '') + '"]');
    let tagSpan = rosterEl ? rosterEl.querySelector(".tag") : null;
    if (tagSpan) { let clone = tagSpan.cloneNode(true); clone.style.position = "static"; clone.style.display = "inline-block"; item.appendChild(clone); }
    item.appendChild(document.createTextNode(" " + name));
    item.addEventListener("click", () => insertMention(name));
    item.addEventListener("mouseenter", () => { md.querySelectorAll(".active").forEach(a => a.classList.remove("active")); item.classList.add("active"); });
    md.appendChild(item);
  });
  md.classList.add("show");
}

export function hideMentionDropdown() {
  let md = getDropdown();
  if (!md) return;
  md.classList.remove("show");
  md.innerHTML = "";
  mentionQuery = "";
}

export function insertMention(name) {
  let val = state.chatInput.value;
  let pos = state.chatInput.selectionStart;
  let textBefore = val.substring(0, pos);
  let atIdx = textBefore.lastIndexOf("@");
  if (atIdx >= 0) {
    let beforeAt = val.substring(0, atIdx);
    let afterAt = val.substring(pos);
    state.chatInput.value = beforeAt + "@" + name + " " + afterAt;
    let newPos = (beforeAt + "@" + name + " ").length;
    state.chatInput.setSelectionRange(newPos, newPos);
  }
  hideMentionDropdown();
  state.chatInput.focus();
}

export function initMention() {
  // 输入时实时筛选 @提及（键盘导航在 core.js 的 chatInput keydown 里，复用本模块导出函数）
  state.chatInput.addEventListener("input", () => {
    let val = state.chatInput.value;
    let pos = state.chatInput.selectionStart;
    let textBefore = val.substring(0, pos);
    let atIdx = textBefore.lastIndexOf("@");
    if (atIdx >= 0) {
      if (atIdx === 0 || /\s/.test(textBefore[atIdx - 1])) {
        let afterAt = textBefore.substring(atIdx + 1);
        if (!/\s/.test(afterAt) && afterAt.length <= 20) { showMentionDropdown(afterAt); return; }
      }
    }
    hideMentionDropdown();
  });
}
