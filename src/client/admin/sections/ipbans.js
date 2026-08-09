// v1.52 管理后台 Vue3 迁移 - IP封禁（superOnly）
import * as Vue from '/static/admin/vendor/vue.js';
import { toast } from '/static/admin/store.js';

export default {
  name: 'IpBansSection',
  setup() {
    const list = Vue.ref([]);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    const ipInput = Vue.ref('');

    async function load() {
      loading.value = true; err.value = false;
      try {
        const r = await fetch('/api/admin/ip-ban/list');
        const data = await r.json();
        list.value = Array.isArray(data) ? data : [];
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    async function banIp(ip) {
      if (!confirm('确定封禁IP ' + ip + ' 吗？')) return;
      try {
        const r = await fetch('/api/admin/ip-ban/add?ip=' + encodeURIComponent(ip));
        toast(await r.text());
        await load();
      } catch (e) { toast('操作失败', 'err'); }
    }

    function banByInput() {
      const ip = ipInput.value.trim();
      if (!ip) { toast('请输入IP地址', 'warn'); return; }
      banIp(ip);
      ipInput.value = '';
    }

    async function unban(ip) {
      if (!confirm('确定解封IP ' + ip + ' 吗？')) return;
      try {
        const r = await fetch('/api/admin/ip-ban/remove?ip=' + encodeURIComponent(ip));
        toast(await r.text());
        await load();
      } catch (e) { toast('操作失败', 'err'); }
    }

    Vue.onMounted(load);
    return { list, loading, err, ipInput, banByInput, unban };
  },
  template: `
  <div class="av-page">
    <h1>🛡️ IP 封禁</h1>
    <p class="av-sub">封禁恶意 IP，封禁后该 IP 无法访问站点</p>
    <div class="av-card" style="padding:14px 16px;margin-bottom:16px">
      <div class="av-toolbar">
        <input v-model="ipInput" class="av-input" placeholder="输入IP地址" style="width:200px" @keydown.enter="banByInput" />
        <button class="av-btn danger" @click="banByInput">封禁IP</button>
      </div>
    </div>
    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="list.length === 0" class="av-empty">暂无被封禁IP</div>
    <div v-else class="av-card" style="padding:8px 0">
      <div v-for="ip in list" :key="ip" style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.06)">
        <span class="mono" style="color:var(--text-2)">{{ ip }}</span>
        <span style="flex:1"></span>
        <button class="av-btn success sm" @click="unban(ip)">解封</button>
      </div>
    </div>
  </div>`
};
