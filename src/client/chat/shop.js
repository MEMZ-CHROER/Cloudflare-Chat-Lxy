// 商城弹窗
import { state, t } from './state.js';
import { escapeHtml, updatePointsDisplay } from './renderers.js';
import { getAuthName, getAuthToken, isAuthenticated } from './auth.js';
import { TAG_COLORS } from './vip.js';

export function openShop(tab) {
  document.getElementById("shop-overlay").classList.add("show");
  switchShopTab(tab || "buy");
}
export function closeShop() {
  document.getElementById("shop-overlay").classList.remove("show");
}
export function switchShopTab(tab) {
  document.querySelectorAll(".shop-tab").forEach(t => t.classList.toggle("active", t.dataset.shopTab === tab));
  if (tab === "buy") loadShopItems();
  else loadInventory();
}

function updateShopPoints() {
  let name = getAuthName();
  if (!name) return;
  fetch("/api/points/all").then(r => r.json()).then(data => {
    let pts = data[name];
    if (pts !== undefined) document.getElementById("shop-points-display").textContent = pts + t(" 积分");
  }).catch(() => {});
}

async function loadShopItems() {
  let container = document.getElementById("shop-content");
  if (!isAuthenticated()) { container.innerHTML = '<div class="shop-empty">请先<a href="#" onclick="closeShop();return false">登录</a>后使用商城</div>'; return; }
  updateShopPoints();
  try {
    let r = await fetch("/api/shop/items");
    let items = await r.json();
    if (!items || items.length === 0) { container.innerHTML = '<div class="shop-empty">暂无商品</div>'; return; }
    let html = "";
    for (let item of items) {
      let colorStyle = item.color && TAG_COLORS[item.color] ? "background:" + TAG_COLORS[item.color] : "background:#95a5a6";
      let borderStyle = item.border && TAG_COLORS[item.border] ? ";outline:2px solid " + TAG_COLORS[item.border] + ";outline-offset:-1px" : "";
      html += '<div class="shop-item">' +
        '<span class="shop-item-tag" style="' + colorStyle + borderStyle + '">' + escapeHtml(item.tag) + '</span>' +
        '<div class="shop-item-info"><div class="shop-item-name">' + escapeHtml(item.name) + '</div>' +
        (item.description ? '<div class="shop-item-desc">' + escapeHtml(item.description) + '</div>' : '') +
        '</div><span class="shop-item-price">' + escapeHtml(item.price) + ' 积分</span>' +
        '<button class="shop-btn shop-btn-buy" data-item-id="' + escapeHtml(item.id) + '">购买</button></div>';
    }
    container.innerHTML = html;
  } catch (e) { container.innerHTML = '<div class="shop-empty">加载失败: ' + e.message + '</div>'; }
}

async function loadInventory() {
  let container = document.getElementById("shop-content");
  if (!isAuthenticated()) { container.innerHTML = '<div class="shop-empty">请先登录后使用商城</div>'; return; }
  updateShopPoints();
  try {
    let r = await fetch("/api/shop/inventory?name=" + encodeURIComponent(getAuthName()));
    let items = await r.json();
    if (!items || items.length === 0) { container.innerHTML = '<div class="shop-empty">背包空空如也，去商品列表购买吧</div>'; return; }
    let html = "";
    for (let item of items) {
      let colorStyle = item.color && TAG_COLORS[item.color] ? "background:" + TAG_COLORS[item.color] : "background:#95a5a6";
      let borderStyle = item.border && TAG_COLORS[item.border] ? "outline:2px solid " + TAG_COLORS[item.border] + ";outline-offset:-1px" : "";
      let btnHtml = item.equipped
        ? '<button class="shop-btn shop-btn-unequip" data-item-id="' + escapeHtml(item.itemId) + '">卸下</button>'
        : '<button class="shop-btn shop-btn-equip" data-item-id="' + escapeHtml(item.itemId) + '">装备</button>';
      let equippedBadge = item.equipped ? '<span class="shop-equip-badge">已装备</span>' : '';
      html += '<div class="shop-item">' +
        '<span class="shop-item-tag" style="' + colorStyle + (borderStyle ? ";" + borderStyle : "") + '">' + escapeHtml(item.tag) + '</span>' +
        '<div class="shop-item-info"><div class="shop-item-name">' + escapeHtml(item.name) + equippedBadge + '</div></div>' +
        btnHtml + '</div>';
    }
    container.innerHTML = html;
  } catch (e) { container.innerHTML = '<div class="shop-empty">加载失败: ' + e.message + '</div>'; }
}

// L31: 轻量防抖——同一商品操作处理中直接忽略重复点击（服务端无风险，但避免重复弹窗/重复请求）
const _shopBusy = new Set();

export async function buyItem(itemId) {
  if (_shopBusy.has(itemId)) return;
  _shopBusy.add(itemId);
  try {
    let r = await fetch("/api/shop/buy", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name: getAuthName(), itemId, token: getAuthToken()})});
    let data = await r.json();
    if (data.error) alert(data.error);
    else { alert("购买成功！"); updatePointsDisplay(); loadShopItems(); }
  } catch (e) { alert("购买失败: " + e.message); }
  finally { _shopBusy.delete(itemId); }
}

export async function equipItem(itemId) {
  if (_shopBusy.has(itemId)) return;
  _shopBusy.add(itemId);
  try {
    let r = await fetch("/api/shop/equip", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name: getAuthName(), itemId, token: getAuthToken()})});
    let data = await r.json();
    if (data.error) alert(data.error);
    else { alert("装备成功！"); updatePointsDisplay(); loadInventory(); }
  } catch (e) { alert("装备失败: " + e.message); }
  finally { _shopBusy.delete(itemId); }
}

export async function unequipItem() {
  if (_shopBusy.has("__unequip__")) return;
  _shopBusy.add("__unequip__");
  try {
    let r = await fetch("/api/shop/unequip", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name: getAuthName(), token: getAuthToken()})});
    let data = await r.json();
    if (data.error) alert(data.error);
    else { alert("已卸下装备"); updatePointsDisplay(); loadInventory(); }
  } catch (e) { alert("操作失败: " + e.message); }
  finally { _shopBusy.delete("__unequip__"); }
}

// 事件委托
(function() {
  let el = document.getElementById("shop-content");
  if (el) el.addEventListener("click", (e) => {
    let btn = e.target.closest(".shop-btn");
    if (!btn) return;
    let id = btn.dataset.itemId;
    if (!id) return;
    if (btn.classList.contains("shop-btn-buy")) buyItem(id);
    else if (btn.classList.contains("shop-btn-equip")) equipItem(id);
    else if (btn.classList.contains("shop-btn-unequip")) unequipItem(id);
  });
})();

(function() {
  let el = document.getElementById("shop-overlay");
  if (el) el.addEventListener("click", (e) => { if (e.target === e.currentTarget) closeShop(); });
})();
