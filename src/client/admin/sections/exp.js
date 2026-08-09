// v1.52 管理后台 Vue3 迁移 - 经验等级管理（superOnly）
import * as Vue from '/static/admin/vendor/vue.js';
import { toast } from '/static/admin/store.js';

export default {
  name: 'ExpSection',
  setup() {
    const rows = Vue.ref([]);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    const statsText = Vue.ref('');
    const selected = Vue.ref('');
    const tbUser = Vue.ref('');
    const tbAmt = Vue.ref('');
    const selInfo = Vue.reactive({ user: '', exp: '', level: '' });

    async function load() {
      loading.value = true; err.value = false;
      try {
        const r = await fetch('/api/admin/exp/all');
        const data = await r.json();
        const entries = Object.entries(data || {});
        entries.sort((a, b) => (b[1].level || 1) - (a[1].level || 1) || (b[1].exp || 0) - (a[1].exp || 0));
        rows.value = entries.map(([user, info]) => ({ user, exp: info.exp || 0, level: info.level || 1, input: String(info.exp || 0) }));
        let total = 0, maxLv = 1;
        for (const [, info] of entries) { total += info.exp || 0; if ((info.level || 1) > maxLv) maxLv = info.level; }
        statsText.value = '共 ' + entries.length + ' 人，总经验 ' + total + '，最高 Lv.' + maxLv;
        refreshSelInfo();
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    function refreshSelInfo() {
      if (!selected.value) return;
      selInfo.user = selected.value;
      const row = rows.value.find(r => r.user === selected.value);
      if (row) { selInfo.exp = String(row.exp); selInfo.level = 'Lv.' + row.level; }
      else { selInfo.exp = '0（暂无经验记录）'; selInfo.level = 'Lv.1'; }
    }

    function search() {
      const name = tbUser.value.trim();
      if (!name) { toast('请输入用户名', 'warn'); return; }
      selected.value = name;
      refreshSelInfo();
      load();
    }
    function selectRow(user) {
      selected.value = user;
      refreshSelInfo();
    }

    function validAmt(v, positive) {
      const n = Number(v);
      if (isNaN(n)) return null;
      if (positive && n <= 0) return null;
      return n;
    }

    async function callApi(action, name, amount) {
      try {
        const url = action === 'set'
          ? '/api/admin/exp/set?name=' + encodeURIComponent(name) + '&exp=' + encodeURIComponent(String(amount))
          : '/api/admin/exp/add?name=' + encodeURIComponent(name) + '&amount=' + encodeURIComponent(String(amount));
        const r = await fetch(url);
        const t = await r.text();
        let msg = t;
        try {
          const j = JSON.parse(t);
          if (r.ok) {
            msg = '已' + (action === 'set' ? '设置' : (Number(amount) > 0 ? '增加' : '扣除')) + ' ' + name + ' 经验为 ' + j.exp + '（Lv.' + j.level + '）';
            if (j.achievements && j.achievements.length) msg += '；新成就解锁：' + j.achievements.join('、');
          } else { msg = j.error || t; }
        } catch (e) {}
        toast(msg, r.ok ? 'ok' : 'err');
        selected.value = name;
        await load();
        refreshSelInfo();
      } catch (e) { toast('操作失败: ' + e.message, 'err'); }
    }

    function setToolbar() {
      const name = tbUser.value.trim();
      if (!name) { toast('请输入用户名', 'warn'); return; }
      const amt = validAmt(tbAmt.value, false);
      if (amt === null) { toast('请输入有效经验值', 'warn'); return; }
      callApi('set', name, amt);
    }
    function addToolbar() {
      const name = tbUser.value.trim();
      if (!name) { toast('请输入用户名', 'warn'); return; }
      const amt = validAmt(tbAmt.value, true);
      if (amt === null) { toast('请输入有效的增加数量', 'warn'); return; }
      callApi('add', name, amt);
    }
    function deductToolbar() {
      const name = tbUser.value.trim();
      if (!name) { toast('请输入用户名', 'warn'); return; }
      const amt = validAmt(tbAmt.value, true);
      if (amt === null) { toast('请输入有效的扣除数量', 'warn'); return; }
      callApi('add', name, -amt);
    }
    function setInline(row) {
      const amt = validAmt(row.input, false);
      if (amt === null) { toast('请输入有效经验值', 'warn'); return; }
      callApi('set', row.user, amt);
    }
    function addInline(row) {
      const amt = validAmt(row.input, true);
      if (amt === null) { toast('请输入有效的增加数量', 'warn'); return; }
      callApi('add', row.user, amt);
    }
    function deductInline(row) {
      const amt = validAmt(row.input, true);
      if (amt === null) { toast('请输入有效的扣除数量', 'warn'); return; }
      callApi('add', row.user, -amt);
    }

    Vue.onMounted(load);
    return { rows, loading, err, statsText, selected, tbUser, tbAmt, selInfo, search, selectRow, setToolbar, addToolbar, deductToolbar, setInline, addInline, deductInline };
  },
  template: `
  <div class="av-page">
    <h1>⚡ 经验等级</h1>
    <p class="av-sub">管理用户经验与等级，加减经验可能触发成就解锁</p>
    <div class="av-card" style="padding:14px 16px;margin-bottom:16px">
      <div class="av-toolbar">
        <input v-model="tbUser" class="av-input" placeholder="用户名" style="width:150px" @keydown.enter="search" />
        <input v-model="tbAmt" class="av-input" placeholder="数量" type="number" style="width:90px" @keydown.enter="setToolbar" />
        <button class="av-btn" @click="search">搜索</button>
        <button class="av-btn success sm" @click="setToolbar">设置</button>
        <button class="av-btn sm" @click="addToolbar">+增加</button>
        <button class="av-btn danger sm" @click="deductToolbar">-扣除</button>
        <span style="flex:1"></span>
        <span style="color:var(--text-2);font-size:13px">{{ statsText }}</span>
      </div>
    </div>
    <div v-if="selected" class="av-card" style="padding:12px 16px;margin-bottom:16px;display:flex;gap:18px;align-items:center;border-left:3px solid var(--accent)">
      <span style="color:var(--accent);font-weight:700">{{ selInfo.user }}</span>
      <span style="color:var(--text-2);font-size:13px">经验 <b style="color:var(--text)">{{ selInfo.exp }}</b></span>
      <span style="color:var(--text-2);font-size:13px">等级 <b style="color:var(--text)">{{ selInfo.level }}</b></span>
    </div>
    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="rows.length === 0" class="av-empty">暂无经验数据</div>
    <div v-else class="av-table-wrap">
      <table class="av-table">
        <thead><tr><th>用户</th><th>等级</th><th>经验</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.user" :class="{ 'av-row-hl': selected === row.user }">
            <td class="mono" style="color:var(--accent);cursor:pointer" @click="selectRow(row.user)">{{ row.user }}</td>
            <td><span class="av-badge" style="background:#9b59b6">Lv.{{ row.level }}</span></td>
            <td class="mono" style="color:var(--orange)">{{ row.exp }}</td>
            <td style="display:flex;gap:4px">
              <input v-model="row.input" class="av-input" type="number" placeholder="值" style="width:76px" />
              <button class="av-btn success sm" @click="setInline(row)">设置</button>
              <button class="av-btn sm" @click="addInline(row)">+增加</button>
              <button class="av-btn danger sm" @click="deductInline(row)">-扣除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>`
};
