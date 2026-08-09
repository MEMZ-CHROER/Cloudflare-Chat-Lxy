// 🧪 v1.50 LuckPerms 权限系统网页编辑器（管理后台 /admin/lp/）
// 复刻 LuckPermsWeb 编辑器 UI（深色 navy）：左侧 EditorMenu（Groups/Users 分区+搜索）
//   + 右侧 Header/NodeList（权限表：全选/排序/值切换/删除）+ 底部 AddNode（添加节点/批量操作）。
// 数据经 /api/admin/lp/data 读取、写操作经 /api/admin/lp/exec 转发 registry（super-only）。
// 全部 createElement/textContent 防 XSS；样式内嵌注入（lp-ed- 前缀防冲突）。

import { state } from './state.js';

// ---------- CSS（深色 navy，仿 LuckPermsWeb） ----------
const LP_CSS = `
.lp-ed-wrap { display:flex; gap:0; background:#17171e; border-radius:10px; overflow:hidden; min-height:520px; border:1px solid rgba(255,255,255,.08); color:#e6e6e6; font-size:13px; }
.lp-ed-menu { flex:0 0 300px; background:#0e0e14; border-right:1px solid rgba(255,255,255,.08); display:flex; flex-direction:column; max-height:640px; }
.lp-ed-filter { position:relative; border-bottom:1px solid rgba(255,255,255,.08); }
.lp-ed-filter input { width:100%; box-sizing:border-box; padding:10px 30px 10px 12px; background:rgba(255,255,255,.05); border:0; color:#fff; font-size:13px; outline:none; }
.lp-ed-filter input::placeholder { color:rgba(255,255,255,.35); }
.lp-ed-filter .lp-ed-filter-x { position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:0; color:rgba(255,255,255,.5); cursor:pointer; font-size:14px; }
.lp-ed-filter .lp-ed-filter-x:hover { color:#fff; }
.lp-ed-menu-body { flex:1; overflow-y:auto; }
.lp-ed-sec-h { display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#12121a; border-bottom:1px solid rgba(255,255,255,.06); text-transform:uppercase; font-size:11px; font-weight:bold; letter-spacing:.5px; color:rgba(255,255,255,.7); cursor:pointer; position:sticky; top:0; z-index:2; }
.lp-ed-sec-h:hover { background:#16161f; }
.lp-ed-sec-h .lp-ed-sec-left { display:flex; align-items:center; gap:6px; }
.lp-ed-sec-h .lp-ed-caret { display:inline-block; width:0; height:0; border-left:5px solid rgba(255,255,255,.6); border-top:4px solid transparent; border-bottom:4px solid transparent; transition:transform .15s; }
.lp-ed-sec-h.open .lp-ed-caret { transform:rotate(90deg); }
.lp-ed-sec-h .lp-ed-count { opacity:.6; font-size:10px; }
.lp-ed-sec-h .lp-ed-sec-add { background:transparent; border:0; color:rgba(255,255,255,.5); cursor:pointer; font-size:15px; line-height:1; padding:0 4px; }
.lp-ed-sec-h .lp-ed-sec-add:hover { color:#7aa2ff; }
.lp-ed-sec-ul { margin:0; padding:0; list-style:none; }
.lp-ed-sec-ul.hidden { display:none; }
.lp-ed-sec-li { padding:7px 12px 7px 20px; border-bottom:1px solid rgba(255,255,255,.04); cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:8px; }
.lp-ed-sec-li:hover { background:rgba(255,255,255,.06); }
.lp-ed-sec-li.active { background:rgba(122,162,255,.14); border-left:2px solid #7aa2ff; }
.lp-ed-sec-li .lp-ed-sec-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0; }
.lp-ed-sec-li .lp-ed-sec-name small { opacity:.45; font-size:11px; margin-left:4px; }
.lp-ed-sec-li .lp-ed-sec-meta { font-size:11px; color:rgba(255,255,255,.4); flex-shrink:0; }
.lp-ed-sec-li .lp-ed-sec-del { background:transparent; border:0; color:rgba(255,255,255,.3); cursor:pointer; font-size:13px; padding:0 2px; flex-shrink:0; opacity:0; }
.lp-ed-sec-li:hover .lp-ed-sec-del { opacity:1; }
.lp-ed-sec-li .lp-ed-sec-del:hover { color:#ff6b6b; }
.lp-ed-sec-li .lp-ed-sec-del[disabled] { opacity:0; cursor:default; }
.lp-ed-sec-empty { padding:12px 14px; color:rgba(255,255,255,.35); font-size:12px; }

.lp-ed-main { flex:1; min-width:0; display:flex; flex-direction:column; max-height:640px; }
.lp-ed-no-sel { flex:1; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,.35); font-size:14px; flex-direction:column; gap:8px; }
.lp-ed-header { background:#2c2c39; padding:12px 16px; border-bottom:1px solid rgba(0,0,0,.3); display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.lp-ed-header .lp-ed-type-badge { text-transform:capitalize; font-size:12px; color:rgba(255,255,255,.6); }
.lp-ed-header code { font-family:"Source Code Pro",Consolas,monospace; font-size:15px; color:#fff; }
.lp-ed-header .lp-ed-sub { opacity:.5; font-size:12px; }
.lp-ed-header .lp-ed-header-actions { margin-left:auto; display:flex; gap:8px; }
.lp-ed-header button.lp-ed-btn { background:#7aa2ff; color:#0e0e14; border:0; border-radius:4px; padding:5px 14px; font-size:13px; font-weight:bold; cursor:pointer; }
.lp-ed-header button.lp-ed-btn:hover { opacity:.85; }
.lp-ed-header button.lp-ed-btn.ghost { background:rgba(255,255,255,.12); color:#fff; font-weight:normal; }
.lp-ed-header button.lp-ed-btn.ghost:hover { background:rgba(255,255,255,.2); }

.lp-ed-nodelist { flex:1; overflow-y:auto; background:rgba(255,255,255,.05); }
.lp-ed-nl-head { background:#43434e; border-bottom:1px solid rgba(0,0,0,.25); display:flex; position:sticky; top:0; z-index:2; }
.lp-ed-nl-head > div { padding:8px 10px; font-weight:bold; font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer; }
.lp-ed-nl-head > div:hover { background:rgba(255,255,255,.08); }
.lp-ed-nl-head .lp-ed-nl-cb { cursor:default; }
.lp-ed-nl-head .lp-ed-sort-arrow { font-size:10px; opacity:.7; }
.lp-ed-nl-head .lp-ed-col-perm { flex:3; }
.lp-ed-nl-head .lp-ed-col-val { flex:1; }
.lp-ed-nl-head .lp-ed-col-del { flex:0 0 40px; cursor:default; justify-content:center; }
.lp-ed-node { display:flex; align-items:center; border-bottom:1px solid rgba(0,0,0,.18); cursor:pointer; }
.lp-ed-node:hover { background:rgba(255,255,255,.07); }
.lp-ed-node > div { padding:7px 10px; }
.lp-ed-node .lp-ed-nl-cb { flex:0 0 34px; }
.lp-ed-node .lp-ed-col-perm { flex:3; word-break:break-all; display:flex; align-items:center; gap:8px; min-width:0; }
.lp-ed-node .lp-ed-col-val { flex:1; }
.lp-ed-node .lp-ed-col-del { flex:0 0 40px; text-align:center; color:rgba(255,255,255,.35); }
.lp-ed-node .lp-ed-col-del:hover { color:#ff6b6b; }
.lp-ed-node .lp-ed-nl-cb input { cursor:pointer; }
.lp-ed-node .lp-ed-badge { display:inline-block; padding:2px 6px; border-radius:3px; font-size:10px; font-weight:bold; text-transform:uppercase; flex-shrink:0; }
.lp-ed-badge-perm { background:#6c757d; color:#fff; }
.lp-ed-badge-inh { background:#5470c6; color:#fff; }
.lp-ed-node code { font-family:"Source Code Pro",Consolas,monospace; font-size:12px; color:#e6e6e6; word-break:break-all; }
.lp-ed-node .lp-ed-val-code { font-family:"Source Code Pro",Consolas,monospace; font-size:12px; cursor:pointer; padding:2px 8px; border-radius:3px; display:inline-block; }
.lp-ed-node .lp-ed-val-code.true { color:#7dffb0; background:rgba(125,255,176,.08); }
.lp-ed-node .lp-ed-val-code.false { color:#ff8a8a; background:rgba(255,138,138,.08); }
.lp-ed-node .lp-ed-val-code:hover { opacity:.8; }
.lp-ed-node .lp-ed-node-modified { background:rgba(252,252,0,.07); }

.lp-ed-addnode { background:#3a3a44; border-top:1px solid rgba(0,0,0,.35); padding:10px 12px; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.lp-ed-addnode select, .lp-ed-addnode input { padding:6px 8px; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); border-radius:4px; color:#fff; font-family:"Source Code Pro",Consolas,monospace; font-size:12px; outline:none; }
.lp-ed-addnode select { min-width:110px; }
.lp-ed-addnode input.lp-ed-node-input { flex:1; min-width:120px; }
.lp-ed-addnode select option { background:#333; color:#fff; }
.lp-ed-addnode .lp-ed-val-switch { display:flex; align-items:center; gap:4px; }
.lp-ed-addnode .lp-ed-vbtn { background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.12); color:#fff; border-radius:4px; padding:6px 12px; cursor:pointer; font-family:"Source Code Pro",Consolas,monospace; font-size:12px; }
.lp-ed-addnode .lp-ed-vbtn.active.true { background:#7dffb0; color:#0a0a0a; border-color:#7dffb0; }
.lp-ed-addnode .lp-ed-vbtn.active.false { background:#ff8a8a; color:#0a0a0a; border-color:#ff8a8a; }
.lp-ed-addnode .lp-ed-add-btn { background:#7aa2ff; color:#0e0e14; border:0; border-radius:4px; padding:6px 16px; font-size:13px; font-weight:bold; cursor:pointer; }
.lp-ed-addnode .lp-ed-add-btn:hover { opacity:.85; }
.lp-ed-addnode .lp-ed-add-btn[disabled] { opacity:.4; cursor:not-allowed; }
.lp-ed-addnode .lp-ed-batch { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.lp-ed-addnode .lp-ed-batch .lp-ed-batch-count { color:rgba(255,255,255,.7); font-size:13px; }
.lp-ed-addnode .lp-ed-batch button { background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.15); color:#fff; border-radius:4px; padding:6px 12px; cursor:pointer; font-size:12px; }
.lp-ed-addnode .lp-ed-batch button:hover { background:rgba(0,0,0,.5); }
.lp-ed-addnode .lp-ed-batch button.danger { color:#ff8a8a; border-color:rgba(255,138,138,.4); }
.lp-ed-msg { padding:8px 12px; font-size:12px; }
.lp-ed-msg.ok { color:#7dffb0; background:rgba(125,255,176,.06); }
.lp-ed-msg.err { color:#ff8a8a; background:rgba(255,138,138,.08); }
.lp-ed-empty { padding:20px; text-align:center; color:rgba(255,255,255,.35); font-size:12px; }
.lp-ed-loading { padding:30px; text-align:center; color:rgba(255,255,255,.45); }
@media (max-width:900px) { .lp-ed-wrap { flex-direction:column; } .lp-ed-menu { flex:0 0 auto; max-height:300px; border-right:0; border-bottom:1px solid rgba(255,255,255,.08); } }
`;

