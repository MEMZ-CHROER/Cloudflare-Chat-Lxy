// v1.52 管理后台 Vue3 迁移 - 同IP分组检测（superOnly）
import * as Vue from '/static/admin/vendor/vue.js';
import { store, toast, TAG_COLORS } from '/static/admin/store.js';

export default {
  name: 'IpGroupSection',
  setup() {
    const groups = Vue.ref([]);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    const search = Vue.ref('');
    const expanded = Vue.ref('');   // 当前展开的 IP（单开）
    const statsText = Vue.ref('');

    async function load() {
      loading.value = true; err.value = false;
      try {
        const [ipsRes, pointsRes, onlineRes, tagsRes, bannedRes] = await Promise.all([
          fetch('/api/admin/user-ips'),
          fetch('/api/admin/points/all'),
          fetch('/api/admin/all-users'),
          fetch('/api/admin/tag/list'),
          fetch('/api/admin/ban/list')
        ]);
        const ipsData = await ipsRes.json();
        const pointsData = await pointsRes.json();
        const onlineData = await onlineRes.json();
        const tagsData = await tagsRes.json();
        const bannedList = Array.isArray(await bannedRes.json()) ? await bannedRes.json() : [];

        // 在线集合：{room: [users]}
        const onlineSet = new Set();
        for (const users of Object.values(onlineData || {})) {
          users.forEach(u => onlineSet.add(u));
        }
        const bannedSet = new Set(bannedList);

        // 按 IP 分组
        const ipToUsers = {};
        for (const [user, ip] of Object.entries(ipsData || {})) {
          if (!ip) continue;
          if (!ipToUsers[ip]) ipToUsers[ip] = [];
          ipToUsers[ip].push(user);
        }

        const entries = Object.entries(ipToUsers).sort((a, b) => b[1].length - a[1].length);
        const multiCount = entries.filter(([, users]) => users.length > 1).length;
        statsText.value = entries.length ? '共 ' + entries.length + ' 个IP，其中 ' + multiCount + ' 个IP有多个用户' : '';

        groups.value = entries.map(([ip, users]) => {
          const rows = users.map(u => ({
            user: u,
            online: onlineSet.has(u),
            pts: pointsData[u] || 0,
            tag: (tagsData[u] && tagsData[u].tag) || '',
            tagColor: (tagsData[u] && tagsData[u].color) || '',
            banned: bannedSet.has(u)
          }));
          rows.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
          const onlineCount = rows.filter(r => r.online).length;
          const totalPts = rows.reduce((s, r) => s + (r.pts || 0), 0);
          return { ip, rows, onlineCount, totalPts };
        });
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    const filtered = Vue.computed(() => {
      const q = search.value.trim().toLowerCase();
      if (!q) return groups.value;
      return groups.value.filter(g => g.ip.toLowerCase().includes(q) || g.rows.some(r => r.user.toLowerCase().includes(q)));
    });

    function toggle(ip) { expanded.value = expanded.value === ip ? '' : ip; }

    function showUser(u) { store.userModal = u; }

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

    Vue.onMounted(load);
    return { groups, filtered, loading, err, search, expanded, statsText, TAG_COLORS, toggle, showUser, globalKick, banUser, unbanUser };
  },
  template: `
  <div class="av-page">
    <h1>🌐 同IP分组</h1>
    <p class="av-sub">按来源IP聚合用户，发现多账号 / 小号行为</p>
    <div class="av-card" style="padding:14px 16px;margin-bottom:16px">
      <div class="av-toolbar">
        <input v-model="search" class="av-input" placeholder="搜索 IP 或用户名" style="width:220px" />
        <span style="color:var(--text-3);font-size:12px">展开后可管理用户</span>
        <span style="flex:1"></span>
        <span style="color:var(--text-2);font-size:13px">{{ statsText }}</span>
      </div>
    </div>
    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="filtered.length === 0" class="av-empty">暂无IP数据</div>
    <div v-else>
      <div v-for="g in filtered" :key="g.ip" class="av-card" style="padding:0;margin-bottom:10px;overflow:hidden">
        <div class="ipg-ip-header" style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;cursor:pointer;user-select:none" @click="toggle(g.ip)">
          <span class="mono" style="color:var(--accent);font-weight:700">{{ g.ip }}</span>
          <span style="display:flex;align-items:center;gap:10px">
            <span style="color:var(--text-2);font-size:12px">{{ g.rows.length }} 人 · {{ g.onlineCount }} 在线 · <span class="mono" style="color:var(--orange)">{{ g.totalPts }}</span> 积分</span>
            <span style="color:var(--text-3);font-size:10px;transition:transform .15s" :style="{ transform: expanded === g.ip ? 'rotate(90deg)' : 'none' }">▶</span>
          </span>
        </div>
        <div v-if="expanded === g.ip" style="border-top:1px solid rgba(255,255,255,.07)">
          <div v-for="row in g.rows" :key="row.user" style="display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid rgba(255,255,255,.05);flex-wrap:wrap">
            <span :style="{ color: row.online ? 'var(--green)' : 'var(--text-3)', fontSize: '12px' }">{{ row.online ? '●' : '○' }}</span>
            <span style="cursor:pointer;color:var(--accent);font-weight:600" @click="showUser(row.user)">{{ row.user }}</span>
            <span v-if="row.tag" class="av-badge" :style="{ background: (TAG_COLORS[row.tagColor] || '#888') }">{{ row.tag }}</span>
            <span v-if="row.banned" class="av-badge" style="background:rgba(255,107,107,.15);color:#ff6b6b">已封禁</span>
            <span class="mono" style="color:var(--text-3);font-size:12px">{{ row.pts }} 积分</span>
            <span style="flex:1"></span>
            <span style="display:flex;gap:4px">
              <button class="av-btn sm" @click="showUser(row.user)">详情</button>
              <button v-if="row.online" class="av-btn danger sm" @click="globalKick(row)">踢出</button>
              <button v-if="row.banned" class="av-btn success sm" @click="unbanUser(row)">解封</button>
              <button v-else class="av-btn danger sm" @click="banUser(row)">封禁</button>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>`
};
