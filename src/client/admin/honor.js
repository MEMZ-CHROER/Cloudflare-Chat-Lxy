// 🪙 v1.45 荣誉管理（管理后台）— 荣誉商品 CRUD + 手动发放/扣除荣誉币
// 走 /api/admin/honor/* 与 /api/admin/honor/honor-shop/*（?key= 管理密钥，api/admin 从 URL 或 httpOnly Cookie 解析）
// 全部 createElement/textContent，防 XSS

import { state } from './state.js';
import { TAG_COLORS } from './utils.js';

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

function colorSelect(id) {
  const sel = makeEl("select", {id: id});
  sel.appendChild(makeEl("option", {value: ""}, "无"));
  for (const c of Object.keys(TAG_COLORS || {})) {
    sel.appendChild(makeEl("option", {value: c}, c));
  }
  return sel;
}

export async function loadHonorSection(container) {
  const root = container || document.getElementById("honor-section");
  if (!root) return;
  root.textContent = "";

  let items = [];
  try {
    const r = await fetch("/api/admin/honor/honor-shop/items?key=" + encodeURIComponent(state.adminKey));
    if (r.ok) items = await r.json();
  } catch (e) { items = []; }
  if (!Array.isArray(items)) items = [];

  root.appendChild(makeEl("h2", {}, "🪙 荣誉管理"));

  // ---- 手动发放 / 扣除 ----
  const manualCard = makeEl("div", {style: "background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:16px;"});
  manualCard.appendChild(makeEl("h3", {style: "margin:0 0 8px;font-size:15px"}, "手动发放 / 扣除荣誉币"));
  const mRow = makeEl("div", {style: "display:flex;flex-wrap:wrap;gap:8px;align-items:center;"});
  mRow.appendChild(makeEl("input", {id: "honor-m-name", placeholder: "用户名", style: "width:140px"}));
  mRow.appendChild(makeEl("input", {id: "honor-m-amount", placeholder: "金额(可负)", type: "number", style: "width:120px"}));
  const mBtn = makeEl("button", {style: BTN_BASE + "background:#27ae60;color:#fff;border-color:#27ae60;"}, "提交");
  mBtn.onclick = honorManualAdd;
  mRow.appendChild(mBtn);
  manualCard.appendChild(mRow);
  root.appendChild(manualCard);

  // ---- 添加荣誉商品 ----
  const addCard = makeEl("div", {style: "background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:16px;"});
  addCard.appendChild(makeEl("h3", {style: "margin:0 0 8px;font-size:15px"}, "添加荣誉商品"));
  const aRow = makeEl("div", {style: "display:flex;flex-wrap:wrap;gap:8px;align-items:center;"});
  aRow.appendChild(makeEl("input", {id: "honor-tb-name", placeholder: "商品名称", style: "width:110px"}));
  aRow.appendChild(makeEl("input", {id: "honor-tb-desc", placeholder: "描述", style: "width:130px"}));
  aRow.appendChild(makeEl("input", {id: "honor-tb-price", placeholder: "荣誉价格", type: "number", style: "width:90px"}));
  aRow.appendChild(makeEl("input", {id: "honor-tb-tag", placeholder: "标签文字", style: "width:80px"}));
  aRow.appendChild(colorSelect("honor-tb-color"));
  aRow.appendChild(colorSelect("honor-tb-border"));
  const aBtn = makeEl("button", {style: BTN_BASE + "background:#27ae60;color:#fff;border-color:#27ae60;"}, "添加商品");
  aBtn.onclick = honorAddItem;
  aRow.appendChild(aBtn);
  addCard.appendChild(aRow);
  root.appendChild(addCard);

  // ---- 商品列表 ----
  const wrap = makeEl("div", {className: "shop-table-wrap"});
  const tbl = makeEl("table", {className: "shop-table"});
  const thead = makeEl("thead", {});
  const trh = makeEl("tr", {});
  for (const h of ["名称", "描述", "荣誉价", "标签", "颜色", "边框", "状态", "操作"]) {
    trh.appendChild(makeEl("th", {}, h));
  }
  thead.appendChild(trh);
  tbl.appendChild(thead);

  const tbody = makeEl("tbody", {id: "honor-tbody"});
  if (items.length === 0) {
    const tr = makeEl("tr", {});
    tr.appendChild(makeEl("td", {colspan: "8", style: "text-align:center;color:var(--text-secondary)"}, "暂无荣誉商品"));
    tbody.appendChild(tr);
  } else {
    for (const item of items) {
      const tr = makeEl("tr", {});
      tr.appendChild(makeEl("td", {className: "s-name"}, item.name || ""));

      const descTd = makeEl("td", {});
      descTd.appendChild(document.createTextNode(item.description || ""));
      tr.appendChild(descTd);

      tr.appendChild(makeEl("td", {}, String(item.honorPrice)));

      const tagTd = makeEl("td", {});
      const badge = makeEl("span", {className: "shop-tag-badge", style: "background:" + ((TAG_COLORS && TAG_COLORS[item.color]) ? TAG_COLORS[item.color] : "#95a5a6")}, item.tag || "");
      tagTd.appendChild(badge);
      tr.appendChild(tagTd);

      const colorTd = makeEl("td", {});
      if (item.color && TAG_COLORS && TAG_COLORS[item.color]) {
        colorTd.appendChild(makeEl("span", {className: "s-color-preview", style: "background:" + TAG_COLORS[item.color]}));
      } else {
        colorTd.appendChild(document.createTextNode("-"));
      }
      tr.appendChild(colorTd);

      tr.appendChild(makeEl("td", {}, item.border || "-"));

      const statusTd = makeEl("td", {});
      statusTd.appendChild(makeEl("span", {className: item.enabled ? "shop-enabled" : "shop-disabled"}, item.enabled ? "上架" : "下架"));
      tr.appendChild(statusTd);

      const actionsTd = makeEl("td", {className: "s-actions"});
      const togBtn = makeEl("button", {className: item.enabled ? "btn-toggle-off" : "btn-toggle-on"}, item.enabled ? "下架" : "上架");
      togBtn.onclick = () => honorToggleItem(item.id);
      const delBtn = makeEl("button", {className: "btn-del"}, "删除");
      delBtn.onclick = () => honorDeleteItem(item.id);
      actionsTd.appendChild(togBtn);
      actionsTd.appendChild(delBtn);
      tr.appendChild(actionsTd);

      tbody.appendChild(tr);
    }
  }
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  root.appendChild(wrap);
}