// ---------- 状态 ----------
const st = {
  groups: [],            // {name, permissions:[[node,val]...], parents:[], members:[]}
  users: [],             // {name, permissions:[[node,val]...], groups:[]}
  filter: "",
  current: null,         // {type:'group'|'user', name}
  selected: [],          // [{key, kind, value}]
  sort: {method: "key", desc: false},
  openSecs: {groups: true, users: true},
  addVal: true,          // 添加节点默认值
  busy: false,
};

const NAME_RE = /^[A-Za-z0-9_-]{1,24}$/;
const NODE_RE = /^[A-Za-z0-9_.*-]{1,64}$/;
function validNode(n) {
  if (!NODE_RE.test(n)) return false;
  if (n.includes("*") && n !== "*" && !n.endsWith(".*")) return false;
  return true;
}

// ---------- 工具 ----------
function makeEl(tag, attrs, text) {
  const n = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === undefined || v === null) continue;
      if (k === "style") n.style.cssText = v;
      else if (k === "className") n.className = v;
      else if (k === "onclick") n.onclick = v;
      else if (k === "checked") n.checked = v;
      else if (k === "disabled") n.disabled = v;
      else n.setAttribute(k, v);
    }
  }
  if (text !== undefined) n.textContent = text;
  return n;
}
function esc(s) { return String(s ?? ""); }
function ensureCss() {
  if (document.getElementById("lp-ed-css")) return;
  const el = makeEl("style", {id: "lp-ed-css"}, LP_CSS);
  document.head.appendChild(el);
}

