// v2 search override — client-side message search
import { state } from "../store.js";
import { escapeHtml, formatTime } from "../renderers.override.js";

let searchResults = [];
let searchIndex = -1;

export function toggleSearch() {
  let panel = document.getElementById("v2-search-panel");
  if (panel) {
    panel.remove();
    return;
  }

  panel = document.createElement("div");
  panel.id = "v2-search-panel";
  panel.className = "v2-search-panel";
  panel.innerHTML = `
    <div class="v2-search-header">
      <input id="v2-search-input" placeholder="搜索消息..." autocomplete="off">
      <button id="v2-search-close">&times;</button>
    </div>
    <div id="v2-search-results"></div>
  `;
  document.body.appendChild(panel);

  document.getElementById("v2-search-close").addEventListener("click", toggleSearch);
  document.getElementById("v2-search-input").addEventListener("input", doSearch);
  document.getElementById("v2-search-input").addEventListener("keydown", handleSearchKey);

  setTimeout(() => document.getElementById("v2-search-input").focus(), 50);
}

export function doSearch() {
  const query = document.getElementById("v2-search-input").value.trim().toLowerCase();
  const results = document.getElementById("v2-search-results");
  if (!results || !query) {
    if (results) results.innerHTML = "";
    searchResults = [];
    searchIndex = -1;
    return;
  }

  // Search in current messages
  searchResults = (state.messages || []).filter(m =>
    (m.message || m.content || "").toLowerCase().includes(query) ||
    (m.name || "").toLowerCase().includes(query)
  );

  searchIndex = -1;
  renderSearchResults();
}

function renderSearchResults() {
  const results = document.getElementById("v2-search-results");
  if (!results) return;

  if (searchResults.length === 0) {
    results.innerHTML = '<div class="v2-search-empty">未找到匹配消息</div>';
    return;
  }

  results.innerHTML = searchResults.slice(0, 20).map((m, i) => `
    <div class="v2-search-item${i === searchIndex ? " active" : ""}" data-idx="${i}">
      <div class="v2-search-item-header">
        <span class="v2-search-item-name">${escapeHtml(m.name || "Anonymous")}</span>
        <span class="v2-search-item-time">${formatTime(m.timestamp)}</span>
      </div>
      <div class="v2-search-item-text">${highlightQuery(escapeHtml(m.message || m.content || ""))}</div>
    </div>
  `).join("");

  results.querySelectorAll(".v2-search-item").forEach(el => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx);
      scrollToMessage(idx);
    });
  });
}

function highlightQuery(text) {
  const query = document.getElementById("v2-search-input")?.value.trim().toLowerCase();
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return text;
  return text.substring(0, idx) +
    '<mark>' + text.substring(idx, idx + query.length) + '</mark>' +
    text.substring(idx + query.length);
}

function handleSearchKey(e) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    searchIndex = Math.min(searchIndex + 1, searchResults.length - 1);
    renderSearchResults();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    searchIndex = Math.max(searchIndex - 1, 0);
    renderSearchResults();
  } else if (e.key === "Enter" && searchIndex >= 0) {
    e.preventDefault();
    scrollToMessage(searchIndex);
  }
}

function scrollToMessage(idx) {
  const msgList = document.getElementById("v2-messages");
  if (!msgList) return;

  const msg = searchResults[idx];
  if (!msg) return;

  // Find matching element in message list
  const items = msgList.querySelectorAll(".v2-msg");
  items.forEach(item => {
    if (item.dataset.msgId === String(msg.id) || item.dataset.timestamp === String(msg.timestamp)) {
      item.scrollIntoView({ behavior: "smooth", block: "center" });
      item.style.background = "rgba(59,130,246,0.3)";
      setTimeout(() => { item.style.background = ""; }, 2000);
    }
  });

  toggleSearch();
}

window.__v2_toggleSearch = toggleSearch;
