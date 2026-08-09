// v1.52 管理后台 Vue3 迁移 - 荣誉管理（荣誉商品 CRUD + 手动发放/扣除荣誉币）
import * as Vue from '/static/admin/vendor/vue.js';
import { toast, TAG_COLORS, LIGHT_COLORS } from '/static/admin/store.js';

export default {
  name: 'HonorSection',
  setup() {
    const items = Vue.ref([]);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    // 手动发放表单
    const manual = Vue.reactive({ name: '', amount: '' });
    // 添加商品表单
    const form = Vue.reactive({ name: '', desc: '', honorPrice: '', tag: '', color: '', border: '' });
    const colors = ['', ...Object.keys(TAG_COLORS)];

    async function load() {
      loading.value = true; err.value = false;
      try {
        const r = await fetch('/api/admin/honor/honor-shop/items');
        const data = await r.json();
        items.value = Array.isArray(data) ? data : [];
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    function colorText(c) {
      const hex = TAG_COLORS[c];
      if (!hex) return '#888';
      return LIGHT_COLORS.has(c) ? '#222' : '#fff';
    }

    async function manualAdd() {
      const name = manual.name.trim();
      const amount = manual.amount.trim();
      if (!name || amount === '') { toast('请填写用户名和金额', 'warn'); return; }
      try {
        const r = await fetch('/api/admin/honor/add', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, amount })
        });
        const d = await r.json();
        if (d.error) { toast(d.error, 'err'); return; }
        toast('操作成功');
        manual.name = ''; manual.amount = '';
        await load();
      } catch (e) { toast('操作失败: ' + e.message, 'err'); }
    }

    async function addItem() {
      const name = form.name.trim();
      // type=number 的 v-model 返回 number，统一转字符串再 trim 校验
      const honorPrice = String(form.honorPrice == null ? '' : form.honorPrice).trim();
      if (!name || !honorPrice) { toast('请填写商品名称和荣誉价格', 'warn'); return; }
      try {
        const r = await fetch('/api/admin/honor/honor-shop/item/add', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description: form.desc.trim(), honorPrice, tag: form.tag.trim(), color: form.color, border: form.border })
        });
        const d = await r.json();
        if (d.error) { toast(d.error, 'err'); return; }
        toast('商品已添加');
        form.name = ''; form.desc = ''; form.honorPrice = ''; form.tag = ''; form.color = ''; form.border = '';
        await load();
      } catch (e) { toast('添加失败: ' + e.message, 'err'); }
    }

    async function toggle(item) {
      try {
        const r = await fetch('/api/admin/honor/honor-shop/item/toggle', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id })
        });
        const d = await r.json();
        if (d.error) { toast(d.error, 'err'); return; }
        await load();
      } catch (e) { toast('操作失败', 'err'); }
    }

    async function del(item) {
      if (!confirm('确定删除此荣誉商品？')) return;
      try {
        const r = await fetch('/api/admin/honor/honor-shop/item/delete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id })
        });
        const d = await r.json();
        if (d.error) { toast(d.error, 'err'); return; }
        await load();
      } catch (e) { toast('删除失败', 'err'); }
    }

    Vue.onMounted(load);
    return { items, loading, err, manual, form, colors, TAG_COLORS, colorText, manualAdd, addItem, toggle, del };
  },
  template: `
  <div class="av-page">
    <h1>🪙 荣誉管理</h1>
    <p class="av-sub">荣誉币手动发放 / 扣除 + 荣誉商店商品管理（需 super 权限）</p>

    <!-- 手动发放 -->
    <div class="av-card" style="padding:16px 18px;margin-bottom:16px">
      <h3 style="margin:0 0 12px;font-size:15px">💸 手动发放 / 扣除荣誉币</h3>
      <div class="av-toolbar" style="flex-wrap:wrap">
        <input v-model="manual.name" class="av-input" placeholder="用户名" style="width:150px" />
        <input v-model="manual.amount" class="av-input mono" type="number" placeholder="金额(可负)" style="width:130px" @keydown.enter="manualAdd" />
        <button class="av-btn success" @click="manualAdd">提交</button>
        <span class="av-badge" style="background:rgba(246,166,9,.14);color:var(--orange);border:1px solid rgba(246,166,9,.35)">负数为扣除</span>
      </div>
    </div>

    <!-- 添加商品 -->
    <div class="av-card" style="padding:16px 18px;margin-bottom:16px">
      <h3 style="margin:0 0 12px;font-size:15px">✨ 添加荣誉商品</h3>
      <div class="av-toolbar" style="flex-wrap:wrap;gap:8px">
        <input v-model="form.name" class="av-input" placeholder="商品名称" style="width:110px" />
        <input v-model="form.desc" class="av-input" placeholder="描述" style="width:130px" />
        <input v-model="form.honorPrice" class="av-input mono" type="number" placeholder="荣誉价格" style="width:90px" />
        <input v-model="form.tag" class="av-input" placeholder="标签文字" style="width:80px" />
        <select v-model="form.color" class="av-select" style="width:70px"><option value="">无色</option><option v-for="c in colors.filter(x=>x)" :key="c" :value="c">{{ c }}</option></select>
        <select v-model="form.border" class="av-select" style="width:70px"><option value="">无边框</option><option v-for="c in colors.filter(x=>x)" :key="c" :value="c">{{ c }}</option></select>
        <button class="av-btn primary" @click="addItem">添加商品</button>
      </div>
    </div>

    <!-- 商品列表 -->
    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="items.length === 0" class="av-empty">暂无荣誉商品</div>
    <div v-else class="av-table-wrap">
      <table class="av-table">
        <thead><tr><th>名称</th><th>描述</th><th>荣誉价</th><th>标签</th><th>颜色</th><th>边框</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td style="font-weight:600">{{ item.name }}</td>
            <td style="color:var(--text-2)">{{ item.description || '' }}</td>
            <td><span class="av-badge" style="background:rgba(246,166,9,.14);color:var(--orange);border:1px solid rgba(246,166,9,.35)">🪙 {{ item.honorPrice }}</span></td>
            <td><span class="av-badge" :style="{ background: (TAG_COLORS[item.color] || '#95a5a6'), color: colorText(item.color) }">{{ item.tag || '' }}</span></td>
            <td><span v-if="item.color && TAG_COLORS[item.color]" class="av-swatch" style="display:inline-block;width:18px;height:18px;border-radius:5px;vertical-align:middle" :style="{ background: TAG_COLORS[item.color] }"></span><span v-else style="color:var(--text-3)">-</span></td>
            <td class="mono" style="color:var(--text-2)">{{ item.border || '-' }}</td>
            <td><span class="av-badge" :style="item.enabled
              ? { background:'rgba(74,222,128,.14)', color:'var(--green)' }
              : { background:'rgba(255,255,255,.06)', color:'var(--text-3)' }">{{ item.enabled ? '上架' : '下架' }}</span></td>
            <td style="display:flex;gap:4px">
              <button class="av-btn sm" :class="item.enabled ? 'danger' : 'success'" @click="toggle(item)">{{ item.enabled ? '下架' : '上架' }}</button>
              <button class="av-btn danger sm" @click="del(item)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>`
};