// ---------- 网络 ----------
async function apiData() {
  const r = await fetch("/api/admin/lp/data?key=" + encodeURIComponent(state.adminKey));
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || "加载失败");
  return d;
}
async function apiExec(cmd) {
  const r = await fetch("/api/admin/lp/exec?key=" + encodeURIComponent(state.adminKey), {
    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({cmd})
  });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || "执行失败");
  return d;
}

// ---------- 节点构造（权限 + 继承统一为节点列表） ----------
function sessionNodes(type, name) {
  const nodes = [];
  if (type === "group") {
    const g = st.groups.find(x => x.name === name);
    if (!g) return nodes;
    for (const [key, value] of g.permissions) nodes.push({kind: "perm", key, value, tag: "permission"});
    for (const p of (g.parents || [])) nodes.push({kind: "inh", key: "group." + p, value: true, tag: "inheritance", groupName: p});
  } else {
    const u = st.users.find(x => x.name === name);
    if (!u) return nodes;
    for (const [key, value] of u.permissions) nodes.push({kind: "perm", key, value, tag: "permission"});
    for (const g of (u.groups || [])) nodes.push({kind: "inh", key: "group." + g, value: true, tag: "inheritance", groupName: g});
  }
  return nodes;
}

// ---------- 渲染 ----------
export async function loadLpSection(container) {
  ensureCss();
  const root = container || document.getElementById("lp-section");
  if (!root) return;
  root.textContent = "";
  root.appendChild(makeEl("div", {className: "lp-ed-loading"}, "加载权限数据中..."));

  let data;
  try { data = await apiData(); }
  catch (e) { root.textContent = ""; root.appendChild(makeEl("div", {className: "lp-ed-msg err"}, "加载失败：" + e.message)); return; }
  st.groups = data.groups || [];
  st.users = data.users || [];
  st.current = null;
  st.selected = [];
  renderAll(root);
}

