// v2 favorites override — message bookmarking system
import { state } from "./store.js";

const FAVORITES_KEY = "v2_favorites";

export function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
  } catch { return []; }
}

export function saveFavorites(favs) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

export function toggleFavorite(msgId) {
  const favs = getFavorites();
  const idx = favs.indexOf(msgId);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    favs.push(msgId);
  }
  saveFavorites(favs);
  return favs;
}

export function isFavorite(msgId) {
  return getFavorites().includes(msgId);
}

export function renderFavoritesPanel() {
  let panel = document.getElementById("v2-favorites-panel");
  if (panel) {
    panel.remove();
    return;
  }

  panel = document.createElement("div");
  panel.id = "v2-favorites-panel";
  panel.className = "v2-favorites-overlay";
  panel.innerHTML = `
    <div class="v2-favorites-modal">
      <div class="v2-favorites-header">
        <h2>⭐ 收藏消息</h2>
        <button class="v2-favorites-close" onclick="window.__v2_closeFavorites()">&times;</button>
      </div>
      <div id="v2-favorites-list" class="v2-favorites-list"></div>
    </div>
  `;
  document.body.appendChild(panel);

  panel.addEventListener("click", e => { if (e.target === panel) window.__v2_closeFavorites(); });
  renderFavoritesList();
}

function renderFavoritesList() {
  const list = document.getElementById("v2-favorites-list");
  if (!list) return;

  const favs = getFavorites();
  if (favs.length === 0) {
    list.innerHTML = '<div class="v2-favorites-empty">还没有收藏的消息</div>';
    return;
  }

  // Filter messages by ID
  const msgMap = new Map(state.messages?.map(m => [String(m.id), m]) || []);
  list.innerHTML = favs.map(id => {
    const msg = msgMap.get(id);
    if (!msg) return '';
    return `
      <div class="v2-favorite-item" data-id="${id}">
        <span class="v2-favorite-name">${msg.name || "Anonymous"}</span>
        <span class="v2-favorite-text">${(msg.message || msg.content || "").substring(0, 100)}${(msg.message || msg.content || "").length > 100 ? "..." : ""}</span>
        <button class="v2-favorite-remove" onclick="window.__v2_removeFavorite('${id}')">&times;</button>
      </div>
    `;
  }).join("");
}

export function removeFavorite(msgId) {
  const favs = getFavorites().filter(id => id !== msgId);
  saveFavorites(favs);
  renderFavoritesList();
}

window.__v2_renderFavorites = renderFavoritesPanel;
window.__v2_closeFavorites = () => {
  const p = document.getElementById("v2-favorites-panel");
  if (p) p.remove();
};
window.__v2_removeFavorite = removeFavorite;
