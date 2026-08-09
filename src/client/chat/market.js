// 💱 v1.47 交易市场弹窗（聊天室侧）— 浏览挂单 / 我的挂单 / 我的背包上架出售
// 全部 createElement + textContent 渲染（防 XSS），禁 innerHTML 拼用户数据
import { state, t } from './state.js';
import { getAuthName, getAuthToken, isAuthenticated } from './auth.js';
import { TAG_COLORS } from './vip.js';

export function openMarket(tab) {
  document.getElementById("market-overlay").classList.add("show");
  switchMarketTab(tab || "list");
}
export function closeMarket() {
  document.getElementById("market-overlay").classList.remove("show");
}
export function switchMarketTab(tab) {
  document.querySelectorAll("#market-overlay .shop-tab").forEach(el => el.classList.toggle("active", el.dataset.marketTab === tab));
  if (tab === "list") loadMarketItems();
  else if (tab === "mine") loadMyOrders();
  else loadSellInventory();
}

function fmtTime(ts) {
  if (!ts) return "";
  try { return new Date(Number(ts)).toLocaleString(); } catch (e) { return String(ts); }
}

function emptyEl(text) {
  let el = document.createElement("div");
  el.className = "shop-empty";
  el.textContent = text;
  return el;
}

function applyTagStyle(tagEl, item) {
  let c = item && item.color && TAG_COLORS[item.color] ? TAG_COLORS[item.color] : "#95a5a6";
  tagEl.style.background = c;
  if (item && item.border && TAG_COLORS[item.border]) {
    tagEl.style.outline = "2px solid " + TAG_COLORS[item.border];
    tagEl.style.outlineOffset = "-1px";
  }
}

function renderLoginHint() {
  let box = document.getElementById("market-content");
  if (!box) return;
  box.textContent = "";
  box.appendChild(emptyEl(t("请先登录后使用市场")));
}

function updateMarketPoints() {
  let name = getAuthName();
  if (!name) return;
  fetch("/api/points/all").then(r => r.json()).then(data => {
    let pts = data[name];
    if (pts !== undefined) document.getElementById("market-points-display").textContent = pts + t(" 积分");
  }).catch(() => {});
}

async function loadMarketItems() {
  let box = document.getElementById("market-content");
  if (!box) return;
  if (!isAuthenticated()) { renderLoginHint(); return; }
  updateMarketPoints();
  box.textContent = "";
  try {
    let r = await fetch("/api/market/list");
    let data = await r.json();
    if (!data || typeof data !== "object") { box.appendChild(emptyEl(t("加载失败"))); return; }
    if (data.enabled === false) { box.appendChild(emptyEl(t("市场已关闭"))); return; }
    let fee = Number(data.feePercent) || 0;
    let total = Number(data.total) || 0;
    let orders = Array.isArray(data.orders) ? data.orders : [];
    // 顶部手续费率
    let feeEl = document.createElement("div");
    feeEl.className = "market-fee";
    feeEl.textContent = t("手续费") + " " + fee + "% · " + t("共") + " " + total + " " + t("单");
    box.appendChild(feeEl);
    if (orders.length === 0) { box.appendChild(emptyEl(t("暂无挂单"))); return; }
    let frag = document.createDocumentFragment();
    let me = getAuthName();
    for (let o of orders) {
      let row = document.createElement("div");
      row.className = "shop-item";
      let tag = document.createElement("span");
      tag.className = "shop-item-tag";
      tag.textContent = o.tag || "";
      applyTagStyle(tag, o);
      let info = document.createElement("div");
      info.className = "shop-item-info";
      let name = document.createElement("div");
      name.className = "shop-item-name";
      name.textContent = o.itemName || "";
      let meta = document.createElement("div");
      meta.className = "shop-item-desc";
      meta.textContent = t("卖家") + ": " + (o.seller || "") + " · " + fmtTime(o.createdAt);
      info.appendChild(name);
      info.appendChild(meta);
      let price = document.createElement("span");
      price.className = "shop-item-price";
      price.textContent = String(o.price) + t(" 积分");
      let btn = document.createElement("button");
      btn.className = "shop-btn shop-btn-buy";
      btn.dataset.action = "buy";
      btn.dataset.id = o.id;
      if (o.seller === me) {
        btn.disabled = true;
        btn.textContent = t("自己的挂单");
        btn.classList.add("shop-btn-owned");
      } else {
        btn.textContent = t("购买");
      }
      row.appendChild(tag);
      row.appendChild(info);
      row.appendChild(price);
      row.appendChild(btn);
      frag.appendChild(row);
    }
    box.appendChild(frag);
  } catch (e) {
    box.appendChild(emptyEl(t("加载失败") + ": " + e.message));
  }
}

