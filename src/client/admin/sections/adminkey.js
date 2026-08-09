// v1.52 管理后台 Vue3 迁移 - 管理员密钥管理（查看/修改/重置）
import * as Vue from '/static/admin/vendor/vue.js';
import { toast } from '/static/admin/store.js';

export default {
  name: 'AdminKeySection',
  setup() {
    const display = Vue.ref('');
    const loading = Vue.ref(false);
    const newKey = Vue.ref('');

    async function load() {
      loading.value = true;
      try {
        const r = await fetch('/api/admin/admin-key/get');
        const data = await r.json();
        if (data.key) {
          const masked = data.key.length > 4 ? data.key.slice(0, 4) + '****' : '****';
          display.value = masked;
        }
      } catch (e) { display.value = '加载失败'; }
      loading.value = false;
    }

    async function change() {
      const k = newKey.value.trim();
      if (!k) { toast('请输入新密钥', 'warn'); return; }
      if (k.length < 3) { toast('密钥长度至少3位', 'warn'); return; }
      try {
        const r = await fetch('/api/admin/admin-key/set?newkey=' + encodeURIComponent(k));
        const text = await r.text();
        toast(text);
        newKey.value = '';
        await load();
      } catch (e) { toast('操作失败', 'err'); }
    }

    async function reset() {
      if (!confirm('确定将管理员密钥重置为默认值吗？')) return;
      try {
        const r = await fetch('/api/admin/admin-key/reset');
        const text = await r.text();
        toast(text);
        await load();
      } catch (e) { toast('操作失败', 'err'); }
    }

    Vue.onMounted(load);
    return { display, loading, newKey, change, reset };
  },
  template: `
  <div class="av-page">
    <h1>🔑 管理员密钥</h1>
    <p class="av-sub">查看 / 修改后台管理密钥（需 super 权限）</p>

    <div class="av-card" style="padding:18px 20px;max-width:560px;display:flex;flex-direction:column;gap:16px">
      <div>
        <div style="font-size:12px;color:var(--text-3);margin-bottom:6px">当前密钥</div>
        <div class="mono" style="font-size:16px;letter-spacing:.04em">
          <span v-if="loading">加载中...</span>
          <span v-else style="display:inline-flex;align-items:center;gap:10px">
            <span style="color:var(--cyan)">{{ display }}</span>
          </span>
        </div>
      </div>

      <div style="border-top:1px solid var(--border);padding-top:16px">
        <div style="font-size:12px;color:var(--text-3);margin-bottom:8px">修改密钥（至少 3 位）</div>
        <div class="av-toolbar">
          <input v-model="newKey" class="av-input mono" type="password" placeholder="新密钥" style="flex:1;min-width:180px" @keydown.enter="change" />
          <button class="av-btn primary" @click="change">修改</button>
        </div>
      </div>

      <div style="border-top:1px solid var(--border);padding-top:16px">
        <div style="font-size:12px;color:var(--text-3);margin-bottom:8px">重置为默认密钥</div>
        <button class="av-btn danger" @click="reset">重置默认</button>
      </div>
    </div>
  </div>`
};
