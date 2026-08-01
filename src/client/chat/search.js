// 搜索系统
import { state, t } from './state.js';

export function toggleSearch() {
  let bar = document.getElementById("search-bar");
  let opened = bar.classList.toggle("show");
  if (opened) {
    document.getElementById("search-input").focus();
    document.getElementById("search-input").value = "";
    state.searchResults = [];
    state.searchIndex = -1;
    document.getElementById("search-count").textContent = "";
    clearHighlights();
  }
}

function clearHighlights() {
  document.querySelectorAll(".search-highlight").forEach(el => {
    let parent = el.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent), el);
      parent.normalize();
    }
  });
  document.querySelectorAll(".search-highlight.active").forEach(el => {
    el.classList.remove("active");
  });
}

export function doSearch() {
  clearHighlights();
  let query = document.getElementById("search-input").value.trim().toLowerCase();
  if (!query) {
    state.searchResults = [];
    state.searchIndex = -1;
    document.getElementById("search-count").textContent = "";
    return;
  }
  state.searchResults = [];
  let bubbles = state.chatlog.querySelectorAll(".chat-msg .bubble");
  bubbles.forEach((bubble, idx) => {
    let text = bubble.textContent.toLowerCase();
    if (text.includes(query)) {
      state.searchResults.push(bubble);
      let html = bubble.innerHTML;
      let re = new RegExp("(" + query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
      bubble.innerHTML = html.replace(re, '<span class="search-highlight">$1</span>');
    }
  });
  if (state.searchResults.length > 0) {
    state.searchIndex = 0;
    goToSearchResult(0);
    document.getElementById("search-count").textContent = (state.searchIndex + 1) + "/" + state.searchResults.length;
  } else {
    state.searchIndex = -1;
    document.getElementById("search-count").textContent = t("无结果");
  }
}

function goToSearchResult(idx) {
  if (state.searchResults.length === 0 || idx < 0 || idx >= state.searchResults.length) return;
  document.querySelectorAll(".search-highlight.active").forEach(el => el.classList.remove("active"));
  state.searchIndex = idx;
  let target = state.searchResults[idx];
  let activeHighlights = target.querySelectorAll(".search-highlight");
  if (activeHighlights.length > 0) activeHighlights[0].classList.add("active");
  target.closest(".chat-msg").scrollIntoView({ behavior: "smooth", block: "center" });
  document.getElementById("search-count").textContent = (state.searchIndex + 1) + "/" + state.searchResults.length;
}

export function searchPrev() {
  if (state.searchResults.length === 0) return;
  let idx = (state.searchIndex - 1 + state.searchResults.length) % state.searchResults.length;
  goToSearchResult(idx);
}

export function searchNext() {
  if (state.searchResults.length === 0) return;
  let idx = (state.searchIndex + 1) % state.searchResults.length;
  goToSearchResult(idx);
}
