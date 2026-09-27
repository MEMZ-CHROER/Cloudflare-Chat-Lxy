// v2 shop override — virtual goods marketplace
import { state } from "./store.js";
import { showToast, showSuccess, showError } from "./toast.override.js";
import { escapeHtml } from "../renderers.override.js";

const SHOP_TABS = ["buy", "honor", "equip"];
let currentShopTab = "buy";

export function openShop(tab) {
  let panel = document.getElementById("v2-shop-panel");
  if (panel) { panel.remove(); return; }

  panel = document.createElement("div");
  panel.id = "v2-shop-panel";
  panel.className = "v2-shop-overlay";
  panel.innerHTML = `
    <div class="v2-shop-modal">
      <div class="v2-shop-header">
        <h2>🛒 商城</h2>
        <button class="v2-shop-close" onclick="window.__v2_closeShop()">&times;</button>
      </div>
      <div class="v2-shop-tabs">
        <button class="v2-shop-tab${tab === 'buy' ? ' active' : ''}" data-tab="buy" onclick="window.__v2_switchShopTab('buy')">购买</button>
        <button class="v2-shop-tab${tab === 'honor' ? ' active' : ''}" data-tab="honor" onclick="window.__v2_switchShopTab('honor')">荣誉</button>
        <button class="v2-shop-tab${tab === 'equip' ? ' active' : ''}" data-tab="equip" onclick="window.__v2_switchShopTab('equip')">装备</button>
      </div>
      <div id="v2-shop-content" class="v2-shop-content"></div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.addEventListener("click", e => { if (e.target === panel) window.__v2_closeShop(); });
  switchShopTab(tab || "buy");
}

export function closeShop() {
  const p = document.getElementById("v2-shop-panel");
  if (p) p.remove();
}

export function switchShopTab(tab) {
  currentShopTab = tab;
  document.querySelectorAll(".v2-shop-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  const content = document.getElementById("v2-shop-content");
  if (!content) return;

  if (tab === "buy") loadShopItems(content);
  else if (tab === "honor") loadHonorItems(content);
  else loadInventory(content);
}

async function loadShopItems(container) {
  container.innerHTML = '<div class="v2-shop-loading">加载中...</div>';
  try {
    const res = await fetch("/api/shop/items");
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      container.innerHTML = '<div class="v2-shop-empty">暂无商品</div>';
      return;
    }
    container.innerHTML = items.map(item => `
      <div class="v2-shop-item">
        <div class="v2-shop-item-icon">${escapeHtml(item.icon || "📦")}</div>
        <div class="v2-shop-item-info">
          <div class="v2-shop-item-name">${escapeHtml(item.name)}</div>
          <div class="v2-shop-item-desc">${escapeHtml(item.description || "")}</div>
        </div>
        <div class="v2-shop-item-price">${item.price || 0} 🪙</div>
        <button class="v2-shop-buy-btn" onclick="window.__v2_buyItem(${item.id || "'${item.name}'"})">购买</button>
      </div>
    `).join("");
  } catch (e) {
    container.innerHTML = '<div class="v2-shop-error">加载失败</div>';
  }
}

async function loadHonorItems(container) {
  container.innerHTML = '<div class="v2-shop-loading">加载中...</div>';
  try {
    const res = await fetch("/api/shop/honor-items");
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      container.innerHTML = '<div class="v2-shop-empty">暂无荣誉商品</div>';
      return;
    }
    container.innerHTML = items.map(item => `
      <div class="v2-shop-item">
        <div class="v2-shop-item-icon">${escapeHtml(item.icon || "⭐")}</div>
        <div class="v2-shop-item-info">
          <div class="v2-shop-item-name">${escapeHtml(item.name)}</div>
          <div class="v2-shop-item-desc">${escapeHtml(item.description || "")}</div>
        </div>
        <div class="v2-shop-item-price">${item.honorPrice || 0} 💎</div>
        <button class="v2-shop-buy-btn" onclick="window.__v2_buyHonorItem(${item.id || "'${item.name}'"})">购买</button>
      </div>
    `).join("");
  } catch {
    container.innerHTML = '<div class="v2-shop-error">加载失败</div>';
  }
}

async function loadInventory(container) {
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch("/api/user/inventory", { headers: { "Cookie": `token=${token}` } });
    const data = await res.json();
    const items = data.inventory || [];
    if (items.length === 0) {
      container.innerHTML = '<div class="v2-shop-empty">暂无装备</div>';
      return;
    }
    container.innerHTML = items.map(item => `
      <div class="v2-shop-item">
        <div class="v2-shop-item-icon">${escapeHtml(item.icon || "🎭")}</div>
        <div class="v2-shop-item-info">
          <div class="v2-shop-item-name">${escapeHtml(item.name)}</div>
          <div class="v2-shop-item-status">${item.equipped ? "✅ 已装备" : "未装备"}</div>
        </div>
        ${!item.equipped ? `<button class="v2-shop-buy-btn" onclick="window.__v2_equipItem('${item.id}')">装备</button>` : `<button class="v2-shop-unequip-btn" onclick="window.__v2_unequipItem('${item.id}')">卸下</button>`}
      </div>
    `).join("");
  } catch {
    container.innerHTML = '<div class="v2-shop-error">加载失败</div>';
  }
}

async function buyItem(itemId) {
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch("/api/shop/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": `token=${token}` },
      body: JSON.stringify({ id: itemId }),
    });
    const data = await res.json();
    if (data.ok) { showSuccess("购买成功！"); openShop(currentShopTab); }
    else showError(data.error || "购买失败");
  } catch (e) { showError("购买失败: " + e.message); }
}

async function buyHonorItem(itemId) {
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch("/api/shop/honor-buy", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": `token=${token}` },
      body: JSON.stringify({ id: itemId }),
    });
    const data = await res.json();
    if (data.ok) { showSuccess("购买成功！"); openShop(currentShopTab); }
    else showError(data.error || "购买失败");
  } catch (e) { showError("购买失败: " + e.message); }
}

async function equipItem(itemId) {
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch("/api/shop/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": `token=${token}` },
      body: JSON.stringify({ id: itemId }),
    });
    const data = await res.json();
    if (data.ok) { showSuccess("装备成功！"); openShop("equip"); }
    else showError(data.error || "装备失败");
  } catch (e) { showError("装备失败: " + e.message); }
}

async function unequipItem(itemId) {
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch("/api/shop/unequip", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": `token=${token}` },
      body: JSON.stringify({ id: itemId }),
    });
    const data = await res.json();
    if (data.ok) { showSuccess("已卸下"); openShop("equip"); }
    else showError(data.error || "卸下失败");
  } catch (e) { showError("卸下失败: " + e.message); }
}

window.__v2_openShop = openShop;
window.__v2_closeShop = closeShop;
window.__v2_switchShopTab = switchShopTab;
window.__v2_buyItem = buyItem;
window.__v2_buyHonorItem = buyHonorItem;
window.__v2_equipItem = equipItem;
window.__v2_unequipItem = unequipItem;
