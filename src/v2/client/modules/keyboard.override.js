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
  const input = document.getElementById("v2-msg-input");
  if (input) {
    input.focus();
    input.value = "/";
    input.setSelectionRange(1, 1);
  }
}

function closePanels() {
  document.getElementById("v2-emoji-panel")?.remove();
  document.getElementById("v2-search-panel")?.remove();
  document.getElementById("v2-settings-panel")?.remove();
  document.getElementById("v2-favorites-panel")?.remove();
}

function goToLatest() {
  const msgList = document.getElementById("v2-messages");
  if (msgList) msgList.scrollTop = msgList.scrollHeight;
}

function goToOldest() {
  const msgList = document.getElementById("v2-messages");
  if (msgList) msgList.scrollTop = 0;
}

window.__v2_initKeyboardShortcuts = initKeyboardShortcuts;