function renderAll(root) {
  const wrap = makeEl("div", {className: "lp-ed-wrap"});
  wrap.appendChild(renderMenu());
  wrap.appendChild(renderMain());
  root.textContent = "";
  root.appendChild(wrap);
}

function renderMenu() {
  const menu = makeEl("div", {className: "lp-ed-menu"});

  const f = makeEl("div", {className: "lp-ed-filter"});
  f.appendChild(makeEl("input", {type: "text", placeholder: "搜索...", value: st.filter,
    oninput: function (e) { st.filter = e.target.value; renderAll(document.getElementById("lp-section")); }}));
  if (st.filter) {
    f.appendChild(makeEl("button", {className: "lp-ed-filter-x", onclick: () => {
      st.filter = ""; renderAll(document.getElementById("lp-section"));
    }}, "✕"));
  }
  menu.appendChild(f);

  const body = makeEl("div", {className: "lp-ed-menu-body"});

  // ---- Groups 分区 ----
  const q = (st.filter || "").toLowerCase();
  const groups = st.groups.filter(g => g.name.toLowerCase().includes(q));
  body.appendChild(renderSection("groups", "权限组", groups.length, st.openSecs.groups,
    () => { st.openSecs.groups = !st.openSecs.groups; renderAll(document.getElementById("lp-section")); },
    () => addGroupFlow(),
    groups.map(g => makeGroupLi(g))));

  // ---- Users 分区 ----
  const users = st.users.filter(u => u.name.toLowerCase().includes(q));
  body.appendChild(renderSection("users", "用户", users.length, st.openSecs.users,
    () => { st.openSecs.users = !st.openSecs.users; renderAll(document.getElementById("lp-section")); },
    null,
    users.map(u => makeUserLi(u))));

  menu.appendChild(body);
  return menu;
}

