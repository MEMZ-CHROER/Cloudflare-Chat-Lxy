// v2 highlights override — keyword highlighting for messages
import { state } from "../store.js";

const HIGHLIGHTS_KEY = "v2_highlights";

export function getHighlights() {
  try { return JSON.parse(localStorage.getItem(HIGHLIGHTS_KEY) || '[]'); }
  catch { return []; }
}

export function saveHighlights(keys) {
  localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify(keys));
}

export function addHighlight(keyword) {
  const keys = getHighlights();
  if (!keys.includes(keyword)) {
    keys.push(keyword);
    saveHighlights(keys);
  }
}

export function removeHighlight(keyword) {
  const keys = getHighlights().filter(k => k !== keyword);
  saveHighlights(keys);
}

export function isHighlighted(msg) {
  const text = (msg.message || msg.content || "").toLowerCase();
  return getHighlights().some(k => text.includes(k.toLowerCase()));
}

export function renderHighlightBadge(msg) {
  if (!isHighlighted(msg)) return null;
  const badge = document.createElement("span");
  badge.className = "v2-highlight-badge";
  badge.textContent = "!";
  badge.title = "命中关键词提醒";
  return badge;
}

window.__v2_getHighlights = getHighlights;
window.__v2_addHighlight = addHighlight;
window.__v2_removeHighlight = removeHighlight;