async function loadMyOrders() {
  let box = document.getElementById("market-content");
  if (!box) return;
  if (!isAuthenticated()) { renderLoginHint(); return; }
  updateMarketPoints();
  box.textContent = "";
  try {
    let r = await fetch("/api/market/orders?name=" + encodeURIComponent(getAuthName()) + "&token=" + encodeURIComponent(getAuthToken()));
    let orders = await r.json();
    if (!Array.isArray(orders) || orders.length === 0) { box.appendChild(emptyEl(t("暂无挂单"))); return; }
    let frag = document.createDocumentFragment();
    for (let o of orders) {
      let row = document.createElement("div");
      row.className = "shop-item";
      let tag = document.createElement("span");
      tag.className = "shop-item-tag";
      tag.textContent = o.tag || "";
      applyTagStyle(tag, o);
      let info = document.createElement("div");
      info.className = "shop-item-info";
      let name = document.createElement("div");
      name.className = "shop-item-name";
      name.textContent = o.itemName || "";
      let meta = document.createElement("div");
      meta.className = "shop-item-desc";
      meta.textContent = fmtTime(o.createdAt);
      info.appendChild(name);
      info.appendChild(meta);
      let price = document.createElement("span");
      price.className = "shop-item-price";
      price.textContent = String(o.price) + t(" 积分");
      let badge = document.createElement("span");
      badge.className = "market-badge";
      if (o.status === "sold") { badge.textContent = t("已成交"); badge.classList.add("market-badge-sold"); }
      else if (o.status === "cancelled") { badge.textContent = t("已撤销"); badge.classList.add("market-badge-cancel"); }
      else { badge.textContent = t("挂单中"); badge.classList.add("market-badge-open"); }
      row.appendChild(tag);
      row.appendChild(info);
      row.appendChild(price);
      row.appendChild(badge);
      if (o.status === "open") {
        let cancelBtn = document.createElement("button");
        cancelBtn.className = "shop-btn shop-btn-unequip";
        cancelBtn.textContent = t("撤销");
        cancelBtn.dataset.action = "cancel";
        cancelBtn.dataset.id = o.id;
        row.appendChild(cancelBtn);
      }
      frag.appendChild(row);
    }
    box.appendChild(frag);
  } catch (e) {
    box.appendChild(emptyEl(t("加载失败") + ": " + e.message));
  }
}

