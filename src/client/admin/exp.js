// 经验等级管理
import { state } from './state.js';
import { escapeHtml } from './utils.js';

export async function loadExpSection() {
  try {
    let r = await fetch("/api/admin/exp/all?key=" + encodeURIComponent(state.adminKey));
    let data = await r.json();
    renderExpTable(data);
    updateExpStats(data);
  } catch (e) {
    document.querySelector("#exp-tbody").innerHTML = '<tr><td colspan="4" style="color:#c00;text-align:center;padding:20px">加载失败</td></tr>';
  }
}

function renderExpTable(data) {
  let tbody = document.querySelector("#exp-tbody");
  let empty = document.querySelector("#exp-empty");
  let entries = Object.entries(data);
  if (entries.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  entries.sort((a, b) => {
    let lv = (b[1].level || 1) - (a[1].level || 1);
    if (lv !== 0) return lv;
    return (b[1].exp || 0) - (a[1].exp || 0);
  });
  let html = '';
  entries.forEach(([user, info]) => {
    let safeId = user.replace(/[^a-zA-Z0-9]/g, '_');
    let highlight = state.expSelectedUser === user ? ' class="pts-highlight"' : '';
    let escUser = user.replace(/'/g, "\\'");
    let exp = info.exp || 0;
    let lv = info.level || 1;
    html += '<tr' + highlight + '>' +
      '<td class="p-name">' + escapeHtml(user) + '</td>' +
      '<td class="e-level"><span class="tag-badge" style="background:#9b59b6">Lv.' + lv + '</span></td>' +
      '<td class="e-exp">' + exp + '</td>' +
      '<td class="p-actions">' +
        '<input type="number" id="exp-inline-' + safeId + '" placeholder="值" value="' + exp + '">' +
        '<button class="btn-set" onclick="setExpInline(\'' + escUser + '\')">设置</button>' +
        '<button class="btn-add" onclick="addExpInline(\'' + escUser + '\')">+增加</button>' +
        '<button class="btn-deduct" onclick="deductExpInline(\'' + escUser + '\')">-扣除</button>' +
      '</td>' +
    '</tr>';
  });
  tbody.innerHTML = html;
}

function updateExpStats(data) {
  let entries = Object.entries(data);
  let total = 0;
  let maxLv = 1;
  for (let [, info] of entries) {
    total += info.exp || 0;
    if ((info.level || 1) > maxLv) maxLv = info.level;
  }
  document.querySelector("#exp-stats").textContent = '共 ' + entries.length + ' 人，总经验 ' + total + '，最高 Lv.' + maxLv;
}

export function searchExpUser() {
  let name = document.querySelector("#exp-tb-user").value.trim();
  if (!name) return;
  selectExpUser(name);
}

function selectExpUser(name) {
  state.expSelectedUser = name;
  let infoDiv = document.querySelector("#exp-user-info");
  infoDiv.style.display = 'flex';
  document.querySelector("#exp-info-user").textContent = name;
  let rows = document.querySelector("#exp-tbody").querySelectorAll("tr");
  let found = false;
  rows.forEach(row => {
    let firstTd = row.querySelector("td");
    if (firstTd && firstTd.textContent === name) {
      let expTd = row.querySelector(".e-exp");
      let lvTd = row.querySelector(".e-level");
      if (expTd) document.querySelector("#exp-info-exp").textContent = expTd.textContent;
      if (lvTd) document.querySelector("#exp-info-level").textContent = lvTd.textContent.trim();
      found = true;
    }
  });
  if (!found) {
    document.querySelector("#exp-info-exp").textContent = '0（暂无经验记录）';
    document.querySelector("#exp-info-level").textContent = 'Lv.1';
  }
  document.querySelector("#exp-tb-user").value = name;
  loadExpSection();
}

export async function setExpToolbar() {
  let name = document.querySelector("#exp-tb-user").value.trim();
  let raw = document.querySelector("#exp-tb-amt").value;
  if (!name) { alert("请输入用户名"); return; }
  if (!raw || isNaN(Number(raw))) { alert("请输入有效经验值"); return; }
  await callExpApi('set', name, raw);
}

export async function addExpToolbar() {
  let name = document.querySelector("#exp-tb-user").value.trim();
  let raw = document.querySelector("#exp-tb-amt").value;
  if (!name) { alert("请输入用户名"); return; }
  if (!raw || isNaN(Number(raw)) || Number(raw) <= 0) { alert("请输入有效的增加数量"); return; }
  await callExpApi('add', name, raw);
}

export async function deductExpToolbar() {
  let name = document.querySelector("#exp-tb-user").value.trim();
  let raw = document.querySelector("#exp-tb-amt").value;
  if (!name) { alert("请输入用户名"); return; }
  if (!raw || isNaN(Number(raw)) || Number(raw) <= 0) { alert("请输入有效的扣除数量"); return; }
  await callExpApi('add', name, '-' + raw);
}

export async function setExpInline(user) {
  let safeId = user.replace(/[^a-zA-Z0-9]/g, '_');
  let input = document.querySelector("#exp-inline-" + safeId);
  if (!input) return;
  let raw = input.value;
  if (!raw || isNaN(Number(raw))) { alert("请输入有效经验值"); return; }
  await callExpApi('set', user, raw);
}

export async function addExpInline(user) {
  let safeId = user.replace(/[^a-zA-Z0-9]/g, '_');
  let input = document.querySelector("#exp-inline-" + safeId);
  if (!input) return;
  let raw = input.value;
  if (!raw || isNaN(Number(raw)) || Number(raw) <= 0) { alert("请输入有效的增加数量"); return; }
  await callExpApi('add', user, raw);
}

export async function deductExpInline(user) {
  let safeId = user.replace(/[^a-zA-Z0-9]/g, '_');
  let input = document.querySelector("#exp-inline-" + safeId);
  if (!input) return;
  let raw = input.value;
  if (!raw || isNaN(Number(raw)) || Number(raw) <= 0) { alert("请输入有效的扣除数量"); return; }
  await callExpApi('add', user, '-' + raw);
}

async function callExpApi(action, name, amount) {
  try {
    let url;
    if (action === 'set') {
      url = "/api/admin/exp/set?key=" + encodeURIComponent(state.adminKey) + "&name=" + encodeURIComponent(name) + "&exp=" + encodeURIComponent(String(amount));
    } else {
      url = "/api/admin/exp/add?key=" + encodeURIComponent(state.adminKey) + "&name=" + encodeURIComponent(name) + "&amount=" + encodeURIComponent(String(amount));
    }
    let r = await fetch(url);
    let t = await r.text();
    let msg = t;
    try {
      let j = JSON.parse(t);
      if (r.ok) {
        msg = "已" + (action === 'set' ? '设置' : (Number(amount) > 0 ? '增加' : '扣除')) + " " + name + " 经验为 " + j.exp + "（Lv." + j.level + "）";
        if (j.achievements && j.achievements.length) msg += "；新成就解锁：" + j.achievements.join("、");
      } else {
        msg = j.error || t;
      }
    } catch (e) {}
    alert(msg);
    state.expSelectedUser = name;
    await loadExpSection();
    selectExpUser(name);
  } catch (e) {
    alert("操作失败: " + e.message);
  }
}

// 工具栏 Enter 键支持
(function() {
  function initExpEvents() {
    var userInput = document.querySelector("#exp-tb-user");
    var amtInput = document.querySelector("#exp-tb-amt");
    if (userInput) {
      userInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") searchExpUser();
      });
    }
    if (amtInput) {
      amtInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") setExpToolbar();
      });
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initExpEvents);
  } else {
    initExpEvents();
  }
})();
