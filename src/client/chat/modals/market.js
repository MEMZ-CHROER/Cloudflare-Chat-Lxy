// v1.53 交易市场弹窗 — Vue3 重写（批1 经济域）
// 完全接管旧 #market-overlay 的 UI：市场 / 我的挂单 / 我的背包三 tab。
// 复用的 API 与原 market.js 完全一致（/api/market/list、/api/market/orders、/api/market/inventory、
// /api/market/sell、/api/market/buy、/api/market/cancel、/api/points/all）。
// 弹窗壳由 modal-manager 提供，本文件只注入自身布局样式（全部用聊天室 CSS 变量）。
// 文案与旧 overlay 保持一致（t() 复用已有 key，不新增）；Vue 模板自动转义，无需手拼 HTML。
import * as Vue from '/static/chat/vendor/vue.js';
import { state, t } from '../state.js';
import { getAuthName, getAuthToken, isAuthenticated } from '../auth.js';
import { TAG_COLORS } from '../vip.js';
import { injectCss } from '../modal-manager.js';

injectCss('cm-style-market', `
.cm-market { display: flex; flex-direction: column; min-width: min(480px, 90vw); }
.cm-market-points { font-size: 13px; font-weight: 600; color: #e67e22; margin-left: 12px; white-space: nowrap; }
.cm-market-tabs { display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.cm-market-tab { flex: 1; padding: 10px; text-align: center; font-weight: 600; font-size: 14px; cursor: pointer; color: var(--text-secondary); border: none; background: none; border-bottom: 2px solid transparent; transition: all .2s; font-family: inherit; }
.cm-market-tab:hover { color: var(--text); }
.cm-market-tab.active { color: var(--primary); border-bottom-color: var(--primary); }
.cm-market-content { flex: 1; overflow-y: auto; padding: 16px 20px; }
.cm-market-empty { text-align: center; padding: 40px 16px; color: var(--text-secondary); font-size: 14px; }
.cm-market-item { display: flex; align-items: center; padding: 14px 16px; margin-bottom: 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; }
.cm-market-tag { display: inline-block; font-size: 12px; font-weight: 700; color: #fff; padding: 4px 10px; border-radius: 6px; margin-right: 14px; text-align: center; min-width: 56px; flex-shrink: 0; }
.cm-market-info { flex: 1; min-width: 0; }
.cm-market-name { font-weight: 600; font-size: 15px; }
.cm-market-desc { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.cm-market-price { font-size: 14px; font-weight: 700; color: #e67e22; margin: 0 12px; white-space: nowrap; }
.cm-market-btn { border: none; border-radius: 8px; padding: 8px 16px; font-weight: 600; font-size: 13px; cursor: pointer; transition: all .2s; white-space: nowrap; font-family: inherit; }
.cm-market-btn-buy { background: var(--primary); color: #fff; }
.cm-market-btn-buy:hover { background: var(--primary-dark); }
.cm-market-btn-unequip { background: #95a5a6; color: #fff; }
.cm-market-btn-unequip:hover { background: #7f8c8d; }
.cm-market-btn-owned { background: #ecf0f1; color: #95a5a6; cursor: default; }
.cm-market-fee { text-align: center; font-size: 12px; color: var(--text-secondary); margin-bottom: 10px; }
.cm-market-sell-input { width: 88px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; background: var(--bg); color: var(--text); margin-right: 8px; box-sizing: border-box; font-family: inherit; }
.cm-market-sell-input:focus { outline: none; border-color: var(--primary); }
.cm-market-badge { display: inline-block; font-size: 10px; font-weight: 700; color: #fff; padding: 2px 6px; border-radius: 4px; margin-left: 8px; white-space: nowrap; flex-shrink: 0; }
.cm-market-badge-open { background: #2ecc71; }
.cm-market-badge-sold { background: #95a5a6; }
.cm-market-badge-cancel { background: #e74c3c; }
.cm-market-badge-equip { background: #3498db; }
.cm-market-badge-honor { background: #e67e22; }
`);

// 轻量防抖——同一挂单/商品操作处理中直接忽略重复点击（对齐旧 market.js _marketBusy）
const _marketBusy = new Set();

function tagStyle(item) {
  const s = {};
  s.background = item && item.color && TAG_COLORS[item.color] ? TAG_COLORS[item.color] : '#95a5a6';
  if (item && item.border && TAG_COLORS[item.border]) {
    s.outline = '2px solid ' + TAG_COLORS[item.border];
    s.outlineOffset = '-1px';
  }
  return s;
}

function fmtTime(ts) {
  if (!ts) return '';
  try { return new Date(Number(ts)).toLocaleString(); } catch (e) { return String(ts); }
}

