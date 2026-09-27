// v2 ui override — common UI utilities
import { state } from "./store.js";
import { showToast } from "./toast.override.js";

export function confirmDialog(message, callback) {
  if (confirm(message)) callback();
}

export function promptDialog(message, defaultValue = "") {
  return prompt(message, defaultValue);
}

export function getUserLevel(exp) {
  const levels = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500, 6700, 8000, 9500, 11200, 13000, 15000, 17500, 20000, 25000];
  for (let i = levels.length - 1; i >= 0; i--) {
    if ((exp || 0) >= levels[i]) return i + 1;
  }
  return 1;
}

export function getExpForLevel(level) {
  const levels = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500, 6700, 8000, 9500, 11200, 13000, 15000, 17500, 20000, 25000];
  return levels[Math.min(level, levels.length) - 1] || 0;
}

export function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return String(num);
}

export function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => showToast("已复制到剪贴板", "success"))
    .catch(() => {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast("已复制到剪贴板", "success");
    });
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportChatLog(roomName) {
  const msgs = state.messages || [];
  const lines = msgs.map(m => `[${new Date(m.timestamp).toLocaleString()}] ${m.name}: ${m.message || m.content || ""}`);
  const text = `=== ${roomName} 聊天记录 ===\n导出时间: ${new Date().toLocaleString()}\n\n${lines.join("\n")}\n`;
  downloadText(`chatlog_${roomName}_${Date.now()}.txt`, text);
  showToast("聊天记录已导出", "success");
}

export function isAdmin() {
  return document.cookie.includes("admin_logged=1");
}

export function getAdminKey() {
  return prompt("请输入管理员密钥：") || "";
}

export function throttle(fn, delay) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= delay) { last = now; fn.apply(this, args); }
  };
}

export function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

window.__v2_confirm = confirmDialog;
window.__v2_prompt = promptDialog;
window.__v2_getUserLevel = getUserLevel;
window.__v2_getExpForLevel = getExpForLevel;
window.__v2_formatNumber = formatNumber;
window.__v2_copyToClipboard = copyToClipboard;
window.__v2_exportChatLog = exportChatLog;
window.__v2_isAdmin = isAdmin;
window.__v2_getAdminKey = getAdminKey;
