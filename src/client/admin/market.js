// 💱 市场管理（管理后台）— 市场配置 + 订单列表 / 强制下架
// 走 /api/admin/market/*（?key= 管理密钥，api/admin 从 URL 或 httpOnly Cookie 解析）
// 全部 createElement/textContent，防 XSS

import { state } from './state.js';

function makeEl(tag, attrs, text) {
  const n = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === undefined || v === null) continue;
      if (k === "style") n.style.cssText = v;
      else if (k === "className") n.className = v;
      else if (k === "onclick") n.onclick = v;
      else n.setAttribute(k, v);
    }
  }
  if (text !== undefined) n.textContent = text;
  return n;
}

const BTN_BASE = "padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid #ccc;background:#fff;color:#333;";

const DEFAULT_CONFIG = {enabled: true, feePercent: 10, maxOpenOrders: 5, maxPrice: "1000000"};

function statusText(s) {
  if (s === "open") return "挂单中";
  if (s === "sold") return "已售出";
  if (s === "cancelled") return "已下架";
  return s || "-";
}

export async function loadMarketSection(container) {
  const root = container || document.getElementById("market-section");
  if (!root) return;
  root.textContent = "";

  // ---- 市场配置 ----
  let config = null;
  try {
    const r = await fetch("/api/admin/market/config?key=" + encodeURIComponent(state.adminKey));
    if (r.ok) config = await r.json();
  } catch (e) { config = null; }
  if (!config || typeof config !== "object") config = {...DEFAULT_CONFIG};

  const cfgCard = makeEl("div", {style: "background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:16px;"});
  cfgCard.appendChild(makeEl("h3", {style: "margin:0 0 8px;font-size:15px"}, "市场配置"));
  const cfgRow = makeEl("div", {style: "display:flex;flex-wrap:wrap;gap:12px;align-items:center;"});

  cfgRow.appendChild(makeEl("label", {style: "font-size:13px"}, "手续费(%)"));
  cfgRow.appendChild(makeEl("input", {id: "market-fee-percent", type: "number", min: "0", max: "50", value: String(config.feePercent ?? 10), style: "width:80px"}));

  const enLabel = makeEl("label", {style: "font-size:13px;display:flex;align-items:center;gap:4px;cursor:pointer;"}, "启用市场");
  const enChk = makeEl("input", {id: "market-enabled", type: "checkbox"});
  enChk.checked = config.enabled !== false;
  enLabel.insertBefore(enChk, enLabel.firstChild);
  cfgRow.appendChild(enLabel);

  cfgRow.appendChild(makeEl("label", {style: "font-size:13px"}, "挂单上限"));
  cfgRow.appendChild(makeEl("input", {id: "market-max-open", type: "number", min: "1", max: "1000", value: String(config.maxOpenOrders ?? 5), style: "width:90px"}));

  cfgRow.appendChild(makeEl("label", {style: "font-size:13px"}, "价格上限"));
  cfgRow.appendChild(makeEl("input", {id: "market-max-price", type: "number", min: "1", value: String(config.maxPrice ?? "1000000"), style: "width:110px"}));

  const saveBtn = makeEl("button", {style: BTN_BASE + "background:#27ae60;color:#fff;border-color:#27ae60;"}, "保存配置");
  saveBtn.onclick = saveMarketConfig;
  cfgRow.appendChild(saveBtn);

  cfgCard.appendChild(cfgRow);
  root.appendChild(cfgCard);

  // ---- 订单列表 ----
  let data = {orders: []};
  try {
    const r = await fetch("/api/admin/market/orders?key=" + encodeURIComponent(state.adminKey) + "&limit=100");
    if (r.ok) data = await r.json();
  } catch (e) { data = {orders: []}; }
  const orders = Array.isArray(data.orders) ? data.orders : [];

  const wrap = makeEl("div", {className: "shop-table-wrap"});
  const tbl = makeEl("table", {className: "shop-table"});
  const thead = makeEl("thead", {});
  const trh = makeEl("tr", {});
  for (const h of ["ID", "物品", "卖家", "买家", "价格", "状态", "挂单时间", "操作"]) {
    trh.appendChild(makeEl("th", {}, h));
  }
  thead.appendChild(trh);
  tbl.appendChild(thead);

  const tbody = makeEl("tbody", {});
  if (orders.length === 0) {
    const tr = makeEl("tr", {});
    tr.appendChild(makeEl("td", {colspan: "8", style: "text-align:center;color:var(--text-secondary)"}, "暂无订单"));
    tbody.appendChild(tr);
  } else {
    for (const o of orders) {
      const tr = makeEl("tr", {});
      tr.appendChild(makeEl("td", {style: "font-size:12px"}, o.id || "-"));
      tr.appendChild(makeEl("td", {}, o.itemName || "-"));
      tr.appendChild(makeEl("td", {}, o.seller || "-"));
      tr.appendChild(makeEl("td", {}, o.buyer || "-"));
      tr.appendChild(makeEl("td", {}, String(o.price ?? "-")));
      tr.appendChild(makeEl("td", {}, statusText(o.status)));
      tr.appendChild(makeEl("td", {style: "font-size:12px"}, o.createdAt ? new Date(o.createdAt).toLocaleString() : "-"));
      const actionsTd = makeEl("td", {className: "s-actions"});
      if (o.status === "open") {
        const delBtn = makeEl("button", {className: "btn-del"}, "强制下架");
        delBtn.onclick = () => delistOrder(o.id);
        actionsTd.appendChild(delBtn);
      } else {
        actionsTd.appendChild(document.createTextNode("-"));
      }
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    }
  }
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  root.appendChild(wrap);
}

export async function saveMarketConfig() {
  const feePercent = (document.getElementById("market-fee-percent")?.value ?? "").trim();
  const maxOpenOrders = (document.getElementById("market-max-open")?.value ?? "").trim();
  const maxPrice = (document.getElementById("market-max-price")?.value ?? "").trim();
  const enabledEl = document.getElementById("market-enabled");
  if (feePercent === "" || maxOpenOrders === "" || maxPrice === "") { alert("请填写完整配置"); return; }
  try {
    const r = await fetch("/api/admin/market/config?key=" + encodeURIComponent(state.adminKey), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        feePercent: Number(feePercent),
        enabled: !!enabledEl?.checked,
        maxOpenOrders: Number(maxOpenOrders),
        maxPrice
      })
    });
    const d = await r.json();
    if (d.error) { alert(d.error); return; }
    alert("配置已保存");
    loadMarketSection();
  } catch (e) { alert("保存失败: " + e.message); }
}

export async function delistOrder(id) {
  if (!confirm("确定强制下架该订单？物品将退回卖家背包。")) return;
  try {
    const r = await fetch("/api/admin/market/delist?key=" + encodeURIComponent(state.adminKey), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({orderId: id})
    });
    const d = await r.json();
    if (d.error) { alert(d.error); return; }
    alert("已强制下架");
    loadMarketSection();
  } catch (e) { alert("操作失败: " + e.message); }
}
