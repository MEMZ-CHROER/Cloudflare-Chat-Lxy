// v1.52 管理后台 Vue3 迁移 - 历史用户（superOnly）
import * as Vue from '/static/admin/vendor/vue.js';
import { store, toast, TAG_COLORS } from '/static/admin/store.js';

export default {
  name: 'HistorySection',
  setup() {
    const rows = Vue.ref([]);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    const colorKeys = Object.keys(TAG_COLORS);

    async function load() {
      loading.value = true; err.value = false;
      try {
        let [historyRes, onlineRes, tagsRes, bannedRes, ipsRes] = await Promise.all([
          fetch('/api/admin/users/history'),
          fetch('/api/admin/all-users'),
          fetch('/api/admin/tag/list'),
          fetch('/api/admin/ban/list'),
          fetch('/api/admin/user-ips')
        ]);
        const allUsers = await historyRes.json();
        const onlineData = await onlineRes.json();
        const tagsData = await tagsRes.json();
        const bannedList = await bannedRes.json();
        const ipsData = await ipsRes.json();
        let onlineSet = new Set();
        for (let users of Object.values(onlineData || {})) users.forEach(u => onlineSet.add(u));

        rows.value = (Array.isArray(allUsers) ? allUsers : []).map(user => {
          const tagInfo = tagsData[user] || {};
          return {
            user, online: onlineSet.has(user),
            tag: tagInfo.tag || '', tagColor: tagInfo.color || '',
            ip: ipsData[user] || '', banned: bannedList.includes(user),
            editing: { tag: '', color: '' }
          };
        });
      } catch (e) { err.value = true; }
      loading.value = false;
    }

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
    async function unbanUser(row) {
      if (!confirm('确定解封 ' + row.user + ' 吗？')) return;
      try {
        const r = await fetch('/api/admin/ban/remove?name=' + encodeURIComponent(row.user));
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
    return { rows, loading, err, colorKeys, TAG_COLORS, setTag, removeTag, globalKick, banUser, unbanUser, blacklistUser };
  },
  template: `
  <div class="av-page">
    <h1>🕘 历史用户</h1>
    <p class="av-sub">所有注册过的用户，含在线状态 / 标签 / 封禁管理</p>
    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="rows.length === 0" class="av-empty">暂无历史用户</div>
    <div v-else class="av-card" style="padding:8px 0">
      <div v-for="row in rows" :key="row.user" style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.06);flex-wrap:wrap">
        <span style="color:var(--accent);font-weight:600;cursor:pointer" @click="store.userModal = row.user">{{ row.user }}</span>
        <span v-if="row.ip" class="mono" style="color:var(--text-3);font-size:11px">({{ row.ip }})</span>
        <span v-if="row.tag" class="av-badge" :style="{ background: (TAG_COLORS[row.tagColor] || '#888') }">{{ row.tag }}</span>
        <span style="color:var(--green)" v-if="row.online">● 在线</span>
        <span style="color:var(--text-3)" v-else>○ 离线</span>
        <span style="flex:1"></span>
        <span v-if="row.tag" style="display:flex;gap:4px">
          <button class="av-btn sm" @click="removeTag(row)">✕标签</button>
        </span>
        <span v-else style="display:flex;gap:4px">
          <input v-model="row.editing.tag" class="av-input" placeholder="标签" maxlength="10" style="width:80px">
          <select v-model="row.editing.color" class="av-input" style="width:88px">
            <option value="">默认</option>
            <option v-for="c in colorKeys" :key="c" :value="c">{{ c }}</option>
          </select>
          <button class="av-btn sm" @click="setTag(row)">设置</button>
        </span>
        <span style="display:flex;gap:4px">
          <button v-if="!row.online" class="av-btn danger sm" @click="globalKick(row)">踢出</button>
          <button v-if="!row.banned" class="av-btn danger sm" @click="banUser(row)">封禁</button>
          <button v-else class="av-btn success sm" @click="unbanUser(row)">解封</button>
          <button class="av-btn danger sm" @click="blacklistUser(row)">拉黑</button>
        </span>
      </div>
    </div>
  </div>`
};