export default {
  name: 'MarketModal',
  props: ['tab'],
  setup(props) {
    const currentTab = Vue.ref(props.tab || 'list');
    const loading = Vue.ref(false);
    const error = Vue.ref('');
    const notLoggedIn = Vue.ref(false);
    const points = Vue.ref(0);
    const orders = Vue.ref([]);       // 市场挂单
    const myOrders = Vue.ref([]);     // 我的挂单
    const sellItems = Vue.ref([]);    // 我的背包
    const feePercent = Vue.ref(0);
    const totalOrders = Vue.ref(0);
    const prices = Vue.reactive({});  // 挂单价格输入（按 itemId）

    function refreshPoints() {
      let name = getAuthName();
      if (!name) return;
      fetch('/api/points/all').then(r => r.json()).then(data => {
        if (data && data[name] !== undefined) points.value = data[name];
      }).catch(() => {});
    }

    async function loadMarketItems() {
      try {
        const r = await fetch('/api/market/list');
        const data = await r.json();
        if (!data || typeof data !== 'object') { orders.value = []; error.value = t('加载失败'); return; }
        if (data.enabled === false) { orders.value = []; error.value = t('市场已关闭'); return; }
        feePercent.value = Number(data.feePercent) || 0;
        totalOrders.value = Number(data.total) || 0;
        orders.value = Array.isArray(data.orders) ? data.orders : [];
        if (orders.value.length === 0) error.value = t('暂无挂单');
        else error.value = '';
      } catch (e) { orders.value = []; error.value = t('加载失败') + ': ' + e.message; }
      finally { loading.value = false; }
    }

    async function loadMyOrders() {
      try {
        const r = await fetch('/api/market/orders?name=' + encodeURIComponent(getAuthName()) + '&token=' + encodeURIComponent(getAuthToken()));
        const list = await r.json();
        if (!Array.isArray(list) || list.length === 0) { myOrders.value = []; error.value = t('暂无挂单'); }
        else { myOrders.value = list; error.value = ''; }
      } catch (e) { myOrders.value = []; error.value = t('加载失败') + ': ' + e.message; }
      finally { loading.value = false; }
    }

    async function loadSellInventory() {
      try {
        const r = await fetch('/api/market/inventory?name=' + encodeURIComponent(getAuthName()) + '&token=' + encodeURIComponent(getAuthToken()));
        const list = await r.json();
        if (!Array.isArray(list) || list.length === 0) { sellItems.value = []; error.value = t('背包空空如也'); }
        else { sellItems.value = list; error.value = ''; }
      } catch (e) { sellItems.value = []; error.value = t('加载失败') + ': ' + e.message; }
      finally { loading.value = false; }
    }

    function switchTab(tab) {
      currentTab.value = tab;
      error.value = '';
      if (!isAuthenticated()) { notLoggedIn.value = true; loading.value = false; return; }
      notLoggedIn.value = false;
      loading.value = true;
      if (tab === 'list') loadMarketItems();
      else if (tab === 'mine') loadMyOrders();
      else loadSellInventory();
    }

    // 重复 openModal('market', { tab }) 时切 tab 不重建
    Vue.watch(() => props.tab, (v) => { if (v) switchTab(v); });

    async function sell(id) {
      if (_marketBusy.has(id)) return;
      _marketBusy.add(id);
      const priceStr = prices[id] || '';
      try {
        const r = await fetch('/api/market/sell', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: getAuthName(), itemId: id, price: priceStr, token: getAuthToken()})});
        const data = await r.json();
        if (data.error) alert(t(data.error) || t('操作失败'));
        else { alert(t('挂单成功！')); loadSellInventory(); }
      } catch (e) { alert(t('操作失败') + ': ' + e.message); }
      finally { _marketBusy.delete(id); }
    }

    async function buy(orderId) {
      if (_marketBusy.has(orderId)) return;
      _marketBusy.add(orderId);
      try {
        const r = await fetch('/api/market/buy', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: getAuthName(), orderId, token: getAuthToken()})});
        const data = await r.json();
        if (data.error) alert(t(data.error) || t('操作失败'));
        else { alert(t('购买成功！')); refreshPoints(); loadMarketItems(); }
      } catch (e) { alert(t('操作失败') + ': ' + e.message); }
      finally { _marketBusy.delete(orderId); }
    }

    async function cancel(orderId) {
      if (_marketBusy.has(orderId)) return;
      _marketBusy.add(orderId);
      try {
        const r = await fetch('/api/market/cancel', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: getAuthName(), orderId, token: getAuthToken()})});
        const data = await r.json();
        if (data.error) alert(t(data.error) || t('操作失败'));
        else { alert(t('已撤销')); loadMyOrders(); }
      } catch (e) { alert(t('操作失败') + ': ' + e.message); }
      finally { _marketBusy.delete(orderId); }
    }

    // 首开加载（当前 tab）
    switchTab(currentTab.value);

    return {
      currentTab, loading, error, notLoggedIn, points,
      orders, myOrders, sellItems, feePercent, totalOrders, prices,
      tagStyle, fmtTime, switchTab, sell, buy, cancel, t, getAuthName,
    };
  },
  template: `
  <div class="cm-market">
    <div class="cm-header">
      <span>💱 交易市场</span>
      <span class="cm-market-points">{{ points }}{{ t(' 积分') }}</span>
      <button class="cm-close" @click="$emit('close')" title="关闭">&times;</button>
    </div>
    <div class="cm-market-tabs">
      <button type="button" class="cm-market-tab" :class="{active: currentTab === 'list'}" @click="switchTab('list')">市场</button>
      <button type="button" class="cm-market-tab" :class="{active: currentTab === 'mine'}" @click="switchTab('mine')">我的挂单</button>
      <button type="button" class="cm-market-tab" :class="{active: currentTab === 'sell'}" @click="switchTab('sell')">我的背包</button>
    </div>
    <div class="cm-market-content">
      <div v-if="notLoggedIn" class="cm-market-empty">{{ t('请先登录后使用市场') }}</div>
      <template v-else>
        <div v-if="currentTab === 'list' && !loading && !error" class="cm-market-fee">{{ t('手续费') }} {{ feePercent }}% · {{ t('共') }} {{ totalOrders }} {{ t('单') }}</div>
        <div v-if="loading" class="cm-market-empty">加载中...</div>
        <div v-else-if="error" class="cm-market-empty">{{ error }}</div>
        <template v-else-if="currentTab === 'list'">
          <div v-for="o in orders" :key="o.id" class="cm-market-item">
            <span class="cm-market-tag" :style="tagStyle(o)">{{ o.tag }}</span>
            <div class="cm-market-info">
              <div class="cm-market-name">{{ o.itemName }}</div>
              <div class="cm-market-desc">{{ t('卖家') }}: {{ o.seller }} · {{ fmtTime(o.createdAt) }}</div>
            </div>
            <span class="cm-market-price">{{ o.price }} 积分</span>
            <button v-if="o.seller === getAuthName()" type="button" class="cm-market-btn cm-market-btn-owned" disabled>{{ t('自己的挂单') }}</button>
            <button v-else type="button" class="cm-market-btn cm-market-btn-buy" @click="buy(o.id)">{{ t('购买') }}</button>
          </div>
        </template>
        <template v-else-if="currentTab === 'mine'">
          <div v-for="o in myOrders" :key="o.id" class="cm-market-item">
            <span class="cm-market-tag" :style="tagStyle(o)">{{ o.tag }}</span>
            <div class="cm-market-info">
              <div class="cm-market-name">{{ o.itemName }}</div>
              <div class="cm-market-desc">{{ fmtTime(o.createdAt) }}</div>
            </div>
            <span class="cm-market-price">{{ o.price }} 积分</span>
            <span v-if="o.status === 'sold'" class="cm-market-badge cm-market-badge-sold">{{ t('已成交') }}</span>
            <span v-else-if="o.status === 'cancelled'" class="cm-market-badge cm-market-badge-cancel">{{ t('已撤销') }}</span>
            <span v-else class="cm-market-badge cm-market-badge-open">{{ t('挂单中') }}</span>
            <button v-if="o.status === 'open'" type="button" class="cm-market-btn cm-market-btn-unequip" @click="cancel(o.id)">{{ t('撤销') }}</button>
          </div>
        </template>
        <template v-else-if="currentTab === 'sell'">
          <div v-for="item in sellItems" :key="item.itemId" class="cm-market-item">
            <span class="cm-market-tag" :style="tagStyle(item)">{{ item.tag }}</span>
            <div class="cm-market-info">
              <div class="cm-market-name">{{ item.name }}</div>
            </div>
            <span v-if="item.equipped" class="cm-market-badge cm-market-badge-equip">{{ t('已装备') }}</span>
            <span v-else-if="item.sellable === false" class="cm-market-badge cm-market-badge-honor">{{ t('荣誉商品') }}</span>
            <template v-else>
              <input class="cm-market-sell-input" type="number" min="1" v-model="prices[item.itemId]" :placeholder="t('价格')">
              <button type="button" class="cm-market-btn cm-market-btn-buy" @click="sell(item.itemId)">{{ t('挂单') }}</button>
            </template>
          </div>
        </template>
      </template>
    </div>
  </div>`
};
