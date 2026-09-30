// v2 keyboard shortcuts override — global key handlers
import { state } from "../store.js";
import { handleSend } from "../chat.js";

const SHORTCUTS = {
  "/": "openCommandPalette",
  "k": "toggleSearch",
  "s": "openSettings",
  "e": "toggleEmoji",
  "n": "requestNotifPermission",
  "g home": "goToLatest",
  "g end": "goToOldest",
  "Escape": "closePanels",
};

export function initKeyboardShortcuts() {
  document.addEventListener("keydown", handleShortcut);
}

function handleShortcut(e) {
  // Don't trigger when typing in input
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

  const key = e.key.toLowerCase();
  const combo = (e.ctrlKey || e.metaKey) ? `ctrl+${key}` : key;

  switch (combo) {
    case "/":
      e.preventDefault();
      openCommandPalette();
      break;
    case "k":
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        window.__v2_toggleSearch?.();
      }
      break;
    case "s":
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        window.__v2_openSettings?.();
      }
      break;
    case "e":
      window.__v2_toggleEmoji?.();
      break;
    case "escape":
      closePanels();
      break;
  }
}

function openCommandPalette() {
  const input = document.getElementById("chat-input");
  if (input) {
    input.focus();
    input.value = "/";
    input.setSelectionRange(1, 1);
  }
}

function closePanels() {
  const ep = document.getElementById("emoji-panel");
  if (ep) { ep.remove(); }
  const sb = document.getElementById("search-bar");
  if (sb) sb.style.display = "none";
  const so = document.getElementById("settings-overlay");
  if (so) so.style.display = "none";
  const mp = document.getElementById("more-menu-panel");
  const mback = document.getElementById("more-menu-backdrop");
  if (mp) mp.classList.remove("show");
  if (mback) mback.classList.remove("show");
}

function goToLatest() {
  const msgList = document.getElementById("chatlog");
  if (msgList) msgList.scrollTop = msgList.scrollHeight;
}

function goToOldest() {
  const msgList = document.getElementById("chatlog");
  if (msgList) msgList.scrollTop = 0;
}

window.__v2_initKeyboardShortcuts = initKeyboardShortcuts;
