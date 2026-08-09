// v1.52 管理后台 Vue3 迁移 - 用户标签（全部注册用户拥有的装扮商品，普通 admin 可见）
import * as Vue from '/static/admin/vendor/vue.js';
import { TAG_COLORS } from '/static/admin/store.js';

export default {
  name: 'TagsSection',
  setup() {
    const rows = Vue.ref([]);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    const search = Vue.ref('');
    const statsText = Vue.ref('');

    const filtered = Vue.computed(() => {
      const q = search.value.toLowerCase().trim();
      return q ? rows.value.filter(u => (u.username || '').toLowerCase().includes(q)) : rows.value;
    });

    async function load() {
      loading.value = true; err.value = false;
      try {
        const r = await fetch('/api/admin/user-tags');
        const data = await r.json();
        rows.value = Array.isArray(data) ? data : [];
        statsText.value = '共 ' + rows.value.length + ' 人拥有商品';
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    Vue.onMounted(load);
    return { rows, filtered, loading, err, search, statsText, TAG_COLORS };
  },
  template: `
  <div class="av-page">
    <h1>🏷️ 用户标签</h1>
    <p class="av-sub">全部注册用户拥有的装扮商品（当前装备 / 全部物品）</p>
    <div class="av-card" style="padding:14px 16px;margin-bottom:16px">
      <div class="av-toolbar">
        <input v-model="search" class="av-input" placeholder="搜索用户名" style="width:220px" />
        <span style="color:var(--text-2);font-size:13px">{{ statsText }}</span>
      </div>
    </div>
    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="filtered.length === 0" class="av-empty">暂无数据</div>
    <div v-else class="av-table-wrap">
      <table class="av-table">
        <thead>
          <tr><th>用户名</th><th>当前标签</th><th>颜色</th><th>装备物品</th><th>全部物品</th></tr>
        </thead>
        <tbody>
          <tr v-for="u in filtered" :key="u.username">
            <td class="mono" style="color:var(--accent)">{{ u.username }}</td>
            <td><span v-if="(u.items || []).find(i => i.equipped)" class="av-badge" :style="{ background: (TAG_COLORS[(u.items.find(i => i.equipped)).color] || '#888') }">{{ u.items.find(i => i.equipped).tag }}</span><span v-else style="color:var(--text-3)">-</span></td>
            <td class="mono">{{ (u.items || []).find(i => i.equipped) ? (u.items.find(i => i.equipped)).color : '-' }}</td>
            <td style="color:var(--text-2)">{{ (u.items || []).find(i => i.equipped) ? (u.items.find(i => i.equipped)).itemName : '-' }}</td>
            <td><span v-for="i in (u.items || [])" :key="i.tag + i.itemName" class="av-badge" :style="{ background: (TAG_COLORS[i.color] || '#888'), fontSize: '11px' }">{{ i.tag || i.itemName }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>`
};
