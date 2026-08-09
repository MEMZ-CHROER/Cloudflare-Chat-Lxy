// v1.53 赛季弹窗 — Vue3 重写（批1 经济域）
// 与旧 overlay 行为一致：赛季状态 + 目标进度条 + 荣誉奖励。
// 弹窗壳由 modal-manager 提供，本文件只注入自身布局样式。
import * as Vue from '/static/chat/vendor/vue.js';
import { getAuthName, getAuthToken, isAuthenticated } from '../auth.js';
import { injectCss } from '../modal-manager.js';

const GOAL_TYPE_LABEL = {
  msg: '发言', checkin: '签到', game: '游戏获胜', points: '赛季积分', achievement: '成就'
};

injectCss('cm-style-season', `
.cm-season { display: flex; flex-direction: column; min-width: min(420px, 88vw); }
.cm-season-body { padding: 16px; overflow-y: auto; }
.cm-season-head { margin-bottom: 12px; }
.cm-season-name { font-size: 16px; font-weight: 700; }
.cm-season-meta { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.cm-season-hint { font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; }
.cm-season-goal { padding: 10px 12px; margin-bottom: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
.cm-season-goal-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.cm-season-goal-label { font-weight: 600; }
.cm-season-goal-reward { color: #e67e22; font-size: 12px; font-weight: 600; }
.cm-season-bar-outer { height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; }
.cm-season-bar { height: 100%; background: linear-gradient(90deg,#4a6cf7,#8e44ad); border-radius: 4px; }
.cm-season-goal-status { display: flex; justify-content: space-between; margin-top: 5px; font-size: 12px; color: var(--text-secondary); }
.cm-season-reached { color: #27ae60; font-weight: 600; }
.cm-season-none { text-align: center; color: var(--text-secondary); padding: 24px 0; }
.cm-season-err { text-align: center; color: #c0392b; padding: 24px 0; }
`);

function fmtTime(ts) {
  if (!ts) return "";
  try { return new Date(Number(ts)).toLocaleString(); } catch (e) { return String(ts); }
}

export default {
  name: 'SeasonModal',
  setup() {
    const loading = Vue.ref(true);
    const season = Vue.ref(null);
    const goals = Vue.ref([]);
    const statusMsg = Vue.ref('');
    const authed = Vue.ref(isAuthenticated());

    async function load() {
      loading.value = true;
      statusMsg.value = '';
      season.value = null;
      goals.value = [];
      try {
        const r = await fetch('/api/season/status');
        const data = await r.json();
        if (!data || data.status === 'none' || data.status === 'ended') {
          statusMsg.value = data && data.status === 'ended' ? '上赛季已结算，等待新赛季开启' : '当前没有进行中的赛季';
          return;
        }
        season.value = data;
        let progress = [];
        if (isAuthenticated()) {
          try {
            const pr = await fetch('/api/season/progress?name=' + encodeURIComponent(getAuthName()) + '&token=' + encodeURIComponent(getAuthToken()));
            const pd = await pr.json();
            if (pd && Array.isArray(pd.goals)) progress = pd.goals;
          } catch (e) {}
        }
        const gl = Array.isArray(data.goals) ? data.goals : [];
        goals.value = gl.map((g, i) => {
          const p = progress[i] || null;
          const cur = p ? Number(p.current) : 0;
          const target = Number(g.target) || 0;
          const pct = target > 0 ? Math.min(100, (cur / target) * 100) : 0;
          return {
            typeLabel: (GOAL_TYPE_LABEL[g.type] || g.type) + (g.label ? ' · ' + g.label : ''),
            honor: g.honor,
            cur, target, pct,
            reached: !!(p && p.reached)
          };
        });
      } catch (e) {
        statusMsg.value = '加载失败';
      } finally {
        loading.value = false;
      }
    }

    Vue.onMounted(load);

    return { loading, season, goals, statusMsg, authed, fmtTime };
  },
  template: `
  <div class="cm-season">
    <div class="cm-header">
      <span>🏆 赛季</span>
      <button class="cm-close" @click="$emit('close')" title="关闭">&times;</button>
    </div>
    <div class="cm-season-body">
      <div v-if="loading" class="cm-loading">加载中...</div>
      <div v-else-if="statusMsg" class="cm-season-none">{{ statusMsg }}</div>
      <div v-else>
        <div class="cm-season-head">
          <div class="cm-season-name">🏆 {{ season.name || '赛季' }}</div>
          <div class="cm-season-meta">开始 {{ fmtTime(season.startAt) }} · 结束 {{ fmtTime(season.endAt) }}</div>
        </div>
        <div v-if="!authed" class="cm-season-hint">🔒 登录后查看我的赛季进度</div>
        <div v-if="goals.length === 0" class="cm-season-none">本赛季暂无目标</div>
        <div v-else>
          <div v-for="(g, i) in goals" :key="i" class="cm-season-goal">
            <div class="cm-season-goal-top">
              <span class="cm-season-goal-label">{{ g.typeLabel }}</span>
              <span class="cm-season-goal-reward">+{{ g.honor }} 荣誉</span>
            </div>
            <div class="cm-season-bar-outer">
              <div class="cm-season-bar" :style="{ width: g.pct.toFixed(1) + '%' }"></div>
            </div>
            <div class="cm-season-goal-status">
              <span>{{ g.cur }} / {{ g.target }}</span>
              <span :class="{ 'cm-season-reached': g.reached }">{{ g.reached ? '✔ 已达成' : '未达成' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`
};
