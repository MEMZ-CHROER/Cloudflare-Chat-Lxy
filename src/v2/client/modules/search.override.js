// v2 search override — client-side message search
import { state } from "../store.js";
import { escapeHtml, formatTime } from "../renderers.override.js";

let searchResults = [];
let searchIndex = -1;
let allMessages = [];

// Sync with app.js: doSearch accepts query string parameter
export function toggleSearch() {
  let searchBar = document.getElementById("search-bar");
  if (searchBar) {
    searchBar.style.display = searchBar.style.display === "flex" ? "none" : "flex";
    const input = document.getElementById("search-input");
    if (searchBar.style.display === "flex" && input) setTimeout(() => input.focus(), 50);
    return;
  }

  // Fallback: create overlay panel
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

export function doSearch(query) {
  if (typeof query === "undefined") {
    query = document.getElementById("search-input")?.value || "";
  }
  query = query.trim().toLowerCase();
  const resultsEl = document.getElementById("v2-search-results");
  const countEl = document.getElementById("search-count");

  if (!query) {
    searchResults = [];
    searchIndex = -1;
    if (resultsEl) resultsEl.innerHTML = "";
    if (countEl) countEl.textContent = "";
    return;
  }

  // Search in current messages
  searchResults = (state.messages || []).filter(m =>
    (m.message || m.content || "").toLowerCase().includes(query) ||
    (m.name || "").toLowerCase().includes(query)
  );

  searchIndex = -1;
  renderSearchResults();

  if (countEl) countEl.textContent = `${searchResults.length} 条结果`;
}

export function searchPrev() {
  if (searchResults.length === 0) return;
  searchIndex = Math.max(searchIndex - 1, 0);
  scrollToSearchResult();
  renderSearchResults();
}

export function searchNext() {
  if (searchResults.length === 0) return;
  searchIndex = Math.min(searchIndex + 1, searchResults.length - 1);
  scrollToSearchResult();
  renderSearchResults();
}

function renderSearchResults() {
  const resultsEl = document.getElementById("v2-search-results");
  if (!resultsEl) return;

  if (searchResults.length === 0) {
    resultsEl.innerHTML = '<div class="v2-search-empty">未找到匹配消息</div>';
    return;
  }

  resultsEl.innerHTML = searchResults.slice(0, 20).map((m, i) => `
    <div class="v2-search-item${i === searchIndex ? " active" : ""}" data-idx="${i}">
      <div class="v2-search-item-header">
        <span class="v2-search-item-name">${escapeHtml(m.name || "Anonymous")}</span>
        <span class="v2-search-item-time">${formatTime(m.timestamp)}</span>
      </div>
      <div class="v2-search-item-text">${highlightQuery(escapeHtml(m.message || m.content || ""))}</div>
    </div>
  `).join("");

  resultsEl.querySelectorAll(".v2-search-item").forEach(el => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx);
      searchIndex = idx;
      scrollToSearchResult();
    });
  });
}

function scrollToSearchResult() {
  const msgList = document.getElementById("chatlog");
  if (!msgList || searchIndex < 0) return;
  const msg = searchResults[searchIndex];
  if (!msg) return;

  const items = msgList.querySelectorAll("[data-msg-id]");
  items.forEach(item => {
    if (item.dataset.msgId === String(msg.id) || item.dataset.timestamp === String(msg.timestamp)) {
      item.scrollIntoView({ behavior: "smooth", block: "center" });
      item.style.background = "rgba(59,130,246,0.3)";
      setTimeout(() => { item.style.background = ""; }, 2000);
    }
  });
}

function highlightQuery(text) {
  const input = document.getElementById("search-input");
  const query = input ? input.value.trim().toLowerCase() : "";
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
    scrollToSearchResult();
    renderSearchResults();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    searchIndex = Math.max(searchIndex - 1, 0);
    scrollToSearchResult();
    renderSearchResults();
  } else if (e.key === "Enter" && searchIndex >= 0) {
    e.preventDefault();
    scrollToSearchResult();
  }
}

window.__v2_toggleSearch = toggleSearch;
window.__v2_doSearch = doSearch;
window.__v2_searchPrev = searchPrev;
window.__v2_searchNext = searchNext;
