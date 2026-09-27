// v2 banner override — room announcement banner
import { state } from "../store.js";

export function renderBanner(announcement) {
  let banner = document.getElementById("v2-banner");
  if (!announcement || !announcement.trim()) {
    if (banner) banner.remove();
    return;
  }

  if (!banner) {
    banner = document.createElement("div");
    banner.id = "v2-banner";
    banner.className = "v2-banner";
    const chatBody = document.getElementById("v2-chat-body");
    if (chatBody) chatBody.insertBefore(banner, chatBody.firstChild);
    else document.body.insertBefore(banner, document.body.firstChild);
  }

  banner.innerHTML = `
    <div class="v2-banner-content">
      <span class="v2-banner-text">${announcement}</span>
      <button class="v2-banner-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
    </div>
  `;
}

export function initBanner() {
  // Listen for announcement messages
  const originalPatch = state.patch;
  // Banner is set via WS messages of type "announcement"
}

window.__v2_renderBanner = renderBanner;
