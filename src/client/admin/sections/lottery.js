// v1.52 管理后台 Vue3 迁移 - 抽奖管理（奖池卡片 + 新建/编辑奖池弹窗 + 添加奖品弹窗）
import * as Vue from '/static/admin/vendor/vue.js';
import { toast } from '/static/admin/store.js';

export default {
  name: 'LotterySection',
  setup() {
    const pools = Vue.ref([]);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    // 奖池弹窗
    const poolOpen = Vue.ref(false);
    const poolEditId = Vue.ref('');
    const poolForm = Vue.reactive({ name: '', desc: '', cost: '100' });
    // 奖品弹窗
    const prizeOpen = Vue.ref(false);
    const prizePoolId = Vue.ref('');
    const prizeForm = Vue.reactive({ name: '', probability: '10', stock: '10', tag: '', color: '' });

    async function load() {
      loading.value = true; err.value = false;
      try {
        const r = await fetch('/api/admin/lottery/pools');
        const data = await r.json();
        pools.value = Array.isArray(data) ? data : [];
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    function openAddPool() { poolEditId.value = ''; poolForm.name = ''; poolForm.desc = ''; poolForm.cost = '100'; poolOpen.value = true; }
    function openEditPool(pool) {
      poolEditId.value = pool.id;
      poolForm.name = pool.name || '';
      poolForm.desc = pool.description || '';
      poolForm.cost = String(pool.cost ?? '');
      poolOpen.value = true;
    }
    function closePool() { poolOpen.value = false; }

    async function savePool() {
      const name = poolForm.name.trim();
      if (!name) { toast('请输入奖池名称', 'warn'); return; }
      const url = poolEditId.value
        ? '/api/admin/lottery/pool/update'
        : '/api/admin/lottery/pool/create';
      const body = poolEditId.value
        ? { id: poolEditId.value, name, description: poolForm.desc.trim(), cost: parseInt(poolForm.cost) }
        : { name, description: poolForm.desc.trim(), cost: parseInt(poolForm.cost) };
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await r.json();
        if (data.ok) { closePool(); toast('已保存'); await load(); }
        else toast('保存失败: ' + (data.error || '未知错误'), 'err');
      } catch (e) { toast('保存失败: ' + e.message, 'err'); }
    }

    async function togglePool(pool) {
      try {
        const r = await fetch('/api/admin/lottery/pool/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pool.id }) });
        const data = await r.json();
        if (data.ok) await load();
        else toast('操作失败: ' + (data.error || '未知错误'), 'err');
      } catch (e) { toast('操作失败', 'err'); }
    }

    async function delPool(pool) {
      if (!confirm('确定删除此奖池？')) return;
      try {
        const r = await fetch('/api/admin/lottery/pool/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pool.id }) });
        const data = await r.json();
        if (data.ok) await load();
        else toast('删除失败: ' + (data.error || '未知错误'), 'err');
      } catch (e) { toast('删除失败', 'err'); }
    }

    function openAddPrize(pool) {
      prizePoolId.value = pool.id;
      prizeForm.name = ''; prizeForm.probability = '10'; prizeForm.stock = '10'; prizeForm.tag = ''; prizeForm.color = '';
      prizeOpen.value = true;
    }
    function closePrize() { prizeOpen.value = false; }

    async function addPrize() {
      const name = prizeForm.name.trim();
      if (!name) { toast('请输入奖品名称', 'warn'); return; }
      const probability = parseFloat(prizeForm.probability) || 0;
      const stock = parseInt(prizeForm.stock) || 0;
      try {
        const r = await fetch('/api/admin/lottery/prize/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poolId: prizePoolId.value, name, probability, stock, tag: prizeForm.tag.trim(), color: prizeForm.color.trim() })
        });
        const data = await r.json();
        if (data.ok) { closePrize(); toast('已添加奖品'); await load(); }
        else toast('添加失败: ' + (data.error || '未知错误'), 'err');
      } catch (e) { toast('添加失败: ' + e.message, 'err'); }
    }

    async function delPrize(pool, pr) {
      if (!confirm('确定删除此奖品？')) return;
      try {
        const r = await fetch('/api/admin/lottery/prize/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poolId: pool.id, prizeId: pr.id }) });
        const data = await r.json();
        if (data.ok) await load();
        else toast('删除失败: ' + (data.error || '未知错误'), 'err');
      } catch (e) { toast('删除失败', 'err'); }
    }

    async function restock(pool, pr) {
      try {
        const r = await fetch('/api/admin/lottery/prize/restock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poolId: pool.id, prizeId: pr.id }) });
        const data = await r.json();
        if (data.ok) await load();
        else toast('补货失败: ' + (data.error || '未知错误'), 'err');
      } catch (e) { toast('补货失败', 'err'); }
    }

    Vue.onMounted(load);
    return { pools, loading, err, poolOpen, poolForm, prizeOpen, prizeForm, openAddPool, openEditPool, closePool, savePool, togglePool, delPool, openAddPrize, closePrize, addPrize, delPrize, restock };
  },
  template: `
  <div class="av-page">
    <h1>🎰 抽奖管理</h1>
    <p class="av-sub">奖池 + 奖品配置（概率 / 库存 / 标签）</p>
    <div style="margin-bottom:16px">
      <button class="av-btn primary" @click="openAddPool">＋ 新建奖池</button>
    </div>
    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="pools.length === 0" class="av-empty">暂无奖池</div>
    <div v-else>
      <div v-for="pool in pools" :key="pool.id" class="av-card" style="padding:12px 16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-weight:700">{{ pool.name }} <span class="av-badge" :style="{ background: pool.enabled ? 'rgba(74,222,128,.15)' : 'rgba(255,255,255,.08)', color: pool.enabled ? 'var(--green)' : 'var(--text-3)' }">{{ pool.enabled ? '启用' : '禁用' }}</span></div>
          <div style="display:flex;gap:4px">
            <button class="av-btn sm" @click="openEditPool(pool)">编辑</button>
            <button class="av-btn sm" :class="pool.enabled ? 'danger' : 'success'" @click="togglePool(pool)">{{ pool.enabled ? '禁用' : '启用' }}</button>
            <button class="av-btn danger sm" @click="delPool(pool)">删除</button>
          </div>
        </div>
        <div style="color:var(--text-2);font-size:13px;margin-bottom:8px">{{ pool.description || '' }} <span class="mono" style="color:var(--orange)">| 每次 {{ pool.cost }} 积分</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">
          <span v-for="pr in (pool.prizes || [])" :key="pr.id" class="av-prize-chip">
            {{ pr.name }} ({{ pr.stock }}/{{ pr.initialStock }})
            <a style="color:#ff6b6b;cursor:pointer;text-decoration:none;margin-left:4px" @click="delPrize(pool, pr)">x</a>
            <a style="color:#4ade80;cursor:pointer;text-decoration:none;margin-left:3px" @click="restock(pool, pr)">补</a>
          </span>
          <button class="av-btn sm" style="font-size:11px;padding:1px 8px" @click="openAddPrize(pool)">+ 添加奖品</button>
        </div>
      </div>
    </div>

    <!-- 奖池弹窗 -->
    <div v-if="poolOpen" class="av-modal-mask" @click.self="closePool">
      <div class="av-modal">
        <h3>{{ poolEditId ? '编辑奖池' : '新建奖池' }}<button class="av-modal-close" @click="closePool">✕</button></h3>
        <div class="av-field"><span class="lbl">名称</span><input v-model="poolForm.name" class="av-input" placeholder="奖池名称" /></div>
        <div class="av-field"><span class="lbl">描述</span><input v-model="poolForm.desc" class="av-input" placeholder="描述" /></div>
        <div class="av-field"><span class="lbl">每次积分</span><input v-model="poolForm.cost" class="av-input" type="number" placeholder="100" /></div>
        <div class="av-modal-actions"><button class="av-btn primary" @click="savePool">保存</button></div>
      </div>
    </div>

    <!-- 奖品弹窗 -->
    <div v-if="prizeOpen" class="av-modal-mask" @click.self="closePrize">
      <div class="av-modal">
        <h3>添加奖品<button class="av-modal-close" @click="closePrize">✕</button></h3>
        <div class="av-field"><span class="lbl">名称</span><input v-model="prizeForm.name" class="av-input" placeholder="奖品名称" /></div>
        <div class="av-field"><span class="lbl">概率</span><input v-model="prizeForm.probability" class="av-input" type="number" placeholder="10" /></div>
        <div class="av-field"><span class="lbl">库存</span><input v-model="prizeForm.stock" class="av-input" type="number" placeholder="10" /></div>
        <div class="av-field"><span class="lbl">标签</span><input v-model="prizeForm.tag" class="av-input" placeholder="如 VIP" /></div>
        <div class="av-field"><span class="lbl">颜色</span><input v-model="prizeForm.color" class="av-input" placeholder="gold" /></div>
        <div class="av-modal-actions"><button class="av-btn primary" @click="addPrize">添加</button></div>
      </div>
    </div>
  </div>`
};