function renderSection(key, title, count, open, onToggle, onAdd, lis) {
  const sec = makeEl("div", {});
  const h = makeEl("div", {className: "lp-ed-sec-h" + (open ? " open" : "")});
  const left = makeEl("div", {className: "lp-ed-sec-left"});
  left.appendChild(makeEl("span", {className: "lp-ed-caret"}));
  left.appendChild(makeEl("span", {}, title));
  left.appendChild(makeEl("span", {className: "lp-ed-count"}, "(" + count + ")"));
  h.appendChild(left);
  if (onAdd) h.appendChild(makeEl("button", {className: "lp-ed-sec-add", title: "新建" + title, onclick: onAdd}, "+"));
  h.onclick = onToggle;
  sec.appendChild(h);

  const ul = makeEl("ul", {className: "lp-ed-sec-ul" + (open ? "" : " hidden")});
  if (lis.length === 0) {
    ul.appendChild(makeEl("li", {className: "lp-ed-sec-empty"}, "（无）"));
  } else {
    for (const li of lis) ul.appendChild(li);
  }
  sec.appendChild(ul);
  return sec;
}

function makeGroupLi(g) {
  const li = makeEl("li", {className: "lp-ed-sec-li" + (st.current && st.current.type === "group" && st.current.name === g.name ? " active" : ""),
    onclick: () => { st.current = {type: "group", name: g.name}; st.selected = []; renderAll(document.getElementById("lp-section")); }});
  const name = makeEl("span", {className: "lp-ed-sec-name"}, g.name);
  if (g.parents && g.parents.length) name.appendChild(makeEl("small", {}, g.parents.join(", ")));
  li.appendChild(name);
  li.appendChild(makeEl("span", {className: "lp-ed-sec-meta"}, g.permissions.length + "权限/" + (g.members ? g.members.length : 0) + "成员"));
  const del = makeEl("button", {className: "lp-ed-sec-del", title: "删除组", onclick: (e) => { e.stopPropagation(); deleteGroupFlow(g.name); }}, "🗑");
  li.appendChild(del);
  return li;
}

function makeUserLi(u) {
  const li = makeEl("li", {className: "lp-ed-sec-li" + (st.current && st.current.type === "user" && st.current.name === u.name ? " active" : ""),
    onclick: () => { st.current = {type: "user", name: u.name}; st.selected = []; renderAll(document.getElementById("lp-section")); }});
  li.appendChild(makeEl("span", {className: "lp-ed-sec-name"}, u.name));
  li.appendChild(makeEl("span", {className: "lp-ed-sec-meta"}, u.permissions.length + "权限/" + (u.groups ? u.groups.length : 0) + "组"));
  const hasLp = u.permissions.length > 0 || (u.groups && u.groups.length > 0);
  const del = makeEl("button", {className: "lp-ed-sec-del", title: "清除该用户权限记录", disabled: !hasLp,
    onclick: (e) => { e.stopPropagation(); deleteUserFlow(u.name); }}, "🗑");
  li.appendChild(del);
  return li;
}

function renderMain() {
  const main = makeEl("div", {className: "lp-ed-main"});
  if (!st.current) {
    const noSel = makeEl("div", {className: "lp-ed-no-sel"});
    noSel.appendChild(makeEl("div", {style: "font-size:28px"}, "🔑"));
    noSel.appendChild(makeEl("div", {}, "选择左侧权限组或用户开始编辑"));
    noSel.appendChild(makeEl("div", {style: "font-size:12px;color:rgba(255,255,255,.3)"}, "LuckPerms 权限编辑器"));
    main.appendChild(noSel);
    return main;
  }
  const name = st.current.name;
  const nodes = sessionNodes(st.current.type, name);

  // Header
  const header = makeEl("div", {className: "lp-ed-header"});
  header.appendChild(makeEl("span", {className: "lp-ed-type-badge"}, st.current.type + ":"));
  header.appendChild(makeEl("code", {}, name));
  const grp = st.current.type === "group" ? st.groups.find(x => x.name === name) : null;
  if (grp && grp.members && grp.members.length) header.appendChild(makeEl("span", {className: "lp-ed-sub"}, grp.members.length + " 名成员"));
  const acts = makeEl("div", {className: "lp-ed-header-actions"});
  acts.appendChild(makeEl("button", {className: "lp-ed-btn ghost", onclick: () => loadLpSection()}, "刷新"));
  header.appendChild(acts);
  main.appendChild(header);

  // NodeList
  main.appendChild(renderNodeList(nodes));

  // AddNode
  main.appendChild(renderAddNode(nodes));

  return main;
}

