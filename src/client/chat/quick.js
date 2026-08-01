// 快捷短语
import { state } from './state.js';

const STORAGE_KEY = "chat_quick_phrases";
const DEFAULT_PHRASES = ["👍", "😂", t("好的"), t("收到"), t("谢谢"), "👌"];

export function loadPhrases() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch (e) { return []; }
}

function savePhrases(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function addPhrase(text) {
  let list = loadPhrases();
  if (list.includes(text)) return false;
  list.push(text);
  if (list.length > 20) list.shift();
  savePhrases(list);
  return true;
}

export function removePhrase(text) {
  let list = loadPhrases().filter(p => p !== text);
  savePhrases(list);
}

export function toggleQuickPanel() {
  let existing = document.getElementById("quick-panel");
  if (existing) { existing.remove(); return; }

  let panel = document.createElement("div");
  panel.id = "quick-panel";
  panel.style.cssText = "position:fixed;bottom:56px;left:12px;z-index:30;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);max-width:240px;";

  let header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:12px;color:var(--text-secondary);";
  header.innerHTML = '<span>快捷短语</span><span style="cursor:pointer;font-size:16px;line-height:1;" id="quick-close">&times;</span>';
  panel.appendChild(header);

  let list = loadPhrases();
  if (list.length === 0) list = DEFAULT_PHRASES;

  list.forEach(p => {
    let btn = document.createElement("div");
    btn.style.cssText = "padding:6px 10px;border-radius:6px;cursor:pointer;font-size:13px;background:var(--bg);margin-bottom:4px;transition:background 0.1s;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    btn.textContent = p;
    btn.addEventListener("mouseenter", () => btn.style.background = "var(--hover-bg, #e8e8e8)");
    btn.addEventListener("mouseleave", () => btn.style.background = "var(--bg)");
    btn.addEventListener("click", () => {
      if (state.currentWebSocket) {
        state.currentWebSocket.send(JSON.stringify({message: p}));
        state.chatlog.scrollBy(0, 1e8);
      }
      panel.remove();
    });
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (confirm(t("删除「") + p + "」?")) { removePhrase(p); panel.remove(); toggleQuickPanel(); }
    });
    panel.appendChild(btn);
  });

  let addRow = document.createElement("div");
  addRow.style.cssText = "display:flex;gap:4px;margin-top:6px;";
  let inp = document.createElement("input");
  inp.type = "text";
  inp.placeholder = t("新短语...");
  inp.style.cssText = "flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;background:var(--bg);color:var(--text);outline:none;";
  let addBtn = document.createElement("button");
  addBtn.textContent = "+";
  addBtn.style.cssText = "padding:4px 10px;background:var(--primary);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;";
  addBtn.addEventListener("click", () => {
    let v = inp.value.trim();
    if (v) { if (addPhrase(v)) panel.remove(); toggleQuickPanel(); }
  });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") addBtn.click(); });
  addRow.appendChild(inp);
  addRow.appendChild(addBtn);
  panel.appendChild(addRow);

  document.body.appendChild(panel);
  document.getElementById("quick-close").onclick = () => panel.remove();
  inp.focus();
}
