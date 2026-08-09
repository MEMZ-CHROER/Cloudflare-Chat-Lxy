// v1.52 管理后台 Vue3 迁移 - 市场管理（配置 + 订单列表/强制下架）
import * as Vue from '/static/admin/vendor/vue.js';
import { toast } from '/static/admin/store.js';

const DEFAULT_CONFIG = { enabled: true, feePercent: 10, maxOpenOrders: 5, maxPrice: "1000000" };

function statusText(s) {
  if (s === "open") return "挂单中";
  if (s === "sold") return "已售出";
  if (s === "cancelled") return "已下架";
  return s || "-";
}
function statusColor(s) {
  if (s === "open") return "rgba(74,222,128,.16)";
  if (s === "sold") return "rgba(122,162,255,.16)";
  if (s === "cancelled") return "rgba(255,107,107,.16)";
  return "rgba(255,255,255,.1)";
}

export default {
  name: 'MarketSection',
  setup() {
    const cfg = Vue.reactive({ ...DEFAULT_CONFIG });
    const orders = Vue.ref([]);
    const err = Vue.ref(false);
    const loading = Vue.ref(true);

    async function load() {
      loading.value = true; err.value = false;
      try {
        const cr = await fetch("/api/admin/market/config");
        if (cr.ok) {
          const c = await cr.json();
          if (c && typeof c === "object") Object.assign(cfg, { ...DEFAULT_CONFIG, ...c });
        }
        const or = await fetch("/api/admin/market/orders?limit=100");
        const d = await or.json();
        orders.value = Array.isArray(d.orders) ? d.orders : [];
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    async function saveConfig() {
      if (String(cfg.feePercent) === "" || String(cfg.maxOpenOrders) === "" || String(cfg.maxPrice) === "") { toast('请填写完整配置', 'warn'); return; }
      try {
        const r = await fetch("/api/admin/market/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feePercent: Number(cfg.feePercent),
            enabled: !!cfg.enabled,
            maxOpenOrders: Number(cfg.maxOpenOrders),
            maxPrice: String(cfg.maxPrice)
          })
        });
        const d = await r.json();
        if (d.error) { toast(d.error, 'err'); return; }
        toast('配置已保存');
        load();
      } catch (e) { toast('保存失败: ' + e.message, 'err'); }
    }

    async function delist(id) {
      if (!confirm('确定强制下架该订单？物品将退回卖家背包。')) return;
      try {
        const r = await fetch("/api/admin/market/delist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: id })
        });
        const d = await r.json();
        if (d.error) { toast(d.error, 'err'); return; }
        toast('已强制下架');
        load();
      } catch (e) { toast('操作失败: ' + e.message, 'err'); }
    }

    Vue.onMounted(load);
    return { cfg, orders, loading, err, load, saveConfig, delist, statusText, statusColor };
  },
  template: `
  <div class="av-page">
    <h1>💱 市场管理</h1>
    <p class="av-sub">P2P 交易市场配置与订单管理</p>
    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <template v-else>
      <div class="av-card" style="padding:14px 16px;margin-bottom:16px">
        <h3 style="margin:0 0 10px;font-size:15px">市场配置</h3>
        <div class="av-toolbar">
          <label style="font-size:13px;color:var(--text-2)">手续费(%)</label>
          <input v-model.number="cfg.feePercent" type="number" min="0" max="50" class="av-input" style="width:80px">
          <label style="font-size:13px;color:var(--text-2);display:flex;align-items:center;gap:5px;cursor:pointer">
            <input type="checkbox" v-model="cfg.enabled"> 启用市场
          </label>
          <label style="font-size:13px;color:var(--text-2)">挂单上限</label>
          <input v-model.number="cfg.maxOpenOrders" type="number" min="1" max="1000" class="av-input" style="width:90px">
          <label style="font-size:13px;color:var(--text-2)">价格上限</label>
          <input v-model.number="cfg.maxPrice" type="number" min="1" class="av-input" style="width:110px">
          <button class="av-btn success" @click="saveConfig">保存配置</button>
        </div>
      </div>
      <div class="av-table-wrap">
        <table class="av-table">
          <thead><tr><th>ID</th><th>物品</th><th>卖家</th><th>买家</th><th>价格</th><th>状态</th><th>挂单时间</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-if="orders.length === 0"><td colspan="8" class="av-empty">暂无订单</td></tr>
            <tr v-for="o in orders" :key="o.id">
              <td class="mono" style="font-size:12px;color:var(--text-2)">{{ o.id || '-' }}</td>
              <td>{{ o.itemName || '-' }}</td>
              <td class="mono">{{ o.seller || '-' }}</td>
              <td class="mono">{{ o.buyer || '-' }}</td>
              <td class="mono">{{ o.price ?? '-' }}</td>
              <td><span class="av-badge" :style="{ background: statusColor(o.status) }">{{ statusText(o.status) }}</span></td>
              <td class="mono" style="font-size:12px;color:var(--text-2)">{{ o.createdAt ? new Date(o.createdAt).toLocaleString() : '-' }}</td>
              <td>
                <button v-if="o.status === 'open'" class="av-btn sm danger" @click="delist(o.id)">强制下架</button>
                <span v-else style="color:var(--text-3)">-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>`
};
