// v1.53 成就弹窗 — Vue3 重写（批2 工具域）
// 与旧 overlay 行为一致：fetch /api/user/achievements 取等级/经验/统计/解锁成就。
// ACH_DEFS 从 ../achievements.js 导出复用（与 registry 保持一致）。
// showLevelUpBanner/showAchievementToast 是瞬时通知，保持原生不动，本组件只做面板。
import * as Vue from '/static/chat/vendor/vue.js';
import { state, t, showToast } from '../state.js';
import { injectCss } from '../modal-manager.js';
import { ACH_DEFS } from '../achievements.js';

injectCss('cm-style-achievements', `
.cm-achv { display: flex; flex-direction: column; min-width: min(420px, 88vw); }
.cm-achv-body { padding: 16px; overflow-y: auto; }
.cm-achv-level { background: var(--bg); border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
.cm-achv-level-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.cm-achv-bar { background: var(--surface); border-radius: 4px; height: 8px; overflow: hidden; position: relative; }
.cm-achv-bar-fill { background: var(--primary); height: 100%; transition: width .3s; }
.cm-achv-bar-text { font-size: 11px; color: var(--text-secondary); margin-top: 4px; }
.cm-achv-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; }
.cm-achv-stat { background: var(--bg); border-radius: 6px; padding: 6px 8px; text-align: center; }
.cm-achv-stat-icon { font-size: 16px; }
.cm-achv-stat-label { font-size: 12px; color: var(--text-secondary); }
.cm-achv-title { font-size: 12px; font-weight: 600; margin-bottom: 6px; }
.cm-achv-list { overflow-y: auto; min-height: 100px; }
.cm-achv-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; margin-bottom: 4px; background: var(--bg); }
.cm-achv-row-icon { font-size: 20px; flex: 0 0 auto; }
.cm-achv-row-info { flex: 1; min-width: 0; }
.cm-achv-row-name { display: block; font-weight: 600; font-size: 12px; }
.cm-achv-row-desc { display: block; font-size: 11px; color: var(--text-secondary); }
.cm-achv-err { text-align: center; color: #c0392b; padding: 40px; }
`);

export default {
  name: 'AchievementsModal',
  setup() {
    const loading = Vue.ref(true);
    const error = Vue.ref('');
    const level = Vue.ref(1);
    const cur = Vue.ref(0);
    const next = Vue.ref(100);
    const exp = Vue.ref(0);
    const stats = Vue.ref({});
    const unlocked = Vue.ref(new Set());
    const pct = Vue.computed(() => (next.value > 0 ? Math.min(100, Math.round((cur.value / next.value) * 100)) : 100));

    async function load() {
      // 未登录提示（对齐旧 toggleAchievementsPanel）
      const name = state.username;
      const token = localStorage.getItem('chat_token');
      if (!name) { showToast(t('请先设置用户名'), 'warning'); error.value = t('请先设置用户名'); loading.value = false; return; }
      if (!token) { showToast(t('请先登录后再查看成就'), 'warning'); error.value = t('请先登录后再查看成就'); loading.value = false; return; }
      try {
        const r = await fetch('/api/user/achievements?name=' + encodeURIComponent(name) + '&token=' + encodeURIComponent(token));
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'HTTP ' + r.status); }
        const data = await r.json();
        level.value = data.level || 1;
        cur.value = data.expCurrent || 0;
        next.value = data.expNext || 100;
        exp.value = data.exp || 0;
        stats.value = data.stats || {};
        unlocked.value = new Set(data.achievements || []);
      } catch (e) {
        error.value = t('加载失败: ') + e.message;
      } finally {
        loading.value = false;
      }
    }

    Vue.onMounted(load);

    return { loading, error, level, cur, next, exp, stats, unlocked, pct, ACH_DEFS, t };
  },
  template: `
  <div class="cm-achv">
    <div class="cm-header">
      <span>⭐ {{ t('我的成就') }}</span>
      <button class="cm-close" @click="$emit('close')" title="关闭">&times;</button>
    </div>
    <div class="cm-achv-body">
      <div v-if="loading" class="cm-loading">加载中...</div>
      <div v-else-if="error" class="cm-achv-err">{{ error }}</div>
      <div v-else>
        <div class="cm-achv-level">
          <div class="cm-achv-level-top">
            <span class="lv-badge" style="font-size:13px;">Lv.{{ level }}</span>
            <span style="color:var(--text-secondary);font-size:12px;">{{ t('经验 ') }}{{ exp.toLocaleString() }}</span>
          </div>
          <div class="cm-achv-bar"><div class="cm-achv-bar-fill" :style="{ width: pct + '%' }"></div></div>
          <div class="cm-achv-bar-text">{{ cur }} / {{ next }}{{ t(' 经验') }}（{{ pct }}%）</div>
        </div>
        <div class="cm-achv-stats">
          <div class="cm-achv-stat"><div class="cm-achv-stat-icon">💬</div><div class="cm-achv-stat-label">{{ t('发言 ') }}{{ stats.msgCount || 0 }}</div></div>
          <div class="cm-achv-stat"><div class="cm-achv-stat-icon">📅</div><div class="cm-achv-stat-label">{{ t('签到 ') }}{{ stats.checkinCount || 0 }}</div></div>
          <div class="cm-achv-stat"><div class="cm-achv-stat-icon">🎮</div><div class="cm-achv-stat-label">{{ t('游戏获胜 ') }}{{ stats.gameWins || 0 }}</div></div>
          <div class="cm-achv-stat"><div class="cm-achv-stat-icon">🛒</div><div class="cm-achv-stat-label">{{ t('购物 ') }}{{ stats.shopCount || 0 }}</div></div>
        </div>
        <div class="cm-achv-title">🏆 {{ t('成就 ') }}({{ unlocked.size }}/{{ ACH_DEFS.length }})</div>
        <div class="cm-achv-list">
          <div v-for="a in ACH_DEFS" :key="a.id" class="cm-achv-row" :style="{ opacity: unlocked.has(a.id) ? 1 : 0.55 }">
            <span class="cm-achv-row-icon">{{ a.icon }}</span>
            <span class="cm-achv-row-info">
              <span class="cm-achv-row-name">{{ a.name }}{{ unlocked.has(a.id) ? ' ✅' : '' }}</span>
              <span class="cm-achv-row-desc">{{ a.desc }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>`
};
