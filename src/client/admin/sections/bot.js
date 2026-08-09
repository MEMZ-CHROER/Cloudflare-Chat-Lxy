// v1.52 管理后台 Vue3 迁移 - 机器人命令管理（list/add/toggle/update/delete）
import * as Vue from '/static/admin/vendor/vue.js';
import { toast } from '/static/admin/store.js';

export default {
  name: 'BotSection',
  setup() {
    const cmds = Vue.ref([]);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    const form = Vue.reactive({ keyword: '', response: '' });

    async function load() {
      loading.value = true; err.value = false;
      try {
        const r = await fetch('/api/admin/bot?action=list');
        const data = await r.json();
        cmds.value = Array.isArray(data) ? data : [];
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    async function add() {
      const keyword = form.keyword.trim();
      const response = form.response.trim();
      if (!keyword) { toast('请输入命令关键词', 'warn'); return; }
      if (!response) { toast('请输入回复内容', 'warn'); return; }
      try {
        const r = await fetch('/api/admin/bot?action=add', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword, response })
        });
        const data = await r.json();
        if (data.ok) {
          form.keyword = ''; form.response = '';
          toast('已添加命令 /' + keyword);
          await load();
        } else {
          toast(data.error || '添加失败', 'err');
        }
      } catch (e) { toast('添加失败: ' + e.message, 'err'); }
    }

    async function toggle(cmd) {
      try {
        const r = await fetch('/api/admin/bot?action=get&keyword=' + encodeURIComponent(cmd.keyword));
        const c = await r.json();
        const newEnabled = c.enabled === false;
        await fetch('/api/admin/bot?action=update', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: cmd.keyword, response: c.response || '', enabled: newEnabled })
        });
        cmd.enabled = newEnabled;
      } catch (e) { toast('操作失败', 'err'); }
    }

    async function del(cmd) {
      if (!confirm('确定删除命令 /' + cmd.keyword + ' ？')) return;
      try {
        await fetch('/api/admin/bot?action=delete&keyword=' + encodeURIComponent(cmd.keyword));
        await load();
      } catch (e) { toast('删除失败', 'err'); }
    }

    Vue.onMounted(load);
    return { cmds, loading, err, form, add, toggle, del };
  },
  template: `
  <div class="av-page">
    <h1>🤖 机器人命令</h1>
    <p class="av-sub">关键词自动回复命令，用户输入 /关键词 触发</p>

    <div class="av-card" style="padding:14px 16px;margin-bottom:16px">
      <div class="av-toolbar">
        <input v-model="form.keyword" class="av-input" placeholder="/命令关键词" style="width:130px" @keydown.enter="add" />
        <input v-model="form.response" class="av-input" placeholder="回复内容" style="width:260px" @keydown.enter="add" />
        <button class="av-btn primary" @click="add">添加命令</button>
      </div>
    </div>

    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="cmds.length === 0" class="av-empty">暂无命令，添加一个新命令吧</div>
    <div v-else style="display:flex;flex-direction:column;gap:10px">
      <div v-for="cmd in cmds" :key="cmd.keyword" class="av-card" style="padding:12px 16px;display:flex;align-items:center;gap:14px">
        <span class="mono" style="flex-shrink:0;font-weight:700;color:var(--accent);font-size:14px;min-width:60px">/{{ cmd.keyword }}</span>
        <span style="flex:1;color:var(--text-2);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ cmd.response || '' }}</span>
        <span class="av-badge" :style="cmd.enabled !== false
          ? { background:'rgba(74,222,128,.14)', color:'var(--green)', border:'1px solid rgba(74,222,128,.35)' }
          : { background:'rgba(255,107,107,.12)', color:'var(--red)', border:'1px solid rgba(255,107,107,.35)' }">
          {{ cmd.enabled !== false ? '启用' : '禁用' }}
        </span>
        <button class="av-btn sm" :class="cmd.enabled !== false ? 'danger' : 'success'" @click="toggle(cmd)">{{ cmd.enabled !== false ? '禁用' : '启用' }}</button>
        <button class="av-btn danger sm" @click="del(cmd)">删除</button>
      </div>
    </div>
  </div>`
};
