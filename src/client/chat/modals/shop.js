// v1.53 商城弹窗 — Vue3 重写（批1 经济域）
// 完全接管旧 #shop-overlay 的 UI：商品列表 / 我的背包 / 荣誉商城三 tab。
// 复用的 API 与原 shop.js 完全一致（/api/shop/items、/api/shop/inventory、/api/shop/buy、/api/shop/equip、
// /api/shop/unequip、/api/honor/shop/items、/api/honor/get、/api/honor/shop/buy、/api/points/all）。
// 弹窗壳由 modal-manager 提供，本文件只注入自身布局样式（全部用聊天室 CSS 变量）。
// 文案与旧 overlay 保持一致（t() 复用已有 key，不新增）。
import * as Vue from '/static/chat/vendor/vue.js';
import { state, t } from '../state.js';
import { updatePointsDisplay } from '../renderers.js';
import { getAuthName, getAuthToken, isAuthenticated } from '../auth.js';
import { TAG_COLORS } from '../vip.js';
import { injectCss } from '../modal-manager.js';

injectCss('cm-style-shop', `
.cm-shop { display: flex; flex-direction: column; min-width: min(480px, 90vw); }
.cm-shop-points { font-size: 13px; font-weight: 600; color: #e67e22; margin-left: 12px; white-space: nowrap; }
.cm-shop-tabs { display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.cm-shop-tab { flex: 1; padding: 10px; text-align: center; font-weight: 600; font-size: 14px; cursor: pointer; color: var(--text-secondary); border: none; background: none; border-bottom: 2px solid transparent; transition: all .2s; font-family: inherit; }
.cm-shop-tab:hover { color: var(--text); }
.cm-shop-tab.active { color: var(--primary); border-bottom-color: var(--primary); }
.cm-shop-content { flex: 1; overflow-y: auto; padding: 16px 20px; }
.cm-shop-empty { text-align: center; padding: 40px 16px; color: var(--text-secondary); font-size: 14px; }
.cm-shop-item { display: flex; align-items: center; padding: 14px 16px; margin-bottom: 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; }
.cm-shop-tag { display: inline-block; font-size: 12px; font-weight: 700; color: #fff; padding: 4px 10px; border-radius: 6px; margin-right: 14px; text-align: center; min-width: 56px; flex-shrink: 0; }
.cm-shop-info { flex: 1; min-width: 0; }
.cm-shop-name { font-weight: 600; font-size: 15px; }
.cm-shop-desc { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.cm-shop-price { font-size: 14px; font-weight: 700; color: #e67e22; margin: 0 12px; white-space: nowrap; }
.cm-shop-btn { border: none; border-radius: 8px; padding: 8px 16px; font-weight: 600; font-size: 13px; cursor: pointer; transition: all .2s; white-space: nowrap; font-family: inherit; }
.cm-shop-btn-buy { background: var(--primary); color: #fff; }
.cm-shop-btn-buy:hover { background: var(--primary-dark); }
.cm-shop-btn-equip { background: #2ecc71; color: #fff; }
.cm-shop-btn-equip:hover { background: #27ae60; }
.cm-shop-btn-unequip { background: #95a5a6; color: #fff; }
.cm-shop-btn-unequip:hover { background: #7f8c8d; }
.cm-shop-equip-badge { display: inline-block; font-size: 10px; font-weight: 700; background: #2ecc71; color: #fff; padding: 2px 6px; border-radius: 4px; margin-left: 8px; }
.cm-shop-honor-balance { padding: 8px 0 12px; font-size: 13px; color: #e67e22; font-weight: 600; }
.cm-link { color: var(--primary); cursor: pointer; text-decoration: underline; }
`);

// 轻量防抖——同一商品操作处理中直接忽略重复点击（对齐旧 shop.js _shopBusy）
const _shopBusy = new Set();

function tagStyle(item) {
  const s = {};
  s.background = item && item.color && TAG_COLORS[item.color] ? TAG_COLORS[item.color] : '#95a5a6';
  if (item && item.border && TAG_COLORS[item.border]) {
    s.outline = '2px solid ' + TAG_COLORS[item.border];
    s.outlineOffset = '-1px';
  }
  return s;
}

