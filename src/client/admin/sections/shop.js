// v1.52 管理后台 Vue3 迁移 - 商店管理（装扮商品上架/下架/删除/新增）
import * as Vue from '/static/admin/vendor/vue.js';
import { toast, TAG_COLORS } from '/static/admin/store.js';

export default {
  name: 'ShopSection',
  setup() {
    const items = Vue.ref([]);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    const statsText = Vue.ref('');
    // 添加表单
    const form = Vue.reactive({ name: '', desc: '', price: '', tag: '', color: '', border: '' });
    const swatches = ['', ...Object.keys(TAG_COLORS)];

    async function load() {
      loading.value = true; err.value = false;
      try {
        const r = await fetch('/api/admin/shop/items');
        const data = await r.json();
        items.value = Array.isArray(data) ? data : [];
        const enabled = items.value.filter(i => i.enabled).length;
        statsText.value = enabled + '/' + items.value.length + ' 件上架';
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    async function add() {
      const name = form.name.trim();
      const price = form.price;
      const tag = form.tag.trim();
      if (!name || !price || !tag) { toast('请至少填写商品名称、价格和标签', 'warn'); return; }
      try {
        const r = await fetch('/api/admin/shop/item/add', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description: form.desc.trim(), price: parseInt(price), tag, color: form.color, border: form.border })
        });
        const data = await r.json();
        if (data.error) { toast(data.error, 'err'); return; }
        form.name = ''; form.desc = ''; form.price = ''; form.tag = ''; form.color = ''; form.border = '';
        toast('已添加商品');
        await load();
      } catch (e) { toast('添加失败: ' + e.message, 'err'); }
    }

    async function toggle(item) {
      try {
        const r = await fetch('/api/admin/shop/item/toggle', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: item.id })
        });
        const data = await r.json();
        if (data.error) { toast(data.error, 'err'); return; }
        await load();
      } catch (e) { toast('操作失败', 'err'); }
    }

    async function del(item) {
      if (!confirm('确定删除此商品？')) return;
      try {
        const r = await fetch('/api/admin/shop/item/delete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: item.id })
        });
        const data = await r.json();
        if (data.error) { toast(data.error, 'err'); return; }
        await load();
      } catch (e) { toast('删除失败', 'err'); }
    }

    Vue.onMounted(load);
    return { items, loading, err, statsText, form, swatches, TAG_COLORS, add, toggle, del };
  },
  template: `
  <div class="av-page">
    <h1>🛒 商店管理</h1>
    <p class="av-sub">装扮商品上架/下架，标签 + 颜色 + 边框配色</p>
    <div class="av-card" style="padding:14px 16px;margin-bottom:16px">
      <div class="av-toolbar" style="flex-wrap:wrap;gap:8px">
        <input v-model="form.name" class="av-input" placeholder="商品名称" style="width:110px" />
        <input v-model="form.desc" class="av-input" placeholder="描述" style="width:130px" />
        <input v-model="form.price" class="av-input" type="number" placeholder="价格" style="width:70px" />
        <input v-model="form.tag" class="av-input" placeholder="标签文字" style="width:80px" />
        <div style="display:flex;gap:3px;flex-wrap:wrap;max-width:210px;padding:4px;border:1px solid var(--border);border-radius:8px;background:var(--panel)">
          <div v-for="c in swatches" :key="'c' + c" class="av-swatch"
               :style="{ background: c ? (TAG_COLORS[c] || '#888') : '#fff', outline: form.color === c ? '2px solid var(--accent)' : 'none' }"
               :title="c || '无色'" @click="form.color = c"></div>
        </div>
        <span style="color:var(--text-3);font-size:11px">颜色:{{ form.color || '无色' }}</span>
        <div style="display:flex;gap:3px;flex-wrap:wrap;max-width:210px;padding:4px;border:1px solid var(--border);border-radius:8px;background:var(--panel)">
          <div v-for="c in swatches" :key="'b' + c" class="av-swatch"
               :style="{ background: c ? (TAG_COLORS[c] || '#888') : '#fff', outline: form.border === c ? '2px solid var(--accent)' : 'none' }"
               :title="c || '无边框'" @click="form.border = c"></div>
        </div>
        <span style="color:var(--text-3);font-size:11px">边框:{{ form.border || '无' }}</span>
        <button class="av-btn primary" @click="add">添加商品</button>
        <span style="flex:1"></span>
        <span style="color:var(--text-2);font-size:13px">{{ statsText }}</span>
      </div>
    </div>
    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="items.length === 0" class="av-empty">暂无商品</div>
    <div v-else class="av-table-wrap">
      <table class="av-table">
        <thead><tr><th>名称</th><th>描述</th><th>标签</th><th>颜色</th><th>价格</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td style="font-weight:600">{{ item.name }}</td>
            <td style="color:var(--text-2)">{{ item.description || '' }}</td>
            <td><span class="av-badge" :style="{ background: (TAG_COLORS[item.color] || '#95a5a6') }">{{ item.tag }}</span></td>
            <td><span v-if="item.color" class="av-swatch" style="display:inline-block;vertical-align:middle" :style="{ background: (TAG_COLORS[item.color] || item.color) }"></span><span v-else style="color:var(--text-3)">-</span></td>
            <td class="mono" style="color:var(--orange)">{{ item.price }}</td>
            <td><span class="av-badge" :style="{ background: item.enabled ? 'rgba(74,222,128,.15)' : 'rgba(255,255,255,.08)', color: item.enabled ? 'var(--green)' : 'var(--text-3)' }">{{ item.enabled ? '已上架' : '已下架' }}</span></td>
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
