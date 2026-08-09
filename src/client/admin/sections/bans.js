// v1.52 管理后台 Vue3 迁移 - 封禁用户（superOnly）
import * as Vue from '/static/admin/vendor/vue.js';
import { toast } from '/static/admin/store.js';

export default {
  name: 'BansSection',
  setup() {
    const list = Vue.ref([]);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);

    async function load() {
      loading.value = true; err.value = false;
      try {
        const r = await fetch('/api/admin/ban/list');
        const data = await r.json();
        list.value = Array.isArray(data) ? data : [];
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    async function unban(user) {
      if (!confirm('确定解封 ' + user + ' 吗？')) return;
      try {
        const r = await fetch('/api/admin/ban/remove?name=' + encodeURIComponent(user));
        toast(await r.text());
        await load();
      } catch (e) { toast('操作失败', 'err'); }
    }

    Vue.onMounted(load);
    return { list, loading, err, unban };
  },
  template: `
  <div class="av-page">
    <h1>🚫 封禁用户</h1>
    <p class="av-sub">被封禁的账号列表，点击解封可恢复访问</p>
    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="list.length === 0" class="av-empty">暂无被封禁用户</div>
    <div v-else class="av-card" style="padding:8px 0">
      <div v-for="user in list" :key="user" style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.06)">
        <span class="mono" style="color:var(--text-2)">{{ user }}</span>
        <span style="flex:1"></span>
        <button class="av-btn success sm" @click="unban(user)">解封</button>
      </div>
    </div>
  </div>`
};
