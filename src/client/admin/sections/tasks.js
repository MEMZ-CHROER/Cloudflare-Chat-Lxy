// v1.52 管理后台 Vue3 迁移 - 任务管理（每日/成就任务配置）
import * as Vue from '/static/admin/vendor/vue.js';
import { toast } from '/static/admin/store.js';

export default {
  name: 'TasksSection',
  setup() {
    const tasks = Vue.ref([]);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    const statsText = Vue.ref('');
    const form = Vue.reactive({ name: '', desc: '', reward: '' });

    async function load() {
      loading.value = true; err.value = false;
      try {
        const r = await fetch('/api/admin/tasks/list');
        const data = await r.json();
        tasks.value = Array.isArray(data) ? data : [];
        const enabled = tasks.value.filter(t => t.enabled).length;
        statsText.value = enabled + '/' + tasks.value.length + ' 个启用';
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    async function add() {
      const name = form.name.trim();
      const reward = form.reward;
      if (!name || !reward) { toast('请至少填写任务名称和奖励积分', 'warn'); return; }
      try {
        const r = await fetch('/api/admin/tasks/task/add', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description: form.desc.trim(), reward: parseInt(reward) })
        });
        const data = await r.json();
        if (data.error) { toast(data.error, 'err'); return; }
        form.name = ''; form.desc = ''; form.reward = '';
        toast('已添加任务');
        await load();
      } catch (e) { toast('添加失败: ' + e.message, 'err'); }
    }

    async function toggle(task) {
      try {
        const r = await fetch('/api/admin/tasks/task/toggle', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: task.id })
        });
        const data = await r.json();
        if (data.error) { toast(data.error, 'err'); return; }
        await load();
      } catch (e) { toast('操作失败', 'err'); }
    }

    async function del(task) {
      if (!confirm('确定删除此任务？')) return;
      try {
        const r = await fetch('/api/admin/tasks/task/delete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: task.id })
        });
        const data = await r.json();
        if (data.error) { toast(data.error, 'err'); return; }
        await load();
      } catch (e) { toast('删除失败', 'err'); }
    }

    Vue.onMounted(load);
    return { tasks, loading, err, statsText, form, add, toggle, del };
  },
  template: `
  <div class="av-page">
    <h1>📋 任务管理</h1>
    <p class="av-sub">配置任务名称 / 描述 / 奖励积分，控制启用状态</p>
    <div class="av-card" style="padding:14px 16px;margin-bottom:16px">
      <div class="av-toolbar">
        <input v-model="form.name" class="av-input" placeholder="任务名称" style="width:140px" />
        <input v-model="form.desc" class="av-input" placeholder="描述" style="width:180px" />
        <input v-model="form.reward" class="av-input" type="number" placeholder="奖励积分" style="width:90px" />
        <button class="av-btn primary" @click="add">添加任务</button>
        <span style="flex:1"></span>
        <span style="color:var(--text-2);font-size:13px">{{ statsText }}</span>
      </div>
    </div>
    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="tasks.length === 0" class="av-empty">暂无任务</div>
    <div v-else class="av-table-wrap">
      <table class="av-table">
        <thead><tr><th>名称</th><th>描述</th><th>奖励</th><th>完成数</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="task in tasks" :key="task.id">
            <td style="font-weight:600">{{ task.name }}</td>
            <td style="color:var(--text-2)">{{ task.description || '' }}</td>
            <td class="mono" style="color:var(--orange)">{{ task.reward }}</td>
            <td class="mono" style="color:var(--text-2)">{{ task.completedCount }}</td>
            <td><span class="av-badge" :style="{ background: task.enabled ? 'rgba(74,222,128,.15)' : 'rgba(255,255,255,.08)', color: task.enabled ? 'var(--green)' : 'var(--text-3)' }">{{ task.enabled ? '启用' : '禁用' }}</span></td>
            <td style="display:flex;gap:4px">
              <button class="av-btn sm" :class="task.enabled ? 'danger' : 'success'" @click="toggle(task)">{{ task.enabled ? '禁用' : '启用' }}</button>
              <button class="av-btn danger sm" @click="del(task)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>`
};
