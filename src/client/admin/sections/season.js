// v1.52 管理后台 Vue3 迁移 - 赛季管理（查看当前赛季 + 创建 + 开始/立即结算）
import * as Vue from '/static/admin/vendor/vue.js';
import { toast } from '/static/admin/store.js';

const GOAL_TYPES = ['msg', 'checkin', 'game', 'points', 'achievement'];
const GOAL_TYPE_LABEL = { msg: '💬 发言', checkin: '📅 签到', game: '🎮 游戏获胜', points: '🏅 赛季积分', achievement: '🏆 成就' };
const STATUS_META = {
  active:   { label: '进行中', color: 'var(--green)', bg: 'rgba(74,222,128,.14)', bd: 'rgba(74,222,128,.35)' },
  upcoming: { label: '未开始', color: 'var(--orange)', bg: 'rgba(246,166,9,.14)', bd: 'rgba(246,166,9,.35)' },
  ended:    { label: '已结束', color: 'var(--text-3)', bg: 'rgba(255,255,255,.06)', bd: 'var(--border)' },
};

export default {
  name: 'SeasonSection',
  setup() {
    const season = Vue.ref(null);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    // 创建表单
    const form = Vue.reactive({ name: '', startAt: '', endAt: '' });
    const goals = Vue.ref([]);   // [{ type, target, honor, label }]
    // 控制按钮 loading
    const acting = Vue.ref('');

    async function load() {
      loading.value = true; err.value = false;
      try {
        const r = await fetch('/api/admin/season/config');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        season.value = (data && data.id) ? data : null;
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    function addGoalRow() {
      goals.value.push({ type: 'msg', target: '', honor: '', label: '' });
    }
    function removeGoalRow(i) { goals.value.splice(i, 1); }

    function fmtTime(ts) {
      if (!ts) return '-';
      try { return new Date(Number(ts)).toLocaleString(); } catch { return String(ts); }
    }

    const statusMeta = Vue.computed(() => {
      const s = season.value;
      if (!s) return null;
      const base = STATUS_META[s.status] || { label: s.status, color: 'var(--text-2)', bg: 'rgba(255,255,255,.06)', bd: 'var(--border)' };
      return { label: s.settled ? base.label + ' · 已结算' : base.label, color: base.color, bg: base.bg, bd: base.bd };
    });

    async function create() {
      const name = form.name.trim();
      const startAt = Number(form.startAt);
      const endAt = Number(form.endAt);
      if (!name) { toast('请填写赛季名称', 'warn'); return; }
      if (!isFinite(startAt) || !isFinite(endAt)) { toast('请填写开始/结束时间戳(ms)', 'warn'); return; }
      const g = goals.value
        .filter(r => r.target !== '' && r.target !== null)
        .map(r => ({ type: r.type, target: r.target, honor: r.honor || 0, label: r.label }));
      if (!g.length) { toast('请至少添加一个目标', 'warn'); return; }
      try {
        const r = await fetch('/api/admin/season/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, startAt, endAt, goals: g })
        });
        const d = await r.json();
        if (d.error) { toast(d.error, 'err'); return; }
        toast('赛季已创建');
        form.name = ''; form.startAt = ''; form.endAt = '';
        goals.value = []; addGoalRow();
        await load();
      } catch (e) { toast('创建失败: ' + e.message, 'err'); }
    }

    async function start() {
      if (!season.value || season.value.status !== 'upcoming') return;
      acting.value = 'start';
      try {
        const r = await fetch('/api/admin/season/start', { method: 'POST' });
        const d = await r.json();
        if (d.error) { toast(d.error, 'err'); return; }
        toast('赛季已开始');
        await load();
      } catch (e) { toast('操作失败: ' + e.message, 'err'); }
      acting.value = '';
    }

    async function end() {
      const s = season.value;
      if (!s || s.status !== 'active' || s.settled) return;
      if (!confirm('确定立即结算当前赛季？结算后荣誉将发放给达标用户。')) return;
      acting.value = 'end';
      try {
        const r = await fetch('/api/admin/season/end', { method: 'POST' });
        const d = await r.json();
        if (d.error) { toast(d.error, 'err'); return; }
        toast('赛季已结算');
        await load();
      } catch (e) { toast('操作失败: ' + e.message, 'err'); }
      acting.value = '';
    }

    Vue.onMounted(() => { load(); addGoalRow(); });
    return { season, loading, err, form, goals, statusMeta, GOAL_TYPES, GOAL_TYPE_LABEL, fmtTime, addGoalRow, removeGoalRow, create, start, end, acting };
  },
  template: `
  <div class="av-page">
    <h1>🏆 赛季管理</h1>
    <p class="av-sub">创建 / 开始 / 结算赛季，达标用户获得荣誉币（需 super 权限）</p>

    <!-- 当前赛季状态 -->
    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else class="av-card" style="padding:18px 20px;margin-bottom:18px">
      <template v-if="!season">
        <div style="color:var(--text-2);font-size:13px">当前没有赛季</div>
      </template>
      <template v-else>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-size:17px;font-weight:700">{{ season.name || '赛季' }}</span>
          <span class="av-badge" :style="{ background: statusMeta.bg, color: statusMeta.color, border: '1px solid ' + statusMeta.bd }">{{ statusMeta.label }}</span>
        </div>
        <div class="mono" style="color:var(--text-3);font-size:12px;margin:8px 0 12px">
          ID: {{ season.id || '-' }} · 开始 {{ fmtTime(season.startAt) }} · 结束 {{ fmtTime(season.endAt) }}
        </div>
        <div v-if="(season.goals || []).length" class="av-table-wrap" style="border-radius:10px">
          <table class="av-table">
            <thead><tr><th>类型</th><th>描述</th><th>目标</th><th>荣誉</th></tr></thead>
            <tbody>
              <tr v-for="(g, i) in season.goals" :key="i">
                <td>{{ GOAL_TYPE_LABEL[g.type] || g.type }}</td>
                <td style="color:var(--text-2)">{{ g.label || '-' }}</td>
                <td class="mono">{{ g.target }}</td>
                <td class="mono" style="color:var(--orange)">{{ g.honor }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <!-- 操作按钮：按状态禁用 -->
    <div class="av-toolbar" style="margin-bottom:20px;gap:10px">
      <button class="av-btn success" :disabled="!season || season.status !== 'upcoming' || !!acting" @click="start">{{ acting==='start' ? '处理中...' : '▶ 开始赛季' }}</button>
      <button class="av-btn danger" :disabled="!season || season.status !== 'active' || season.settled || !!acting" @click="end">{{ acting==='end' ? '处理中...' : '🏁 立即结算' }}</button>
    </div>

    <!-- 创建新赛季 -->
    <div class="av-card" style="padding:18px 20px">
      <h3 style="margin:0 0 14px;font-size:15px">✨ 创建新赛季</h3>
      <div class="av-toolbar" style="margin-bottom:12px;flex-wrap:wrap">
        <input v-model="form.name" class="av-input" placeholder="赛季名称" style="width:170px" />
        <input v-model="form.startAt" class="av-input mono" type="number" placeholder="开始时间戳(ms)" style="width:170px" />
        <input v-model="form.endAt" class="av-input mono" type="number" placeholder="结束时间戳(ms)" style="width:170px" />
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
        <div v-for="(g, i) in goals" :key="i" class="av-toolbar" style="flex-wrap:nowrap;background:rgba(0,0,0,.2);border:1px solid var(--border);border-radius:8px;padding:7px 9px">
          <select v-model="g.type" class="av-select" style="width:130px">
            <option v-for="t in GOAL_TYPES" :key="t" :value="t">{{ GOAL_TYPE_LABEL[t] }}</option>
          </select>
          <input v-model="g.target" class="av-input mono" type="number" placeholder="目标值" style="width:90px" />
          <input v-model="g.honor" class="av-input mono" type="number" placeholder="荣誉" style="width:90px" />
          <input v-model="g.label" class="av-input" placeholder="描述(≤30字)" style="flex:1;min-width:110px" />
          <button class="av-btn ghost sm" style="color:var(--red)" @click="removeGoalRow(i)">✕</button>
        </div>
      </div>

      <div class="av-toolbar">
        <button class="av-btn ghost sm" @click="addGoalRow">＋ 添加目标</button>
        <span style="flex:1"></span>
        <button class="av-btn primary" @click="create">创建赛季</button>
      </div>
    </div>
  </div>`
};
