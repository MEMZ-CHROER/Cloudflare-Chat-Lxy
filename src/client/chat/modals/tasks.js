// v1.53 任务弹窗 — Vue3 重写（批1 经济域）
// 与旧 overlay 行为一致：任务列表/完成情况/可领取/领取/完成提交/积分显示。
// 弹窗壳由 modal-manager 提供，本文件只注入自身布局样式。
import * as Vue from '/static/chat/vendor/vue.js';
import { t } from '../state.js';
import { updatePointsDisplay } from '../renderers.js';
import { getAuthName, getAuthToken, isAuthenticated } from '../auth.js';
import { injectCss } from '../modal-manager.js';

injectCss('cm-style-tasks', `
.cm-tasks { display: flex; flex-direction: column; min-width: min(420px, 88vw); }
.cm-tasks-body { padding: 16px; overflow-y: auto; }
.cm-tasks-points { font-size: 13px; color: var(--primary); font-weight: 700; }
.cm-tasks-empty { text-align: center; color: var(--text-secondary); padding: 24px 0; }
.cm-task-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-bottom: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
.cm-task-info { flex: 1; min-width: 0; }
.cm-task-name { font-weight: 600; }
.cm-task-desc { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.cm-task-reward { font-size: 13px; font-weight: 700; white-space: nowrap; }
.cm-task-btn { padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
.cm-task-claim { background: var(--primary); color: #fff; border: none; }
.cm-task-claim:hover { background: var(--primary-dark); }
.cm-task-done { background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border); cursor: default; }
`);

export default {
  name: 'TasksModal',
  setup() {
    const authed = Vue.ref(isAuthenticated());
    const loading = Vue.ref(true);
    const error = Vue.ref('');
    const tasks = Vue.ref([]);
    const completed = Vue.ref([]);
    const claimed = Vue.ref([]);
    const points = Vue.ref(0);

    async function updateTaskPoints() {
      const name = getAuthName();
      if (!name) return;
      try {
        const r = await fetch('/api/points/all');
        const data = await r.json();
        if (data && data[name] !== undefined) points.value = data[name];
      } catch (e) {}
    }

    async function load() {
      authed.value = isAuthenticated();
      if (!authed.value) { loading.value = false; return; }
      loading.value = true;
      error.value = '';
      updateTaskPoints();
      try {
        const [tasksR, compR, claimsR] = await Promise.all([
          fetch('/api/tasks/list'),
          fetch('/api/tasks/completions?name=' + encodeURIComponent(getAuthName())),
          fetch('/api/tasks/claims?name=' + encodeURIComponent(getAuthName()))
        ]);
        const tData = await tasksR.json();
        const compData = await compR.json();
        const clData = await claimsR.json();
        tasks.value = Array.isArray(tData) ? tData : [];
        completed.value = (compData && compData.completed) || [];
        claimed.value = (clData && clData.claimed) || [];
      } catch (e) {
        error.value = '加载失败: ' + e.message;
      } finally {
        loading.value = false;
      }
    }

    async function claim(taskId) {
      try {
        const r = await fetch('/api/tasks/claim', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: getAuthName(), taskId, token: getAuthToken()})});
        const data = await r.json();
        if (data.error) alert(data.error);
        else { alert('已领取任务！完成任务后可获得奖励。'); load(); }
      } catch (e) { alert('领取失败: ' + e.message); }
    }

    async function complete(taskId) {
      try {
        const r = await fetch('/api/tasks/complete', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: getAuthName(), taskId, token: getAuthToken()})});
        const data = await r.json();
        if (data.error) alert(data.error);
        else { alert('任务完成！获得 ' + data.reward + t(' 积分！当前积分: ') + data.total); updatePointsDisplay(); load(); }
      } catch (e) { alert('提交失败: ' + e.message); }
    }

    const isDone = (id) => completed.value.includes(id);
    const isClaimedByOther = (tk) => !!(tk.claimedBy && tk.claimedBy !== getAuthName());
    const isClaimed = (id) => claimed.value.includes(id);

    Vue.onMounted(load);

    return { authed, loading, error, tasks, points, load, claim, complete, isDone, isClaimedByOther, isClaimed, t };
  },
  template: `
  <div class="cm-tasks">
    <div class="cm-header">
      <span>📋 任务</span>
      <span class="cm-tasks-points">{{ points }}{{ t(' 积分') }}</span>
      <button class="cm-close" @click="$emit('close')" title="关闭">&times;</button>
    </div>
    <div class="cm-tasks-body">
      <div v-if="!authed" class="cm-tasks-empty">请先<a href="#" @click.prevent="$emit('close')">登录</a>后查看任务</div>
      <div v-else-if="loading" class="cm-loading">加载中...</div>
      <div v-else-if="error" class="cm-tasks-empty">{{ error }}</div>
      <div v-else-if="tasks.length === 0" class="cm-tasks-empty">暂无可用任务</div>
      <div v-else>
        <div v-for="tk in tasks" :key="tk.id" class="cm-task-item">
          <div class="cm-task-info">
            <div class="cm-task-name">{{ tk.name }}</div>
            <div v-if="tk.description" class="cm-task-desc">{{ tk.description }}</div>
          </div>
          <span class="cm-task-reward">+{{ tk.reward }} 积分</span>
          <button v-if="isDone(tk.id)" class="cm-task-btn cm-task-done" disabled>已完成 ✓</button>
          <button v-else-if="isClaimedByOther(tk)" class="cm-task-btn cm-task-done" disabled>已被领取</button>
          <button v-else-if="isClaimed(tk.id)" class="cm-task-btn cm-task-claim" @click="complete(tk.id)">完成任务</button>
          <button v-else class="cm-task-btn cm-task-claim" @click="claim(tk.id)">领取任务</button>
        </div>
      </div>
      <div style="text-align:center;padding:8px 0 4px;font-size:12px;color:var(--text-secondary)"><a href="/tasks" style="color:var(--primary);text-decoration:none">打开完整任务中心 →</a></div>
    </div>
  </div>`
};