function renderNodeList(nodes) {
  const list = makeEl("div", {className: "lp-ed-nodelist"});

  // 排序
  const sorted = [...nodes];
  if (st.sort.method === "key") {
    sorted.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  } else if (st.sort.method === "value") {
    sorted.sort((a, b) => String(a.value) < String(b.value) ? -1 : String(a.value) > String(b.value) ? 1 : 0);
  }
  if (st.sort.desc) sorted.reverse();

  const head = makeEl("div", {className: "lp-ed-nl-head"});
  const cbAll = makeEl("div", {className: "lp-ed-nl-cb"});
  const cballInput = makeEl("input", {type: "checkbox", checked: nodes.length > 0 && st.selected.length === nodes.length,
    onchange: (e) => { st.selected = e.target.checked ? nodes.map(n => ({key: n.key, kind: n.kind, value: n.value})) : []; renderAll(document.getElementById("lp-section")); }});
  cbAll.appendChild(cballInput);
  head.appendChild(cbAll);

  const colPerm = makeEl("div", {className: "lp-ed-col-perm", onclick: () => { st.sort.method = "key"; st.sort.desc = !st.sort.desc; renderAll(document.getElementById("lp-section")); }});
  colPerm.appendChild(makeEl("span", {}, "权限"));
  if (st.sort.method === "key") colPerm.appendChild(makeEl("span", {className: "lp-ed-sort-arrow"}, st.sort.desc ? "▲" : "▼"));
  head.appendChild(colPerm);

  const colVal = makeEl("div", {className: "lp-ed-col-val", onclick: () => { st.sort.method = "value"; st.sort.desc = !st.sort.desc; renderAll(document.getElementById("lp-section")); }});
  colVal.appendChild(makeEl("span", {}, "值"));
  if (st.sort.method === "value") colVal.appendChild(makeEl("span", {className: "lp-ed-sort-arrow"}, st.sort.desc ? "▲" : "▼"));
  head.appendChild(colVal);

  head.appendChild(makeEl("div", {className: "lp-ed-col-del"}, ""));
  list.appendChild(head);

  if (sorted.length === 0) {
    list.appendChild(makeEl("div", {className: "lp-ed-empty"}, "该" + (st.current.type === "group" ? "权限组" : "用户") + "暂无节点，用底部栏添加"));
    return list;
  }

  for (const n of sorted) {
    list.appendChild(renderNodeRow(n));
  }
  return list;
}

function renderNodeRow(n) {
  const row = makeEl("div", {className: "lp-ed-node"});

  const isSel = st.selected.some(s => s.key === n.key && s.kind === n.kind);
  const cb = makeEl("div", {className: "lp-ed-nl-cb"});
  const cbin = makeEl("input", {type: "checkbox", checked: isSel,
    onchange: (e) => {
      if (e.target.checked) st.selected.push({key: n.key, kind: n.kind, value: n.value});
      else st.selected = st.selected.filter(s => !(s.key === n.key && s.kind === n.kind));
      renderAll(document.getElementById("lp-section"));
    }});
  cb.appendChild(cbin);
  row.appendChild(cb);

  const perm = makeEl("div", {className: "lp-ed-col-perm"});
  perm.appendChild(makeEl("span", {className: "lp-ed-badge lp-ed-badge-" + (n.kind === "perm" ? "perm" : "inh")}, n.tag));
  perm.appendChild(makeEl("code", {}, n.kind === "perm" ? n.key : n.groupName));
  row.appendChild(perm);

  const val = makeEl("div", {className: "lp-ed-col-val"});
  const valCode = makeEl("span", {className: "lp-ed-val-code " + String(n.value)}, String(n.value));
  if (n.kind === "perm") {
    valCode.title = "切换值";
    valCode.onclick = () => toggleNodeValue(n);
  } else {
    valCode.title = "继承（由所属组决定）";
  }
  val.appendChild(valCode);
  row.appendChild(val);

  const del = makeEl("div", {className: "lp-ed-col-del", title: "删除", onclick: () => deleteNodeFlow(n)}, "✕");
  row.appendChild(del);
  return row;
}

