// 🏆 v1.45 赛季管理（管理后台）— 查看当前赛季 + 创建赛季 + 开始/立即结算
// 走 /api/admin/season/*（?key= 管理密钥，api/admin 从 URL 或 httpOnly Cookie 解析）
// 全部 createElement/textContent，防 XSS

import { state } from './state.js';

const GOAL_TYPES = ["msg", "checkin", "game", "points", "achievement"];
const GOAL_TYPE_LABEL = {msg: "发言", checkin: "签到", game: "游戏获胜", points: "赛季积分", achievement: "成就"};

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

function fmtTime(ts) {
  if (!ts) return "-";
  try { return new Date(Number(ts)).toLocaleString(); } catch (e) { return String(ts); }
}
function statusLabel(s) {
  return s === "active" ? "进行中" : (s === "upcoming" ? "未开始" : "已结束");
}
function statusColor(s) {
  return s === "active" ? "#27ae60" : (s === "upcoming" ? "#f39c12" : "#95a5a6");
}
const BTN_BASE = "padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid #ccc;background:#fff;color:#333;";
const BTN_DISABLED = "opacity:0.5;cursor:not-allowed;";

export async function loadSeasonSection(container) {
  const root = container || document.getElementById("season-section");
  if (!root) return;
  root.textContent = "";

  let season = null;
  let goals = [];
  try {
    const r = await fetch("/api/admin/season/config?key=" + encodeURIComponent(state.adminKey));
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    // 契约：GET /api/admin/season/config 直接返回当前赛季对象或 null
    season = (data && data.id) ? data : null;
    goals = (season && Array.isArray(season.goals)) ? season.goals : [];
  } catch (e) {
    root.appendChild(makeEl("h2", {}, "🏆 赛季管理"));
    root.appendChild(makeEl("p", {style: "color:#c00;margin:0"}, "加载失败"));
    return;
  }

  root.appendChild(makeEl("h2", {}, "🏆 赛季管理"));

  // ---- 当前赛季状态 ----
  const card = makeEl("div", {style: "background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:16px;"});
  root.appendChild(card);

  if (!season) {
    card.appendChild(makeEl("p", {style: "margin:0;color:var(--text-secondary)"}, "当前没有赛季"));
  } else {
    const line1 = makeEl("p", {style: "margin:0 0 6px;font-weight:700"});
    line1.appendChild(makeEl("span", {}, season.name || "赛季"));
    line1.appendChild(makeEl("span", {style: "color:" + statusColor(season.status)}, " · " + statusLabel(season.status)));
    if (season.settled) line1.appendChild(makeEl("span", {style: "color:#95a5a6"}, " · 已结算"));
    card.appendChild(line1);

    card.appendChild(makeEl("p", {style: "margin:0 0 8px;font-size:13px;color:var(--text-secondary)"},
      "ID: " + (season.id || "-") + " · 开始 " + fmtTime(season.startAt) + " · 结束 " + fmtTime(season.endAt)));

    if (goals.length) {
      const tbl = makeEl("table", {style: "width:100%;border-collapse:collapse;font-size:13px;"});
      const thead = makeEl("thead", {});
      const trh = makeEl("tr", {});
      for (const h of ["类型", "描述", "目标", "荣誉"]) {
        trh.appendChild(makeEl("th", {style: "text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-secondary);"}, h));
      }
      thead.appendChild(trh);
      tbl.appendChild(thead);
      const tbody = makeEl("tbody", {});
      for (const g of goals) {
        const tr = makeEl("tr", {});
        tr.appendChild(makeEl("td", {style: "padding:6px 8px;border-bottom:1px solid var(--border);"}, GOAL_TYPE_LABEL[g.type] || g.type));
        tr.appendChild(makeEl("td", {style: "padding:6px 8px;border-bottom:1px solid var(--border);"}, g.label || "-"));
        tr.appendChild(makeEl("td", {style: "padding:6px 8px;border-bottom:1px solid var(--border);"}, String(g.target)));
        tr.appendChild(makeEl("td", {style: "padding:6px 8px;border-bottom:1px solid var(--border);"}, String(g.honor)));
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      card.appendChild(tbl);
    }
  }

  // ---- 新建赛季 ----
  root.appendChild(makeEl("h3", {style: "margin:16px 0 8px;font-size:15px"}, "创建新赛季"));
  const row1 = makeEl("div", {style: "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;"});
  row1.appendChild(makeEl("input", {id: "season-f-name", placeholder: "赛季名称", style: "width:150px"}));
  row1.appendChild(makeEl("input", {id: "season-f-start", placeholder: "开始时间戳(ms)", type: "number", style: "width:160px"}));
  row1.appendChild(makeEl("input", {id: "season-f-end", placeholder: "结束时间戳(ms)", type: "number", style: "width:160px"}));
  root.appendChild(row1);

  const goalWrap = makeEl("div", {id: "season-goals", style: "margin-bottom:8px;"});
  root.appendChild(goalWrap);

  const btnRow = makeEl("div", {style: "display:flex;flex-wrap:wrap;gap:8px;align-items:center;"});
  const addGoalBtn = makeEl("button", {style: BTN_BASE + "border-color:#4a6cf7;color:#4a6cf7;"}, "+ 添加目标");
  addGoalBtn.onclick = seasonAddGoalRow;
  btnRow.appendChild(addGoalBtn);

  const createBtn = makeEl("button", {style: BTN_BASE + "background:#27ae60;color:#fff;border-color:#27ae60;"}, "创建赛季");
  createBtn.onclick = seasonCreate;
  btnRow.appendChild(createBtn);

  // 开始赛季 / 立即结算：按状态禁用
  const startBtn = makeEl("button", {style: BTN_BASE + "background:#f39c12;color:#fff;border-color:#f39c12;"}, "开始赛季");
  startBtn.onclick = seasonStart;
  startBtn.disabled = !(season && season.status === "upcoming");
  if (startBtn.disabled) startBtn.style.cssText += BTN_DISABLED;
  btnRow.appendChild(startBtn);

  const endBtn = makeEl("button", {style: BTN_BASE + "background:#e74c3c;color:#fff;border-color:#e74c3c;"}, "立即结算");
  endBtn.onclick = seasonEnd;
  endBtn.disabled = !(season && season.status === "active" && !season.settled);
  if (endBtn.disabled) endBtn.style.cssText += BTN_DISABLED;
  btnRow.appendChild(endBtn);

  root.appendChild(btnRow);

  // 预填一行目标输入
  if (!goalWrap.children.length) seasonAddGoalRow();
}

export function seasonAddGoalRow() {
  const wrap = document.getElementById("season-goals");
  if (!wrap) return;
  const row = makeEl("div", {className: "season-goal-row", style: "display:flex;gap:6px;margin:4px 0;align-items:center;"});
  const sel = makeEl("select", {});
  for (const t of GOAL_TYPES) {
    const o = makeEl("option", {value: t}, GOAL_TYPE_LABEL[t] || t);
    sel.appendChild(o);
  }
  const target = makeEl("input", {placeholder: "目标值", type: "number", style: "width:80px"});
  const honor = makeEl("input", {placeholder: "荣誉奖励", type: "number", style: "width:80px"});
  const label = makeEl("input", {placeholder: "描述(≤30字)", style: "width:130px"});
  const del = makeEl("button", {style: "padding:2px 8px;border:1px solid #e74c3c;color:#e74c3c;background:#fff;border-radius:6px;cursor:pointer;"}, "✕");
  del.onclick = () => row.remove();
  row.appendChild(sel);
  row.appendChild(target);
  row.appendChild(honor);
  row.appendChild(label);
  row.appendChild(del);
  wrap.appendChild(row);
}

export async function seasonCreate() {
  const name = (document.getElementById("season-f-name")?.value || "").trim();
  const startAt = Number(document.getElementById("season-f-start")?.value);
  const endAt = Number(document.getElementById("season-f-end")?.value);
  if (!name) { alert("请填写赛季名称"); return; }
  if (!isFinite(startAt) || !isFinite(endAt)) { alert("请填写开始/结束时间戳(ms)"); return; }
  const goals = [];
  document.querySelectorAll("#season-goals .season-goal-row").forEach(row => {
    const sel = row.querySelector("select");
    const inputs = row.querySelectorAll("input");
    if (!sel || inputs.length < 3) return;
    goals.push({
      type: sel.value,
      target: inputs[0].value,
      honor: inputs[1].value,
      label: inputs[2].value
    });
  });
  if (!goals.length) { alert("请至少添加一个目标"); return; }
  try {
    const r = await fetch("/api/admin/season/create?key=" + encodeURIComponent(state.adminKey), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({name, startAt, endAt, goals})
    });
    const d = await r.json();
    if (d.error) { alert(d.error); return; }
    alert("赛季已创建");
    loadSeasonSection();
  } catch (e) { alert("创建失败: " + e.message); }
}

export async function seasonStart() {
  try {
    const r = await fetch("/api/admin/season/start?key=" + encodeURIComponent(state.adminKey), {method: "POST"});
    const d = await r.json();
    if (d.error) { alert(d.error); return; }
    alert("赛季已开始");
    loadSeasonSection();
  } catch (e) { alert("操作失败: " + e.message); }
}

export async function seasonEnd() {
  if (!confirm("确定立即结算当前赛季？结算后荣誉将发放给达标用户。")) return;
  try {
    const r = await fetch("/api/admin/season/end?key=" + encodeURIComponent(state.adminKey), {method: "POST"});
    const d = await r.json();
    if (d.error) { alert(d.error); return; }
    alert("赛季已结算");
    loadSeasonSection();
  } catch (e) { alert("操作失败: " + e.message); }
}
