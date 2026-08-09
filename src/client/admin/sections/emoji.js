// v1.52 管理后台 Vue3 迁移 - 表情管理（上传/预览/删除）
// 名称规则 /^[a-zA-Z0-9_一-鿿]+$/，文件 ≤200KB，FileReader 转 data URI
import * as Vue from '/static/admin/vendor/vue.js';
import { toast } from '/static/admin/store.js';

export default {
  name: 'EmojiSection',
  setup() {
    const emojis = Vue.ref([]);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    const name = Vue.ref('');
    const file = Vue.ref(null);
    const preview = Vue.ref('');
    const uploading = Vue.ref(false);

    async function load() {
      loading.value = true; err.value = false;
      try {
        // /api/emoji/list 为公开端点，返回 { name: dataUri }（含图片数据，可预览）
        const r = await fetch('/api/emoji/list');
        const data = await r.json();
        emojis.value = Object.keys(data || {}).map(name => ({ name, data: data[name] }));
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    // 文件选择 -> 校验 + 预览
    function onFile(ev) {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      if (f.size > 200 * 1024) { toast('文件超过 200KB，请压缩后上传', 'err'); file.value = null; preview.value = ''; ev.target.value = ''; return; }
      file.value = f;
      const rd = new FileReader();
      rd.onload = () => { preview.value = rd.result; };
      rd.readAsDataURL(f);
    }

    async function add() {
      const n = name.value.trim();
      if (!n) { toast('请输入表情名称', 'warn'); return; }
      if (!/^[a-zA-Z0-9_一-鿿]+$/.test(n)) { toast('名称仅限字母数字下划线中文', 'err'); return; }
      if (!preview.value) { toast('请先选择图片文件', 'warn'); return; }
      uploading.value = true;
      try {
        const r = await fetch('/api/admin/emoji/add', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: n, data: preview.value })
        });
        const d = await r.json();
        if (d.error) { toast(d.error, 'err'); return; }
        toast('已上传 :' + n + ':');
        name.value = ''; file.value = null; preview.value = '';
        const inp = document.getElementById('emoji-file-input');
        if (inp) inp.value = '';
        await load();
      } catch (e) { toast('上传失败: ' + e.message, 'err'); }
      uploading.value = false;
    }

    async function del(n) {
      if (!confirm('确定删除 :' + n + ': ？')) return;
      try {
        const r = await fetch('/api/admin/emoji/remove?name=' + encodeURIComponent(n));
        const d = await r.json();
        if (d.error) { toast(d.error, 'err'); return; }
        toast('已删除');
        await load();
      } catch (e) { toast('删除失败', 'err'); }
    }

    Vue.onMounted(load);
    return { emojis, loading, err, name, file, preview, uploading, onFile, add, del };
  },
  template: `
  <div class="av-page">
    <h1>😀 表情管理</h1>
    <p class="av-sub">上传聊天室自定义表情，用户输入 :名称: 使用（≤200KB）</p>

    <div class="av-card" style="padding:16px 18px;margin-bottom:18px">
      <h3 style="margin:0 0 12px;font-size:15px">📤 上传表情</h3>
      <div class="av-toolbar" style="flex-wrap:wrap">
        <input v-model="name" class="av-input mono" placeholder="名称(字母/数字/下划线/中文)" style="width:200px" />
        <input id="emoji-file-input" class="av-input" type="file" accept="image/*" style="width:220px;padding:5px" @change="onFile" />
        <button class="av-btn primary" :disabled="uploading" @click="add">{{ uploading ? '上传中...' : '上传' }}</button>
        <span v-if="preview" style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:var(--text-2)">预览 :{{ name || 'name' }}:</span>
          <img :src="preview" style="width:34px;height:34px;object-fit:contain;border:1px solid var(--border);border-radius:8px;background:rgba(0,0,0,.3);padding:3px" />
        </span>
      </div>
    </div>

    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="emojis.length === 0" class="av-empty">暂无表情，上传一个新表情吧</div>
    <div v-else style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px">
      <div v-for="e in emojis" :key="e.name" class="av-card" style="padding:14px;display:flex;flex-direction:column;align-items:center;gap:10px">
        <img :src="e.data" style="width:44px;height:44px;object-fit:contain;border:1px solid var(--border);border-radius:10px;background:rgba(0,0,0,.3);padding:4px" :alt="':' + e.name + ':'" />
        <span class="mono" style="font-size:12px;color:var(--accent);word-break:break-all;text-align:center">:{{ e.name }}:</span>
        <button class="av-btn danger sm" @click="del(e.name)" style="align-self:stretch;justify-content:center">删除</button>
      </div>
    </div>
  </div>`
};
