// v1.52 管理后台 Vue3 迁移 - 在线用户（标签/等级/积分/匿名券/全局踢/封禁/拉黑，superOnly）
import * as Vue from '/static/admin/vendor/vue.js';
import { store, toast, TAG_COLORS } from '/static/admin/store.js';

export default {
  name: 'UsersSection',
  setup() {
    const rows = Vue.ref([]);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    const colorKeys = Object.keys(TAG_COLORS);

    async function load() {
      loading.value = true; err.value = false;
      try {
        let [usersRes, tagsRes, ipsRes, pointsRes, expRes] = await Promise.all([
          fetch('/api/admin/all-users'),
          fetch('/api/admin/tag/list'),
          fetch('/api/admin/user-ips'),
          fetch('/api/admin/points/all'),
          fetch('/api/admin/exp/all')
        ]);
        const data = await usersRes.json();
        const tagsData = await tagsRes.json();
        const ipsData = await ipsRes.json();
        const pointsData = await pointsRes.json();
        const expData = await expRes.json();

        let userRooms = {};
        for (let [room, users] of Object.entries(data || {})) users.forEach(u => { if (!userRooms[u]) userRooms[u] = []; userRooms[u].push(room); });

        rows.value = Object.entries(userRooms).map(([user, rooms]) => {
          const tagInfo = tagsData[user] || {};
          return {
            user, rooms,
            tag: tagInfo.tag || '', tagColor: tagInfo.color || '',
            ip: ipsData[user] || '', pts: pointsData[user] || 0,
            expInfo: expData[user] || { exp: 0, level: 1 },
            editing: { tag: '', color: '' }, ptsInput: ''
          };
        });
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    function showUser(u) { store.userModal = u; }

    async function setTag(row) {
      const tag = (row.editing.tag || '').trim();
      if (!tag) { toast('请输入标签', 'warn'); return; }
      try {
        const r = await fetch('/api/admin/tag/set?name=' + encodeURIComponent(row.user) + '&tag=' + encodeURIComponent(tag) + '&color=' + encodeURIComponent(row.editing.color || ''));
        toast(await r.text());
        await load();
      } catch (e) { toast('操作失败', 'err'); }
    }
    async function removeTag(row) {
      try {
        const r = await fetch('/api/admin/tag/remove?name=' + encodeURIComponent(row.user));
        toast(await r.text());
        await load();
      } catch (e) { toast('操作失败', 'err'); }
    }

    async function setPoints(row) {
      const amt = parseInt(row.ptsInput, 10);
      if (isNaN(amt)) { toast('请输入有效积分数量', 'warn'); return; }
      try {
        const r = await fetch('/api/admin/points/set?name=' + encodeURIComponent(row.user) + '&amount=' + amt);
        toast(await r.text());
        row.ptsInput = '';
        await load();
      } catch (e) { toast('操作失败: ' + e.message, 'err'); }
    }

    async function grantAnon(row) {
      const count = prompt('给 ' + row.user + ' 发放几张匿名券？', '1');
      if (count === null) return;
      const n = parseInt(count, 10);
      if (isNaN(n) || n < 1 || n > 1000) { toast('请输入 1-1000 之间的数量', 'warn'); return; }
      try {
        const r = await fetch('/api/admin/anon-grant?name=' + encodeURIComponent(row.user) + '&count=' + n);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        toast('已给 ' + row.user + ' 发放 ' + n + ' 张匿名券，当前共 ' + data.anonCoupons + ' 张');
      } catch (e) { toast('操作失败: ' + e.message, 'err'); }
    }

    async function globalKick(row) {
      if (!confirm('确定将 ' + row.user + ' 从所有房间踢出吗？')) return;
      try {
        const r = await fetch('/api/admin/global-kick?name=' + encodeURIComponent(row.user));
        const data = await r.json();
        toast('已从 ' + data.kickedFrom.length + ' 个房间踢出 ' + row.user);
        await load();
      } catch (e) { toast('操作失败', 'err'); }
    }

    async function banUser(row) {
      if (!confirm('确定封禁 ' + row.user + ' 吗？')) return;
      try {
        await fetch('/api/admin/global-kick?name=' + encodeURIComponent(row.user));
        const r = await fetch('/api/admin/ban/add?name=' + encodeURIComponent(row.user));
        toast(await r.text());
        await load();
      } catch (e) { toast('操作失败', 'err'); }
    }

    async function blacklistUser(row) {
      if (!confirm('确定将 ' + row.user + ' 加入全局黑名单吗？')) return;
      try {
        const r = await fetch('/api/admin/global-blacklist/add?name=' + encodeURIComponent(row.user));
        toast(await r.text());
        await load();
      } catch (e) { toast('操作失败', 'err'); }
    }

    Vue.onMounted(load);
    return { rows, loading, err, colorKeys, TAG_COLORS, showUser, setTag, removeTag, setPoints, grantAnon, globalKick, banUser, blacklistUser };
  },
  template: `
  <div class="av-page">
    <h1>👥 在线用户</h1>
    <p class="av-sub">当前所有在线用户，可管理标签 / 积分 / 匿名券 / 踢出 / 封禁</p>
    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="rows.length === 0" class="av-empty">暂无在线用户</div>
    <div v-else class="av-card" style="padding:8px 0">
      <div v-for="row in rows" :key="row.user" class="global-user-item" style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.06);flex-wrap:wrap">
        <span style="cursor:pointer;color:var(--accent);font-weight:600" @click="showUser(row.user)">{{ row.user }}</span>
        <span v-if="row.ip" class="mono" style="color:var(--text-3);font-size:11px">({{ row.ip }})</span>
        <span class="av-badge" style="background:#9b59b6" :title="'等级 ' + (row.expInfo.level || 1) + ' / 经验 ' + (row.expInfo.exp || 0)">Lv.{{ row.expInfo.level || 1 }}</span>
        <span v-if="row.tag" class="av-badge" :style="{ background: (TAG_COLORS[row.tagColor] || '#888') }">{{ row.tag }}</span>
        <span style="color:var(--text-3);font-size:12px">房间: <span class="mono">{{ row.rooms.map(r => '#' + r).join(', ') }}</span></span>
        <span style="flex:1"></span>

        <span style="display:flex;align-items:center;gap:6px">
          <span style="color:var(--orange);font-weight:700" class="mono">{{ row.pts }}</span>
          <input v-model="row.ptsInput" class="av-input" placeholder="积分" type="number" style="width:70px">
          <button class="av-btn sm" @click="setPoints(row)">设置</button>
        </span>
        <span v-if="row.tag" style="display:flex;align-items:center;gap:4px">
          <button class="av-btn sm" @click="removeTag(row)">✕标签</button>
        </span>
        <span v-else style="display:flex;align-items:center;gap:4px">
          <input v-model="row.editing.tag" class="av-input" placeholder="标签" maxlength="10" style="width:80px">
          <select v-model="row.editing.color" class="av-input" style="width:88px">
            <option value="">默认</option>
            <option v-for="c in colorKeys" :key="c" :value="c">{{ c }}</option>
          </select>
          <button class="av-btn sm" @click="setTag(row)">设置</button>
        </span>

        <span style="display:flex;align-items:center;gap:4px">
          <button class="av-btn sm" title="发放匿名券" @click="grantAnon(row)">🕶️发券</button>
          <button class="av-btn danger sm" @click="globalKick(row)">全局踢出</button>
          <button class="av-btn danger sm" @click="banUser(row)">封禁</button>
          <button class="av-btn danger sm" @click="blacklistUser(row)">拉黑</button>
        </span>
      </div>
    </div>
  </div>`
};
