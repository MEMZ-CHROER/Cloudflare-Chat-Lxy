// v2 market override — P2P marketplace for trading items
import { state } from "../store.js";
import { showToast, showSuccess, showError } from "./toast.override.js";
import { escapeHtml } from "../renderers.override.js";

export function openMarket() {
  let panel = document.getElementById("v2-market-panel");
  if (panel) { panel.remove(); return; }

  panel = document.createElement("div");
  panel.id = "v2-market-panel";
  panel.className = "v2-market-overlay";
  panel.innerHTML = `
    <div class="v2-market-modal">
      <div class="v2-market-header">
        <h2>🏪 交易市场</h2>
        <button class="v2-market-close" onclick="window.__v2_closeMarket()">&times;</button>
      </div>
      <div class="v2-market-tabs">
        <button class="v2-market-tab active" data-tab="list" onclick="window.__v2_switchMarketTab('list')">挂单</button>
        <button class="v2-market-tab" data-tab="sell" onclick="window.__v2_switchMarketTab('sell')">出售</button>
        <button class="v2-market-tab" data-tab="inventory" onclick="window.__v2_switchMarketTab('inventory')">我的物品</button>
      </div>
      <div id="v2-market-content" class="v2-market-content"></div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.addEventListener("click", e => { if (e.target === panel) window.__v2_closeMarket(); });
  switchMarketTab("list");
}

export function closeMarket() {
  const p = document.getElementById("v2-market-panel");
  if (p) p.remove();
}

export function switchMarketTab(tab) {
  document.querySelectorAll(".v2-market-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  const content = document.getElementById("v2-market-content");
  if (!content) return;
  if (tab === "list") loadMarketList(content);
  else if (tab === "sell") renderSellForm(content);
  else loadMyInventory(content);
}

async function loadMarketList(container) {
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch("/api/market/list", { headers: { "Cookie": `token=${token}` } });
    const listings = await res.json();
    if (!Array.isArray(listings) || listings.length === 0) {
      container.innerHTML = '<div class="v2-market-empty">暂无挂单</div>';
      return;
    }
    container.innerHTML = listings.slice(0, 20).map(l => `
      <div class="v2-market-item">
        <span class="v2-market-item-icon">${escapeHtml(l.icon || "📦")}</span>
        <span class="v2-market-item-name">${escapeHtml(l.name)}</span>
        <span class="v2-market-item-price">${l.price} 🪙</span>
        <span class="v2-market-item-seller">${escapeHtml(l.seller)}</span>
        <button class="v2-market-buy-btn" onclick="window.__v2_buyMarketItem(${l.id})">购买</button>
      </div>
    `).join("");
  } catch {
    container.innerHTML = '<div class="v2-market-error">加载失败</div>';
  }
}

function renderSellForm(container) {
  container.innerHTML = `
    <div class="v2-market-form">
      <input id="v2-market-sell-name" placeholder="物品名称" maxlength="50">
      <input id="v2-market-sell-price" type="number" placeholder="价格 (积分)" min="1">
      <input id="v2-market-sell-desc" placeholder="描述（可选）" maxlength="200">
      <button class="v2-market-sell-btn" onclick="window.__v2_sellItem()">出售</button>
    </div>
  `;
}

async function loadMyInventory(container) {
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch("/api/market/my-items", { headers: { "Cookie": `token=${token}` } });
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      container.innerHTML = '<div class="v2-market-empty">暂无物品</div>';
      return;
    }
    container.innerHTML = items.map(item => `
      <div class="v2-market-item">
        <span class="v2-market-item-icon">${escapeHtml(item.icon || "📦")}</span>
        <span class="v2-market-item-name">${escapeHtml(item.name)}</span>
        ${item.listed ? `<span class="v2-market-listed">已售出</span>` : `<button class="v2-market-list-btn" onclick="window.__v2_listItem(${item.id})">挂单</button>`}
      </div>
    `).join("");
  } catch {
    container.innerHTML = '<div class="v2-market-error">加载失败</div>';
  }
}

async function sellItem() {
  const name = document.getElementById("v2-market-sell-name")?.value.trim();
  const price = parseInt(document.getElementById("v2-market-sell-price")?.value);
  const desc = document.getElementById("v2-market-sell-desc")?.value.trim();
  if (!name || !price || price < 1) { showError("请填写完整信息"); return; }
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch("/api/market/sell", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": `token=${token}` },
      body: JSON.stringify({ name, price, description: desc }),
    });
    const data = await res.json();
    if (data.ok) { showSuccess("出售成功！"); switchMarketTab("inventory"); }
    else showError(data.error || "出售失败");
  } catch (e) { showError("出售失败: " + e.message); }
}

async function listItem(itemId) {
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch("/api/market/list", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": `token=${token}` },
      body: JSON.stringify({ id: itemId }),
    });
    const data = await res.json();
    if (data.ok) { showSuccess("挂单成功！"); switchMarketTab("inventory"); }
    else showError(data.error || "挂单失败");
  } catch (e) { showError("挂单失败: " + e.message); }
}

async function buyMarketItem(listingId) {
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch("/api/market/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": `token=${token}` },
      body: JSON.stringify({ id: listingId }),
    });
    const data = await res.json();
    if (data.ok) { showSuccess("购买成功！"); loadMarketList(document.getElementById("v2-market-content")); }
    else showError(data.error || "购买失败");
  } catch (e) { showError("购买失败: " + e.message); }
}

window.__v2_openMarket = openMarket;
window.__v2_closeMarket = closeMarket;
window.__v2_switchMarketTab = switchMarketTab;
window.__v2_sellItem = sellItem;
window.__v2_listItem = listItem;
window.__v2_buyMarketItem = buyMarketItem;
