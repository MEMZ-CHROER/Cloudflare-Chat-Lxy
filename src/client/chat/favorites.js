// 消息收藏/书签
import { state } from './state.js';

export function getStorageKey() {
  return "chat_favorites_" + (state.roomname || "default");
}

export function loadFavorites() {
  try { return JSON.parse(localStorage.getItem(getStorageKey()) || "[]"); } catch (e) { return []; }
}

function saveFavorites(favs) {
  localStorage.setItem(getStorageKey(), JSON.stringify(favs));
}

export function toggleFavorite(msgEl, name, text, timestamp, tag, tagColor, tagBorder) {
  let favs = loadFavorites();
  let idx = favs.findIndex(f => f.timestamp === timestamp);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    favs.push({ name, text: text.slice(0, 100), timestamp, tag, tagColor, tagBorder, addedAt: Date.now() });
  }
  saveFavorites(favs);
  return idx >= 0;
}

export function isFavorited(timestamp) {
  return loadFavorites().some(f => f.timestamp === timestamp);
}

export function renderFavoritesPanel() {
  let list = document.querySelector("#favorites-panel .fav-list");
  if (!list) return;
  let favs = loadFavorites();
  if (favs.length === 0) {
    list.innerHTML = '<div class="fav-empty">暂无收藏的消息</div>';
    return;
  }
  list.innerHTML = "";
  favs.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  favs.forEach(f => {
    let row = document.createElement("div");
    row.className = "fav-item";
    let header = document.createElement("div");
    header.className = "fav-item-header";
    if (f.tag) {
      let badge = document.createElement("span");
      badge.className = "tag";
      badge.textContent = f.tag;
      badge.style.cssText = "display:inline-block;font-size:9px;font-weight:600;color:#fff;padding:1px 4px;border-radius:3px;margin-right:4px;";
      header.appendChild(badge);
    }
    let nameSpan = document.createElement("span");
    nameSpan.className = "fav-item-name";
    nameSpan.textContent = f.name || "";
    header.appendChild(nameSpan);
    row.appendChild(header);
    let textSpan = document.createElement("span");
    textSpan.className = "fav-item-text";
    textSpan.textContent = f.text || "";
    row.appendChild(textSpan);
    row.addEventListener("click", () => scrollToMessage(f.timestamp));
    list.appendChild(row);
  });
}

function scrollToMessage(timestamp) {
  let el = state.chatlog.querySelector('[data-timestamp="' + timestamp + '"]');
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("msg-ref-highlight");
    setTimeout(() => el.classList.remove("msg-ref-highlight"), 2000);
  }
  toggleFavoritesPanel();
}

// v1.53 双轨：默认走 Vue3 弹窗管理器（居中 modal）；localStorage.chatLegacyModals=1 时回退旧 overlay
export function toggleFavoritesPanel() {
  if (localStorage.getItem("chatLegacyModals") === "1") {
    toggleFavoritesPanelLegacy();
    return;
  }
  import('./modal-manager.js').then(m => {
    if (m.stack.some(x => x.name === 'favorites')) {
      m.closeModal('favorites');
    } else {
      m.openModal('favorites');
    }
  }).catch(() => toggleFavoritesPanelLegacy());
}

// 旧 overlay：display:flex/none 切换 + 渲染列表（renderFavoritesPanel 供本函数使用）
function toggleFavoritesPanelLegacy() {
  let panel = document.getElementById("favorites-panel");
  if (!panel) return;
  let show = panel.style.display !== "flex";
  panel.style.display = show ? "flex" : "none";
  if (show) renderFavoritesPanel();
}
