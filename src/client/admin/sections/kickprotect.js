// v1.52 管理后台 Vue3 迁移 - 踢出保护（受保护用户列表 + 添加/移除）
import * as Vue from '/static/admin/vendor/vue.js';
import { toast } from '/static/admin/store.js';

export default {
  name: 'KickProtectSection',
  setup() {
    const list = Vue.ref([]);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    const newName = Vue.ref('');

    async function load() {
      loading.value = true; err.value = false;
      try {
        const r = await fetch('/api/admin/kick-protect/list');
        const data = await r.json();
        list.value = Array.isArray(data) ? data : [];
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    async function add() {
      const name = newName.value.trim();
      if (!name) { toast('请输入用户名', 'warn'); return; }
      try {
        const r = await fetch('/api/admin/kick-protect/add?name=' + encodeURIComponent(name));
        const text = await r.text();
        toast(text);
        newName.value = '';
        await load();
      } catch (e) { toast('操作失败', 'err'); }
    }

    async function remove(name) {
      if (!confirm('确定移除 ' + name + ' 的踢出保护？')) return;
      try {
        const r = await fetch('/api/admin/kick-protect/remove?name=' + encodeURIComponent(name));
        const text = await r.text();
        toast(text);
        await load();
      } catch (e) { toast('操作失败', 'err'); }
    }

    Vue.onMounted(load);
    return { list, loading, err, newName, add, remove };
  },
  template: `
  <div class="av-page">
    <h1>🛡️ 踢出保护</h1>
    <p class="av-sub">受保护用户不会被任何管理员踢出聊天室（需 super 权限查看）</p>

    <div class="av-card" style="padding:14px 16px;margin-bottom:16px">
      <div class="av-toolbar">
        <input v-model="newName" class="av-input" placeholder="用户名" style="width:160px" @keydown.enter="add" />
        <button class="av-btn primary" @click="add">添加保护</button>
      </div>
    </div>

    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="list.length === 0" class="av-empty">暂无受保护的用户</div>
    <div v-else class="av-card" style="overflow:hidden">
      <table class="av-table">
        <thead><tr><th>用户名</th><th style="width:120px">操作</th></tr></thead>
        <tbody>
          <tr v-for="name in list" :key="name">
            <td style="font-weight:600">
              <span style="display:inline-flex;align-items:center;gap:8px">
                <span class="av-badge" style="background:rgba(34,211,238,.12);color:var(--cyan);border:1px solid rgba(34,211,238,.35)">🛡️</span>
                <span class="mono">{{ name }}</span>
              </span>
            </td>
            <td><button class="av-btn danger sm" @click="remove(name)">移除保护</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>`
};