export async function honorAddItem() {
  const name = (document.getElementById("honor-tb-name")?.value || "").trim();
  const desc = (document.getElementById("honor-tb-desc")?.value || "").trim();
  const honorPrice = (document.getElementById("honor-tb-price")?.value || "").trim();
  const tag = (document.getElementById("honor-tb-tag")?.value || "").trim();
  const color = document.getElementById("honor-tb-color")?.value || "";
  const border = document.getElementById("honor-tb-border")?.value || "";
  if (!name || !honorPrice) { alert("请填写商品名称和荣誉价格"); return; }
  try {
    const r = await fetch("/api/admin/honor/honor-shop/item/add?key=" + encodeURIComponent(state.adminKey), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({name, description: desc, honorPrice, tag, color, border})
    });
    const d = await r.json();
    if (d.error) { alert(d.error); return; }
    alert("商品已添加");
    loadHonorSection();
  } catch (e) { alert("添加失败: " + e.message); }
}

export async function honorToggleItem(id) {
  try {
    const r = await fetch("/api/admin/honor/honor-shop/item/toggle?key=" + encodeURIComponent(state.adminKey), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({id})
    });
    const d = await r.json();
    if (d.error) { alert(d.error); return; }
    loadHonorSection();
  } catch (e) { alert("操作失败: " + e.message); }
}

export async function honorDeleteItem(id) {
  if (!confirm("确定删除此荣誉商品？")) return;
  try {
    const r = await fetch("/api/admin/honor/honor-shop/item/delete?key=" + encodeURIComponent(state.adminKey), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({id})
    });
    const d = await r.json();
    if (d.error) { alert(d.error); return; }
    loadHonorSection();
  } catch (e) { alert("删除失败: " + e.message); }
}

export async function honorManualAdd() {
  const name = (document.getElementById("honor-m-name")?.value || "").trim();
  const amount = (document.getElementById("honor-m-amount")?.value || "").trim();
  if (!name || amount === "") { alert("请填写用户名和金额"); return; }
  try {
    const r = await fetch("/api/admin/honor/add?key=" + encodeURIComponent(state.adminKey), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({name, amount})
    });
    const d = await r.json();
    if (d.error) { alert(d.error); return; }
    alert("操作成功");
    loadHonorSection();
  } catch (e) { alert("操作失败: " + e.message); }
}