function renderAddNode(nodes) {
  const bar = makeEl("div", {className: "lp-ed-addnode"});

  if (st.selected.length > 0) {
    // 批量操作
    const batch = makeEl("div", {className: "lp-ed-batch"});
    batch.appendChild(makeEl("span", {className: "lp-ed-batch-count"}, "已选 " + st.selected.length + " 项"));
    const setTrue = makeEl("button", {}, "设为 true");
    setTrue.onclick = () => batchSetValue(true);
    batch.appendChild(setTrue);
    const setFalse = makeEl("button", {}, "设为 false");
    setFalse.onclick = () => batchSetValue(false);
    batch.appendChild(setFalse);
    const delBtn = makeEl("button", {className: "danger"}, "删除选中");
    delBtn.onclick = batchDelete;
    batch.appendChild(delBtn);
    const clear = makeEl("button", {}, "取消选择");
    clear.onclick = () => { st.selected = []; renderAll(document.getElementById("lp-section")); };
    batch.appendChild(clear);
    bar.appendChild(batch);
    return bar;
  }

  // 节点类型
  const sel = makeEl("select", {});
  sel.appendChild(makeEl("option", {value: "perm"}, "权限节点"));
  sel.appendChild(makeEl("option", {value: "inh"}, "继承节点"));
  bar.appendChild(sel);

  // 节点输入区
  const inputBox = makeEl("div", {style: "display:flex;gap:8px;align-items:center;flex:1;min-width:0;"});
  const nodeInput = makeEl("input", {className: "lp-ed-node-input", placeholder: st.current.type === "group" ? "chat.admin.kickUser 或 chat.admin.*" : "chat.admin.kickUser"});
  inputBox.appendChild(nodeInput);

  // 值切换
  const vs = makeEl("div", {className: "lp-ed-val-switch"});
  const vT = makeEl("button", {className: "lp-ed-vbtn true" + (st.addVal ? " active" : ""), onclick: () => { st.addVal = true; renderAll(document.getElementById("lp-section")); }}, "true");
  const vF = makeEl("button", {className: "lp-ed-vbtn false" + (!st.addVal ? " active" : ""), onclick: () => { st.addVal = false; renderAll(document.getElementById("lp-section")); }}, "false");
  vs.appendChild(vT); vs.appendChild(vF);
  inputBox.appendChild(vs);

  // 继承时：组选择下拉（用户继承组 or 组继承父组）
  let groupSel = null;
  if (sel.value === "inh") {
    groupSel = renderGroupSelector();
    if (groupSel) inputBox.appendChild(groupSel);
  }
  sel.onchange = () => { renderAll(document.getElementById("lp-section")); };

  bar.appendChild(inputBox);

  // 添加按钮
  const addBtn = makeEl("button", {className: "lp-ed-add-btn"}, "添加");
  addBtn.onclick = () => {
    const t = sel.value;
    if (t === "perm") addPermNode(nodeInput.value);
    else addInhNode(groupSel ? groupSel.value : "");
  };
  nodeInput.onkeydown = (e) => { if (e.key === "Enter") addBtn.click(); };
  bar.appendChild(addBtn);
  return bar;
}

function renderGroupSelector() {
  // 当前会话可继承的候选组：排除自身
  const self = st.current.name;
  const candidates = st.groups.filter(g => g.name !== self);
  if (candidates.length === 0) return null;
  const s = makeEl("select", {});
  s.appendChild(makeEl("option", {value: ""}, "选择组..."));
  for (const g of candidates) s.appendChild(makeEl("option", {value: g.name}, g.name));
  return s;
}

// ---------- 操作流程 ----------
function flashMsg(el, text, ok) {
  const msg = makeEl("div", {className: "lp-ed-msg " + (ok ? "ok" : "err")}, text);
  const wrap = document.getElementById("lp-section");
  if (wrap) wrap.insertBefore(msg, wrap.firstChild);
  setTimeout(() => msg.remove(), 2500);
}

async function runCmd(cmd, okText) {
  if (st.busy) return;
  st.busy = true;
  try {
    const d = await apiExec(cmd);
    flashMsg(null, (d && d.text) || okText || "完成", true);
    await loadLpSection();
    return true;
  } catch (e) {
    flashMsg(null, e.message, false);
    return false;
  } finally {
    st.busy = false;
  }
}

