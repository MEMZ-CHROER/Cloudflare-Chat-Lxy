// v2 modal manager override — unified modal system for v2
const MODALS = new Map();

export function openModal(name, data = {}, options = {}) {
  // Close existing
  closeModal(name);

  const modal = document.createElement("div");
  modal.id = `v2-modal-${name}`;
  modal.className = "v2-modal-overlay";
  modal.innerHTML = `
    <div class="v2-modal-container ${options.mode === 'drawer' ? 'drawer' : ''}">
      <div class="v2-modal-header">
        <h2>${data.title || name}</h2>
        <button class="v2-modal-close" onclick="window.__v2_closeModal('${name}')">&times;</button>
      </div>
      <div class="v2-modal-body" id="v2-modal-body-${name}"></div>
    </div>
  `;
  document.body.appendChild(modal);
  MODALS.set(name, { el: modal, data, options });

  modal.addEventListener("click", e => { if (e.target === modal) closeModal(name); });

  // Trigger render callback if provided
  if (data.render) data.render(document.getElementById(`v2-modal-body-${name}`));
}

export function closeModal(name) {
  const existing = MODALS.get(name);
  if (existing) {
    existing.el.remove();
    MODALS.delete(name);
  }
}

export function closeModalStack() {
  [...MODALS.keys()].forEach(closeModal);
}

export function isModalOpen(name) {
  return MODALS.has(name);
}

export function getModalStack() {
  return [...MODALS.keys()];
}

// Pre-registered modal types with their renderers
const MODAL_RENDERERS = {
  shop: () => import("./shop.override.js").then(m => m.openShop()),
  tasks: () => import("./tasks.override.js").then(m => m.openTasks()),
  lottery: () => import("./lottery.override.js").then(m => m.openLottery()),
  market: () => import("./market.override.js").then(m => m.openMarket()),
  season: () => import("./season.override.js").then(m => m.openSeason()),
  relation: () => import("./relation.override.js").then(m => m.openRelations()),
  games: () => import("./games.override.js").then(m => m.openGames()),
  hacknet: () => import("./hacknet.override.js").then(m => m.openHacknet()),
  settings: () => import("./settings.override.js").then(m => m.openSettings()),
  roominfo: () => import("./roominfo.override.js").then(m => m.openRoomInfo()),
  achievements: () => import("./achievements.override.js").then(m => m.renderAchievementsPanel()),
  favorites: () => import("./favorites.override.js").then(m => m.renderFavoritesPanel()),
  notes: () => import("./note.override.js").then(m => m.openNotes()),
};

window.__v2_openModal = openModal;
window.__v2_closeModal = closeModal;
window.__v2_modalStack = MODALS;
window.__v2_modalRenderers = MODAL_RENDERERS;
