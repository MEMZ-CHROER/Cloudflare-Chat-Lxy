// v1.52 管理后台 Vue3 迁移 - 积分管理（最复杂范式：搜索/行内增减/批量/CSV导出）
import * as Vue from '/static/admin/vendor/vue.js';
import { store, toast } from '/static/admin/store.js';

export default {
  name: 'PointsSection',
  setup() {
    const rows = Vue.ref([]);                 // [{name, pts, val}]
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    const searchTerm = Vue.ref('');
    const toolbarAmt = Vue.ref('');
    const batchAmt = Vue.ref('');
    const checked = Vue.reactive(new Set());  // 勾选用户集合
    const selectedUser = Vue.ref(null);       // 信息面板选中的用户

    const sortedRows = Vue.computed(() => [...rows.value].sort((a, b) => cmpBig(b.pts, a.pts)));
    const allChecked = Vue.computed(() => sortedRows.value.length > 0 && sortedRows.value.every(r => checked.has(r.name)));
    const selectedCount = Vue.computed(() => checked.size);
    const stats = Vue.computed(() => {
      let total = 0n;
      for (const r of rows.value) { try { total += BigInt(String(r.pts)); } catch {} }
      return { count: rows.value.length, total: String(total) };
    });
    const selectedPts = Vue.computed(() => {
      if (!selectedUser.value) return '';
      const r = rows.value.find(x => x.name === selectedUser.value);
      return r ? r.pts : '0（暂无积分记录）';
    });

    function cmpBig(a, b) {
      let ai = 0n, bi = 0n;
      try { ai = BigInt(String(a)); } catch {}
      try { bi = BigInt(String(b)); } catch {}
      return ai < bi ? -1 : ai > bi ? 1 : 0;
    }

    async function load() {
      loading.value = true; err.value = false;
      try {
        const r = await fetch("/api/admin/points/all");
        const data = await r.json();
        rows.value = Object.entries(data || {}).map(([name, pts]) => ({ name, pts: String(pts), val: String(pts) }));
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    function search() {
      const name = searchTerm.value.trim();
      if (!name) { toast('请输入用户名', 'warn'); return; }
      selectedUser.value = name;
      // 若用户已在列表，跳高亮；否则信息面板显示 0（暂无积分记录）
      toast('已定位 ' + name);
    }

    async function callPointsApi(action, name, amount) {
      try {
        const r = await fetch(`/api/admin/points/${action}?name=${encodeURIComponent(name)}&amount=${encodeURIComponent(String(amount))}`);
        const t = await r.text();
        toast(t);
        selectedUser.value = name;
        let newPoints = null;
        const m = t.match(/当前\s*(-?\d+)/);
        if (m) newPoints = m[1];
        else if (action === 'set') newPoints = String(amount);
        if (newPoints !== null) {
          const row = rows.value.find(x => x.name === name);
          if (row) { row.pts = newPoints; row.val = newPoints; }
        } else {
          await load();
        }
      } catch (e) { toast('操作失败: ' + e.message, 'err'); }
    }

    // 工具栏操作
    function setToolbar() {
      const name = searchTerm.value.trim();
      const raw = toolbarAmt.value;
      if (!name) { toast('请输入用户名', 'warn'); return; }
      if (!raw || isNaN(Number(raw))) { toast('请输入有效积分值', 'warn'); return; }
      callPointsApi('set', name, raw);
    }
    function addToolbar() {
      const name = searchTerm.value.trim();
      const raw = toolbarAmt.value;
      if (!name) { toast('请输入用户名', 'warn'); return; }
      if (!raw || isNaN(Number(raw)) || Number(raw) <= 0) { toast('请输入有效的增加数量', 'warn'); return; }
      callPointsApi('add', name, raw);
    }
    function deductToolbar() {
      const name = searchTerm.value.trim();
      const raw = toolbarAmt.value;
      if (!name) { toast('请输入用户名', 'warn'); return; }
      if (!raw || isNaN(Number(raw)) || Number(raw) <= 0) { toast('请输入有效的扣除数量', 'warn'); return; }
      callPointsApi('add', name, '-' + raw);
    }

    // 行内操作
    function setInline(row) {
      const raw = row.val;
      if (!raw || isNaN(Number(raw))) { toast('请输入有效积分值', 'warn'); return; }
      callPointsApi('set', row.name, raw);
    }
    function addInline(row) {
      const raw = row.val;
      if (!raw || isNaN(Number(raw)) || Number(raw) <= 0) { toast('请输入有效的增加数量', 'warn'); return; }
      callPointsApi('add', row.name, raw);
    }
    function deductInline(row) {
      const raw = row.val;
      if (!raw || isNaN(Number(raw)) || Number(raw) <= 0) { toast('请输入有效的扣除数量', 'warn'); return; }
      callPointsApi('add', row.name, '-' + raw);
    }

    // 勾选 / 批量
    function toggleAll() {
      const on = !allChecked.value;
      if (on) sortedRows.value.forEach(r => checked.add(r.name));
      else checked.clear();
    }
    function toggleRow(name) {
      if (checked.has(name)) checked.delete(name);
      else checked.add(name);
    }
    function doBatch(amount) {
      if (checked.size === 0) { toast('请先勾选要操作的用户', 'warn'); return; }
      const names = [...checked];
      if (!confirm(`确定为 ${names.length} 个用户${Number(amount) >= 0 ? '增加' : '扣除'} ${Math.abs(Number(amount))} 积分吗？`)) return;
      fetch(`/api/admin/points/batch?names=${encodeURIComponent(names.join(','))}&amount=${amount}&action=add`)
        .then(r => r.text())
        .then(t => { toast(t); checked.clear(); load(); })
        .catch(e => toast('操作失败: ' + e.message, 'err'));
    }
    function batchAdd() {
      const raw = batchAmt.value;
      if (!raw || isNaN(Number(raw)) || Number(raw) <= 0) { toast('请输入有效的增加数量', 'warn'); return; }
      doBatch(raw);
    }
    function batchDeduct() {
      const raw = batchAmt.value;
      if (!raw || isNaN(Number(raw)) || Number(raw) <= 0) { toast('请输入有效的扣除数量', 'warn'); return; }
      doBatch('-' + raw);
    }

    function exportCSV() {
      if (sortedRows.value.length === 0) { toast('暂无积分数据可导出', 'warn'); return; }
      let csv = "﻿用户名,积分\n";
      sortedRows.value.forEach(r => { csv += r.name + "," + r.pts + "\n"; });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "积分数据_" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    Vue.onMounted(load);
    // 从用户弹窗「管理积分」跳转：预填搜索框并选中
    Vue.watch(() => store.ptsFocus, (v) => {
      if (v) { searchTerm.value = v; selectedUser.value = v; store.ptsFocus = null; }
    });

    return { rows, sortedRows, loading, err, searchTerm, toolbarAmt, batchAmt, checked, allChecked, selectedCount, selectedUser, selectedPts, stats,
      load, search, setToolbar, addToolbar, deductToolbar, setInline, addInline, deductInline,
      toggleAll, toggleRow, batchAdd, batchDeduct, exportCSV };
  },
  template: `
  <div class="av-page">
    <h1>💰 积分管理</h1>
    <p class="av-sub">共 {{ stats.count }} 人，总积分 <span class="mono">{{ stats.total }}</span></p>

    <div class="av-card" style="padding:14px 16px;margin-bottom:16px">
      <div class="av-toolbar">
        <input v-model="searchTerm" class="av-input" placeholder="用户名" style="width:170px" @keydown.enter="search" />
        <input v-model="toolbarAmt" class="av-input" placeholder="积分值" style="width:110px" type="number" @keydown.enter="setToolbar" />
        <button class="av-btn" @click="search">🔍 搜索</button>
        <button class="av-btn" @click="setToolbar">设置</button>
        <button class="av-btn success" @click="addToolbar">+增加</button>
        <button class="av-btn danger" @click="deductToolbar">-扣除</button>
        <span style="flex:1"></span>
        <button class="av-btn" @click="exportCSV">⬇ 导出CSV</button>
      </div>
      <div v-if="selectedUser" class="pts-user-info" style="margin-top:10px;font-size:13px;color:var(--text-2)">
        已选：<span class="mono" style="color:var(--accent);font-weight:600">{{ selectedUser }}</span>
        <span style="margin:0 8px">·</span>积分 <span class="mono" style="color:var(--orange);font-weight:700">{{ selectedPts }}</span>
      </div>
    </div>

    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="sortedRows.length === 0" class="av-empty">暂无积分数据</div>
    <div v-else class="av-table-wrap">
      <table class="av-table">
        <thead>
          <tr>
            <th style="width:36px"><input type="checkbox" :checked="allChecked" @change="toggleAll"></th>
            <th>用户名</th><th>积分</th><th>行内操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in sortedRows" :key="r.name" :class="{ 'av-row-hl': r.name === selectedUser }">
            <td><input type="checkbox" :checked="checked.has(r.name)" @change="toggleRow(r.name)"></td>
            <td class="mono" style="cursor:pointer;color:var(--accent)" @click="selectedUser = r.name">{{ r.name }}</td>
            <td class="mono" style="color:var(--orange);font-weight:600">{{ r.pts }}</td>
            <td>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                <input v-model="r.val" type="number" class="av-input" style="width:100px">
                <button class="av-btn sm" @click="setInline(r)">设置</button>
                <button class="av-btn sm success" @click="addInline(r)">+增加</button>
                <button class="av-btn sm danger" @click="deductInline(r)">-扣除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="av-card" style="padding:14px 16px;margin-top:16px">
      <div class="av-toolbar">
        <span style="color:var(--text-2);font-size:13px">已勾选 <b class="mono" style="color:var(--accent)">{{ selectedCount }}</b> 人</span>
        <input v-model="batchAmt" class="av-input" placeholder="批量数量" style="width:110px" type="number">
        <button class="av-btn success" @click="batchAdd">批量增加</button>
        <button class="av-btn danger" @click="batchDeduct">批量扣除</button>
      </div>
    </div>
  </div>`
};