function addGroupFlow() {
  const name = prompt("新建权限组，组名（字母数字下划线连字符，1-24位）：", "");
  if (name === null) return;
  if (!NAME_RE.test(name)) { flashMsg(null, "组名仅限字母数字下划线连字符，1-24位", false); return; }
  runCmd("/lp creategroup " + name, "已创建权限组 " + name);
}

function deleteGroupFlow(name) {
  if (!confirm("确定删除权限组 " + name + " ？将同时移除所有用户对该组的引用。")) return;
  runCmd("/lp deletegroup " + name, "已删除权限组 " + name);
}

function deleteUserFlow(name) {
  if (!confirm("确定清除用户 " + name + " 的全部权限记录？（仅权限数据，聊天账号不受影响）")) return;
  runCmd("/lp user " + name + " delete", "已清除用户 " + name + " 的权限记录");
}

function toggleNodeValue(n) {
  const nv = !n.value;
  const cmd = "/lp " + st.current.type + " " + st.current.name + " permission set " + n.key + " " + nv;
  runCmd(cmd, "已设置 " + n.key + " = " + nv);
}

function deleteNodeFlow(n) {
  let cmd;
  if (n.kind === "perm") {
    cmd = "/lp " + st.current.type + " " + st.current.name + " permission unset " + n.key;
  } else {
    if (st.current.type === "group") cmd = "/lp group " + st.current.name + " parent remove " + n.groupName;
    else cmd = "/lp user " + st.current.name + " parent remove " + n.groupName;
  }
  runCmd(cmd, "已删除节点 " + n.key);
}

function addPermNode(input) {
  const raw = (input || "").trim();
  if (!raw) { flashMsg(null, "请输入权限节点", false); return; }
  // 支持多个节点（空格/逗号分隔）
  const parts = raw.split(/[\s,，]+/).filter(Boolean);
  for (const p of parts) {
    if (!validNode(p)) { flashMsg(null, "无效权限节点: " + p, false); return; }
  }
  const v = st.addVal;
  let cmd;
  if (st.current.type === "group") cmd = "/lp group " + st.current.name + " permission set " + parts[0] + " " + v;
  else cmd = "/lp user " + st.current.name + " permission set " + parts[0] + " " + v;
  if (parts.length > 1) {
    // 多条依次执行（串行）
    (async () => {
      for (const p of parts) {
        const c = "/lp " + st.current.type + " " + st.current.name + " permission set " + p + " " + v;
        const ok = await runCmd(c, "已添加 " + p);
        if (!ok) break;
      }
    })();
    return;
  }
  runCmd(cmd, "已添加 " + parts[0]);
}

function addInhNode(groupName) {
  if (!groupName) { flashMsg(null, "请选择要继承的组", false); return; }
  let cmd;
  if (st.current.type === "group") cmd = "/lp group " + st.current.name + " parent add " + groupName;
  else cmd = "/lp user " + st.current.name + " parent add " + groupName;
  runCmd(cmd, "已添加继承 " + groupName);
}

async function batchSetValue(v) {
  const sel = [...st.selected].filter(s => s.kind === "perm");
  if (sel.length === 0) { flashMsg(null, "选中的都是继承节点（继承由组决定，不可直接改值）", false); return; }
  if (!confirm("将选中的 " + sel.length + " 个权限节点设为 " + v + " ？")) return;
  for (const s of sel) {
    const cmd = "/lp " + st.current.type + " " + st.current.name + " permission set " + s.key + " " + v;
    const ok = await runCmd(cmd, "已设置 " + s.key);
    if (!ok) break;
  }
}

async function batchDelete() {
  if (!confirm("确定删除选中的 " + st.selected.length + " 个节点？")) return;
  for (const s of [...st.selected]) {
    let cmd;
    if (s.kind === "perm") cmd = "/lp " + st.current.type + " " + st.current.name + " permission unset " + s.key;
    else {
      if (st.current.type === "group") cmd = "/lp group " + st.current.name + " parent remove " + s.groupName;
      else cmd = "/lp user " + st.current.name + " parent remove " + s.groupName;
    }
    const ok = await runCmd(cmd, "已删除 " + s.key);
    if (!ok) break;
  }
}
