// 关键词提醒 - 自定义关键词，出现时高亮+通知
import { state } from './state.js';
import { flashTitle, playMentionSound } from './ui.js';

const STORAGE_KEY = "chat_keywords";

export function loadKeywords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch (e) { return []; }
}

function saveKeywords(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function addKeyword(word) {
  let list = loadKeywords();
  if (!word.trim() || list.includes(word.trim())) return false;
  list.push(word.trim());
  saveKeywords(list);
  return true;
}

export function removeKeyword(word) {
  saveKeywords(loadKeywords().filter(w => w !== word));
}

export function checkKeywords(text, name) {
  if (!text || !name || name === state.username) return false;
  let words = loadKeywords();
  if (words.length === 0) return false;
  let lower = text.toLowerCase();
  for (let w of words) {
    if (lower.includes(w.toLowerCase())) {
      flashTitle("🔔 " + name + t(" 提到了 ") + w);
      playMentionSound();
      return true;
    }
  }
  return false;
}

export function showKeywordManager() {
  let existing = document.getElementById("kw-panel");
  if (existing) { existing.remove(); return; }

  let panel = document.createElement("div");
  panel.id = "kw-panel";
  panel.style.cssText = "position:fixed;bottom:56px;left:12px;z-index:30;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;box-shadow:0 4px 16px rgba(0,0,0,0.12);min-width:220px;";

  let header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:13px;font-weight:600;color:var(--text);";
  header.innerHTML = '<span>🔔 关键词提醒</span><span style="cursor:pointer;font-size:18px;line-height:1;color:var(--text-secondary);" id="kw-close">&times;</span>';
  panel.appendChild(header);

  let list = loadKeywords();
  if (list.length === 0) {
    let empty = document.createElement("div");
    empty.style.cssText = "font-size:12px;color:var(--text-secondary);padding:8px 0;";
    empty.textContent = t("暂无关键词，添加后聊天中出现时将通知你");
    panel.appendChild(empty);
  } else {
    list.forEach(w => {
      let row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:4px 8px;border-radius:4px;font-size:13px;background:var(--bg);margin-bottom:3px;";
      row.innerHTML = '<span>' + w + '</span><span style="cursor:pointer;color:#e74c3c;font-size:14px;" data-word="' + w + '">&times;</span>';
      row.querySelector("[data-word]").addEventListener("click", () => {
        removeKeyword(w);
        panel.remove();
        showKeywordManager();
      });
      panel.appendChild(row);
    });
  }

  let addRow = document.createElement("div");
  addRow.style.cssText = "display:flex;gap:4px;margin-top:8px;";
  let inp = document.createElement("input");
  inp.type = "text";
  inp.placeholder = t("添加关键词...");
  inp.style.cssText = "flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;background:var(--bg);color:var(--text);outline:none;";
  let addBtn = document.createElement("button");
  addBtn.textContent = t("添加");
  addBtn.style.cssText = "padding:4px 10px;background:var(--primary);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;";
  addBtn.addEventListener("click", () => {
    let v = inp.value.trim();
    if (v && addKeyword(v)) { panel.remove(); showKeywordManager(); }
  });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") addBtn.click(); });
  addRow.appendChild(inp);
  addRow.appendChild(addBtn);
  panel.appendChild(addRow);

  document.body.appendChild(panel);
  document.getElementById("kw-close").onclick = () => panel.remove();
  inp.focus();
}
