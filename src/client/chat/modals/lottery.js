// v1.53 抽奖弹窗 — Vue3 重写（批1 经济域）
// 与旧 overlay 行为一致：池列表 fetch /api/lottery/pools、抽奖 fetch /api/lottery/draw。
// body 用 state.username + localStorage.getItem("chat_token") 照旧（与旧 doDraw 一致）。
// 弹窗壳由 modal-manager 提供，本文件只注入自身布局样式。
import * as Vue from '/static/chat/vendor/vue.js';
import { state, t } from '../state.js';
import { injectCss } from '../modal-manager.js';

injectCss('cm-style-lottery', `
.cm-lottery { display: flex; flex-direction: column; min-width: min(420px, 88vw); }
.cm-lottery-body { padding: 16px; overflow-y: auto; }
.cm-lottery-pool { border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-bottom: 12px; background: var(--surface); }
.cm-lottery-pool-name { font-weight: 700; font-size: 16px; margin-bottom: 4px; }
.cm-lottery-pool-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; }
.cm-lottery-pool-cost { font-size: 13px; margin-bottom: 8px; }
.cm-lottery-pool-prizes { font-size: 12px; color: var(--text-secondary); margin-bottom: 10px; }
.cm-lottery-btn { padding: 6px 20px; font-size: 14px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-family: inherit; }
.cm-lottery-btn:hover { background: var(--primary-dark); }
.cm-lottery-btn:disabled { opacity: .6; cursor: default; }
.cm-lottery-result { text-align: center; padding: 20px 0; }
.cm-lottery-result-big { font-size: 48px; margin-bottom: 12px; }
.cm-lottery-result-title { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
.cm-lottery-result-prize { font-size: 24px; color: #e67e22; }
.cm-lottery-result-err { font-size: 16px; color: var(--text-secondary); }
.cm-lottery-empty { text-align: center; color: var(--text-secondary); padding: 40px; }
.cm-lottery-err { text-align: center; color: #c0392b; padding: 40px; }
`);

export default {
  name: 'LotteryModal',
  setup() {
    const pools = Vue.ref([]);
    const loading = Vue.ref(true);
    const error = Vue.ref('');
    const drawingPool = Vue.ref('');
    const result = Vue.ref(null);

    async function loadPools() {
      loading.value = true;
      error.value = '';
      result.value = null;
      try {
        const r = await fetch('/api/lottery/pools');
        const data = await r.json();
        pools.value = Array.isArray(data) ? data : [];
      } catch (e) {
        error.value = '加载失败: ' + e.message;
      } finally {
        loading.value = false;
      }
    }

    async function draw(poolId) {
      if (!state.username) { alert('请先登录'); return; }
      drawingPool.value = poolId;
      result.value = { drawing: true };
      try {
        const r = await fetch('/api/lottery/draw', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: state.username, pool: poolId, token: localStorage.getItem('chat_token') || ''})});
        result.value = await r.json();
      } catch (e) {
        result.value = { error: e.message };
      } finally {
        drawingPool.value = '';
      }
    }

    Vue.onMounted(loadPools);

    return { pools, loading, error, drawingPool, result, loadPools, draw, t };
  },
  template: `
  <div class="cm-lottery">
    <div class="cm-header">
      <span>🎰 抽奖</span>
      <button class="cm-close" @click="$emit('close')" title="关闭">&times;</button>
    </div>
    <div class="cm-lottery-body">
      <div v-if="loading" class="cm-loading">加载中...</div>
      <div v-else-if="error" class="cm-lottery-err">{{ error }}</div>
      <div v-else-if="pools.length === 0" class="cm-lottery-empty">暂无可用抽奖池</div>
      <div v-else>
        <div v-for="p in pools" :key="p.id" class="cm-lottery-pool">
          <div class="cm-lottery-pool-name">{{ p.name }}</div>
          <div v-if="p.description" class="cm-lottery-pool-desc">{{ p.description }}</div>
          <div class="cm-lottery-pool-cost">每次 <strong>{{ p.cost }}</strong> 积分</div>
          <div class="cm-lottery-pool-prizes">奖品: <span v-for="(pr, i) in (p.prizes || [])" :key="pr.id || i">{{ i ? ', ' : '' }}{{ pr.name }}({{ pr.stock }}/{{ pr.initialStock }})</span></div>
          <button class="cm-lottery-btn" :disabled="drawingPool === p.id" @click="draw(p.id)">{{ drawingPool === p.id ? '🎰 抽奖中...' : '抽一次' }}</button>
        </div>
      </div>
      <div v-if="result" class="cm-lottery-result">
        <template v-if="result.drawing">
          <div class="cm-lottery-result-big">🎰</div>
          <div class="cm-lottery-result-title">抽奖中...</div>
        </template>
        <template v-else-if="result.ok && result.prize">
          <div class="cm-lottery-result-big">🎉</div>
          <div class="cm-lottery-result-title">恭喜获得:</div>
          <div class="cm-lottery-result-prize">{{ result.prize.name }}</div>
          <div v-if="result.prize.tag" style="font-size:14px;color:var(--text-secondary)">🏷️ 标签已自动装备!</div>
        </template>
        <template v-else>
          <div class="cm-lottery-result-big">😅</div>
          <div class="cm-lottery-result-err">{{ result.error || t('抽奖失败') }}</div>
        </template>
      </div>
    </div>
  </div>`
};