export default {
  name: 'ShopModal',
  props: ['tab'],
  setup(props) {
    const currentTab = Vue.ref(props.tab || 'buy');
    const loading = Vue.ref(false);
    const error = Vue.ref('');
    const notLoggedIn = Vue.ref(false);
    const points = Vue.ref(0);
    const honorBalance = Vue.ref(0);
    const items = Vue.ref([]);       // 商品列表
    const inventory = Vue.ref([]);   // 我的背包
    const honorItems = Vue.ref([]);  // 荣誉商品

    function refreshPoints() {
      let name = getAuthName();
      if (!name) return;
      fetch('/api/points/all').then(r => r.json()).then(data => {
        if (data && data[name] !== undefined) points.value = data[name];
      }).catch(() => {});
    }

    async function loadShopItems() {
      try {
        const r = await fetch('/api/shop/items');
        const list = await r.json();
        if (!list || list.length === 0) { items.value = []; error.value = '暂无商品'; }
        else { items.value = list; error.value = ''; }
      } catch (e) { items.value = []; error.value = '加载失败: ' + e.message; }
      finally { loading.value = false; }
    }

    async function loadInventory() {
      try {
        const r = await fetch('/api/shop/inventory?name=' + encodeURIComponent(getAuthName()));
        const list = await r.json();
        if (!list || list.length === 0) { inventory.value = []; error.value = '背包空空如也，去商品列表购买吧'; }
        else { inventory.value = list; error.value = ''; }
      } catch (e) { inventory.value = []; error.value = '加载失败: ' + e.message; }
      finally { loading.value = false; }
    }

    async function loadHonorItems() {
      let name = getAuthName();
      let balance = 0;
      try {
        const hb = await fetch('/api/honor/get?name=' + encodeURIComponent(name));
        const hd = await hb.json();
        if (hd && hd.honor !== undefined) balance = Number(hd.honor);
      } catch (e) {}
      honorBalance.value = balance;
      try {
        const r = await fetch('/api/honor/shop/items');
        const list = await r.json();
        if (!list || list.length === 0) { honorItems.value = []; error.value = '暂无荣誉商品'; }
        else { honorItems.value = list; error.value = ''; }
      } catch (e) { honorItems.value = []; error.value = '加载失败: ' + e.message; }
      finally { loading.value = false; }
    }

    function switchTab(tab) {
      currentTab.value = tab;
      error.value = '';
      if (!isAuthenticated()) { notLoggedIn.value = true; loading.value = false; return; }
      notLoggedIn.value = false;
      loading.value = true;
      if (tab === 'buy') loadShopItems();
      else if (tab === 'honor') loadHonorItems();
      else loadInventory();
    }

    // 重复 openModal('shop', { tab }) 时（如标签仓库按钮 openShop('inventory')）切 tab 不重建
    Vue.watch(() => props.tab, (v) => { if (v) switchTab(v); });

    async function doBuy(id) {
      if (_shopBusy.has(id)) return;
      _shopBusy.add(id);
      try {
        const r = await fetch('/api/shop/buy', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: getAuthName(), itemId: id, token: getAuthToken()})});
        const data = await r.json();
        if (data.error) alert(data.error);
        else { alert('购买成功！'); updatePointsDisplay(); refreshPoints(); loadShopItems(); }
      } catch (e) { alert('购买失败: ' + e.message); }
      finally { _shopBusy.delete(id); }
    }

    async function doEquip(id) {
      if (_shopBusy.has(id)) return;
      _shopBusy.add(id);
      try {
        const r = await fetch('/api/shop/equip', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: getAuthName(), itemId: id, token: getAuthToken()})});
        const data = await r.json();
        if (data.error) alert(data.error);
        else { alert('装备成功！'); updatePointsDisplay(); loadInventory(); }
      } catch (e) { alert('装备失败: ' + e.message); }
      finally { _shopBusy.delete(id); }
    }

    async function doUnequip() {
      if (_shopBusy.has('__unequip__')) return;
      _shopBusy.add('__unequip__');
      try {
        const r = await fetch('/api/shop/unequip', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: getAuthName(), token: getAuthToken()})});
        const data = await r.json();
        if (data.error) alert(data.error);
        else { alert('已卸下装备'); updatePointsDisplay(); loadInventory(); }
      } catch (e) { alert('操作失败: ' + e.message); }
      finally { _shopBusy.delete('__unequip__'); }
    }

    async function doHonorBuy(id) {
      if (_shopBusy.has(id)) return;
      _shopBusy.add(id);
      try {
        const r = await fetch('/api/honor/shop/buy', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: getAuthName(), itemId: id, token: getAuthToken()})});
        const data = await r.json();
        if (data.error) alert(data.error);
        else { alert('购买成功！'); loadHonorItems(); }
      } catch (e) { alert('购买失败: ' + e.message); }
      finally { _shopBusy.delete(id); }
    }

    // 首开加载（当前 tab）
    switchTab(currentTab.value);

    return {
      currentTab, loading, error, notLoggedIn, points, honorBalance,
      items, inventory, honorItems, tagStyle, switchTab,
      doBuy, doEquip, doUnequip, doHonorBuy, t,
    };
  },
  template: `
  <div class="cm-shop">
    <div class="cm-header">
      <span>🏪 商城</span>
      <span class="cm-shop-points">{{ points }}{{ t(' 积分') }}</span>
      <button class="cm-close" @click="$emit('close')" title="关闭">&times;</button>
    </div>
    <div class="cm-shop-tabs">
      <button type="button" class="cm-shop-tab" :class="{active: currentTab === 'buy'}" @click="switchTab('buy')">商品列表</button>
      <button type="button" class="cm-shop-tab" :class="{active: currentTab === 'inventory'}" @click="switchTab('inventory')">我的背包</button>
      <button type="button" class="cm-shop-tab" :class="{active: currentTab === 'honor'}" @click="switchTab('honor')">🪙 荣誉</button>
    </div>
    <div class="cm-shop-content">
      <div v-if="notLoggedIn" class="cm-shop-empty">请先<span class="cm-link" @click="$emit('close')">登录</span>后使用商城</div>
      <template v-else>
        <div v-if="currentTab === 'honor'" class="cm-shop-honor-balance">🪙 荣誉币：{{ honorBalance }}</div>
        <div v-if="loading" class="cm-shop-empty">加载中...</div>
        <div v-else-if="error" class="cm-shop-empty">{{ error }}</div>
        <template v-else-if="currentTab === 'buy'">
          <div v-for="it in items" :key="it.id" class="cm-shop-item">
            <span class="cm-shop-tag" :style="tagStyle(it)">{{ it.tag }}</span>
            <div class="cm-shop-info">
              <div class="cm-shop-name">{{ it.name }}</div>
              <div v-if="it.description" class="cm-shop-desc">{{ it.description }}</div>
            </div>
            <span class="cm-shop-price">{{ it.price }} 积分</span>
            <button type="button" class="cm-shop-btn cm-shop-btn-buy" @click="doBuy(it.id)">购买</button>
          </div>
        </template>
        <template v-else-if="currentTab === 'inventory'">
          <div v-for="it in inventory" :key="it.itemId" class="cm-shop-item">
            <span class="cm-shop-tag" :style="tagStyle(it)">{{ it.tag }}</span>
            <div class="cm-shop-info">
              <div class="cm-shop-name">{{ it.name }}<span v-if="it.equipped" class="cm-shop-equip-badge">已装备</span></div>
            </div>
            <button v-if="it.equipped" type="button" class="cm-shop-btn cm-shop-btn-unequip" @click="doUnequip()">卸下</button>
            <button v-else type="button" class="cm-shop-btn cm-shop-btn-equip" @click="doEquip(it.itemId)">装备</button>
          </div>
        </template>
        <template v-else-if="currentTab === 'honor'">
          <div v-for="it in honorItems" :key="it.id" class="cm-shop-item">
            <span class="cm-shop-tag" :style="tagStyle(it)">{{ it.tag }}</span>
            <div class="cm-shop-info">
              <div class="cm-shop-name">{{ it.name }}</div>
              <div v-if="it.description" class="cm-shop-desc">{{ it.description }}</div>
            </div>
            <span class="cm-shop-price">{{ it.honorPrice }} 荣誉</span>
            <button type="button" class="cm-shop-btn cm-shop-btn-buy" @click="doHonorBuy(it.id)">兑换</button>
          </div>
        </template>
      </template>
    </div>
  </div>`
};