async function loadSellInventory() {
  let box = document.getElementById("market-content");
  if (!box) return;
  if (!isAuthenticated()) { renderLoginHint(); return; }
  updateMarketPoints();
  box.textContent = "";
  try {
    let r = await fetch("/api/market/inventory?name=" + encodeURIComponent(getAuthName()) + "&token=" + encodeURIComponent(getAuthToken()));
    let items = await r.json();
    if (!Array.isArray(items) || items.length === 0) { box.appendChild(emptyEl(t("背包空空如也"))); return; }
    let frag = document.createDocumentFragment();
    for (let item of items) {
      let row = document.createElement("div");
      row.className = "shop-item";
      let tag = document.createElement("span");
      tag.className = "shop-item-tag";
      tag.textContent = item.tag || "";
      applyTagStyle(tag, item);
      let info = document.createElement("div");
      info.className = "shop-item-info";
      let name = document.createElement("div");
      name.className = "shop-item-name";
      name.textContent = item.name || "";
      info.appendChild(name);
      row.appendChild(tag);
      row.appendChild(info);
      if (item.equipped) {
        let badge = document.createElement("span");
        badge.className = "market-badge market-badge-equip";
        badge.textContent = t("已装备");
        row.appendChild(badge);
      } else if (item.sellable === false) {
        let badge = document.createElement("span");
        badge.className = "market-badge market-badge-honor";
        badge.textContent = t("荣誉商品");
        row.appendChild(badge);
      } else {
        let input = document.createElement("input");
        input.type = "number";
        input.min = "1";
        input.className = "market-sell-input";
        input.placeholder = t("价格");
        let btn = document.createElement("button");
        btn.className = "shop-btn shop-btn-buy";
        btn.textContent = t("挂单");
        btn.dataset.action = "sell";
        btn.dataset.id = item.itemId;
        row.appendChild(input);
        row.appendChild(btn);
      }
      frag.appendChild(row);
    }
    box.appendChild(frag);
  } catch (e) {
    box.appendChild(emptyEl(t("加载失败") + ": " + e.message));
  }
}

// 轻量防抖——同一挂单/商品操作处理中直接忽略重复点击
const _marketBusy = new Set();

export async function sellItem(itemId, priceStr) {
  if (_marketBusy.has(itemId)) return;
  _marketBusy.add(itemId);
  try {
    let r = await fetch("/api/market/sell", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name: getAuthName(), itemId, price: priceStr, token: getAuthToken()})});
    let data = await r.json();
    if (data.error) alert(t(data.error) || t("操作失败"));
    else { alert(t("挂单成功！")); loadSellInventory(); }
  } catch (e) { alert(t("操作失败") + ": " + e.message); }
  finally { _marketBusy.delete(itemId); }
}

export async function buyOrder(orderId) {
  if (_marketBusy.has(orderId)) return;
  _marketBusy.add(orderId);
  try {
    let r = await fetch("/api/market/buy", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name: getAuthName(), orderId, token: getAuthToken()})});
    let data = await r.json();
    if (data.error) alert(t(data.error) || t("操作失败"));
    else { alert(t("购买成功！")); loadMarketItems(); updateMarketPoints(); }
  } catch (e) { alert(t("操作失败") + ": " + e.message); }
  finally { _marketBusy.delete(orderId); }
}

export async function cancelOrder(orderId) {
  if (_marketBusy.has(orderId)) return;
  _marketBusy.add(orderId);
  try {
    let r = await fetch("/api/market/cancel", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name: getAuthName(), orderId, token: getAuthToken()})});
    let data = await r.json();
    if (data.error) alert(t(data.error) || t("操作失败"));
    else { alert(t("已撤销")); loadMyOrders(); }
  } catch (e) { alert(t("操作失败") + ": " + e.message); }
  finally { _marketBusy.delete(orderId); }
}

// 事件委托：#market-content 内按 data-action / data-id 分发
(function() {
  let el = document.getElementById("market-content");
  if (el) el.addEventListener("click", (e) => {
    let btn = e.target.closest("[data-action]");
    if (!btn || !btn.dataset.id) return;
    let action = btn.dataset.action;
    let id = btn.dataset.id;
    if (action === "buy") buyOrder(id);
    else if (action === "cancel") cancelOrder(id);
    else if (action === "sell") {
      let input = btn.parentNode ? btn.parentNode.querySelector(".market-sell-input") : null;
      sellItem(id, input ? input.value : "");
    }
  });
})();

// 遮罩点击空白关闭
(function() {
  let el = document.getElementById("market-overlay");
  if (el) el.addEventListener("click", (e) => { if (e.target === e.currentTarget) closeMarket(); });
})();
