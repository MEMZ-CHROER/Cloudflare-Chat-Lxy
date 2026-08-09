// v1.52 管理后台 Vue3 迁移 - 操作日志查看（动作过滤 + 表格 + 清空）
import * as Vue from '/static/admin/vendor/vue.js';
import { toast } from '/static/admin/store.js';

const ACTION_LABELS = {
  kick: '👢 踢出', ban: '🚫 封禁', unban: '🔓 解封',
  ipban: '🔨 IP封禁', ipunban: '🔓 IP解封',
  set_points: '💰 设置积分', add_points: '➕ 增加积分', deduct_points: '➖ 扣除积分',
  set_tag: '🏷️ 设置标签', remove_tag: '🗑️ 移除标签',
  clear_room: '🧹 清空房间', destroy_room: '💥 销毁房间', delete_user: '🗑️ 删除用户',
  blacklist: '⛔ 拉黑', unblacklist: '✅ 移出黑名单',
  global_kick: '👢 全局踢出', kick_protect: '🛡️ 踢出保护',
};

export default {
  name: 'LogSection',
  setup() {
    const logs = Vue.ref([]);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    const filter = Vue.ref('');   // '' = 全部

    async function load() {
      loading.value = true; err.value = false;
      try {
        let url = '/api/admin/log/list';
        if (filter.value) url += '?action=' + encodeURIComponent(filter.value);
        const r = await fetch(url);
        logs.value = await r.json();
        if (!Array.isArray(logs.value)) logs.value = [];
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    function pick(a) { filter.value = filter.value === a ? '' : a; load(); }

    function fmt(ts) {
      if (!ts) return '-';
      try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
    }

    async function clearAll() {
      if (!confirm('确定清空所有操作日志？')) return;
      try {
        await fetch('/api/admin/log/clear', { method: 'POST' });
        toast('日志已清空');
        await load();
      } catch (e) { toast('操作失败', 'err'); }
    }

    const actionKeys = Vue.computed(() => Object.keys(ACTION_LABELS));
    const shown = Vue.computed(() => {
      if (!filter.value) return logs.value;
      return logs.value.filter(l => l.action === filter.value);
    });

    Vue.onMounted(load);
    return { logs, loading, err, filter, shown, actionKeys, ACTION_LABELS, load, pick, clearAll, fmt };
  },
  template: `
  <div class="av-page">
    <h1>📜 操作日志</h1>
    <p class="av-sub">记录管理员的关键操作（需 super 权限查看）</p>

    <div class="av-toolbar" style="margin-bottom:14px;gap:6px">
      <button class="av-btn sm" :class="!filter ? 'primary' : 'ghost'" @click="pick('')">全部 <span class="mono">{{ logs.length }}</span></button>
      <button v-for="a in actionKeys" :key="a" class="av-btn sm" :class="filter === a ? 'primary' : 'ghost'" @click="pick(a)">
        {{ ACTION_LABELS[a] }}
      </button>
      <span style="flex:1"></span>
      <button class="av-btn danger sm" @click="clearAll">🧹 清空日志</button>
    </div>

    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="shown.length === 0" class="av-empty">暂无操作日志</div>
    <div v-else class="av-table-wrap">
      <table class="av-table">
        <thead><tr><th>时间</th><th>操作人</th><th>操作</th><th>目标</th><th>详情</th></tr></thead>
        <tbody>
          <tr v-for="(log, i) in shown" :key="i">
            <td class="mono" style="color:var(--text-3);font-size:12px;white-space:nowrap">{{ fmt(log.timestamp) }}</td>
            <td style="font-weight:600">{{ log.operator || '' }}</td>
            <td><span class="av-badge" style="background:rgba(122,162,255,.1);color:#a9c1ff;border:1px solid rgba(122,162,255,.25)">{{ ACTION_LABELS[log.action] || log.action }}</span></td>
            <td class="mono">{{ log.target || '-' }}</td>
            <td style="color:var(--text-2)">{{ log.detail || '' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>`
};
