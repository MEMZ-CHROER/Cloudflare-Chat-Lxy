// v1.56 内容沉淀：房间知识库弹窗 — Vue3（列表/查看/新建/编辑/删除 + 搜索 + [[docId]] 深链）
// 数据走 doc-store（WS 事件路由 + 广播订阅），正文经 markdownToHtml 渲染（复用 renderers）
// 权限：查看全部；编辑/删除仅作者本人或管理员（admin_logged cookie）
import * as Vue from '/static/chat/vendor/vue.js';
import { injectCss } from '../modal-manager.js';
import { getDocs, getCached, send, onChange } from '../doc-store.js';
import { state, t } from '../state.js';

injectCss('cm-style-kb', `
.cm-kb { display:flex; flex-direction:column; min-width:min(560px, 92vw); max-width:92vw; height:min(72vh, 640px); }
.cm-kb-body { flex:1; min-height:0; overflow-y:auto; padding:16px 20px; }
.cm-kb-toolbar { display:flex; gap:8px; margin-bottom:12px; }
.cm-kb-search { flex:1; padding:7px 12px; border:1px solid var(--border); border-radius:8px; background:var(--surface); color:var(--text); font-family:inherit; font-size:13px; }
.cm-kb-item { padding:10px 14px; border:1px solid var(--border); border-radius:10px; margin-bottom:8px; cursor:pointer; background:var(--surface); }
.cm-kb-item:hover { border-color: var(--primary); }
.cm-kb-item-title { font-weight:600; color:var(--text); font-size:14px; }
.cm-kb-item-meta { font-size:12px; color:var(--text-secondary); margin-top:3px; }
.cm-kb-tags { color: var(--primary); margin-left:6px; }
.cm-kb-viewhead { display:flex; gap:8px; margin-bottom:10px; }
.cm-kb-doctitle { margin:6px 0 12px; font-size:20px; color:var(--text); }
.cm-kb-docbody { font-size:14px; line-height:1.7; color:var(--text); word-break:break-word; }
.cm-kb-docbody h1, .cm-kb-docbody h2, .cm-kb-docbody h3, .cm-kb-docbody h4 { margin:10px 0 6px; color:var(--text); }
.cm-kb-docbody table { border-collapse:collapse; margin:8px 0; max-width:100%; }
.cm-kb-docbody th, .cm-kb-docbody td { border:1px solid var(--border); padding:4px 10px; }
.cm-kb-docbody th { background:rgba(128,128,128,.12); }
.cm-kb-docbody blockquote { border-left:3px solid var(--primary); padding:2px 12px; color:var(--text-secondary); margin:8px 0; background:rgba(128,128,128,.08); border-radius:0 6px 6px 0; }
.cm-kb-docbody pre { background:rgba(128,128,128,.1); padding:10px; border-radius:8px; overflow-x:auto; }
.cm-kb-docbody ul, .cm-kb-docbody ol { padding-left:22px; margin:6px 0; }
.cm-kb-docbody hr { border:none; border-top:1px solid var(--border); margin:10px 0; }
.cm-kb-docbody a { color: var(--primary); }
.cm-kb-input { width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px; margin-bottom:8px; background:var(--surface); color:var(--text); font-family:inherit; font-size:13px; }
.cm-kb-textarea { width:100%; min-height:260px; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--surface); color:var(--text); font-family:inherit; font-size:13px; resize:vertical; line-height:1.6; box-sizing:border-box; }
.cm-btn-primary { padding:7px 16px; border:none; border-radius:8px; background:var(--primary); color:#fff; cursor:pointer; font-family:inherit; font-size:13px; font-weight:600; }
.cm-btn { padding:7px 14px; border:1px solid var(--border); border-radius:8px; background:var(--surface); color:var(--text); cursor:pointer; font-family:inherit; font-size:13px; }
.cm-btn-danger { padding:7px 14px; border:1px solid #e74c3c; border-radius:8px; background:none; color:#e74c3c; cursor:pointer; font-family:inherit; font-size:13px; }
.cm-btn-danger:hover { background:rgba(231,76,60,.1); }
.cm-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px; border-bottom:1px solid var(--border); font-weight:700; color:var(--text); font-size:15px; flex-shrink:0; }
.cm-close { background:none; border:none; font-size:20px; color:var(--text-secondary); cursor:pointer; line-height:1; }
.cm-loading { color:var(--text-secondary); font-size:13px; padding:14px 0; }
.cm-sessions-err { color:#e74c3c; font-size:13px; padding:12px 0; }
.cm-sessions-empty { color:var(--text-secondary); font-size:13px; padding:16px 0; text-align:center; }
`);

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default {
  name: 'KBModal',
  props: {
    room: { type: String, default: '' },
    openDocId: { type: String, default: '' }
  },
  setup(props, ctx) {
    const docs = Vue.ref(getDocs());
    const mode = Vue.ref('list');
    const current = Vue.ref(null);
    const rendered = Vue.ref('');
    const loading = Vue.ref(false);
    const err = Vue.ref('');
    const q = Vue.ref('');
    const form = Vue.reactive({ title: '', content: '', tags: '' });

    onChange(() => { docs.value = getDocs(); });

    const filtered = Vue.computed(() => (docs.value || []).filter(d => {
      const kw = q.value.trim();
      if (!kw) return true;
      return (d.title || '').includes(kw) || (d.tags || []).some(tag => tag.includes(kw));
    }));

    function canEdit(d) {
      if (!d) return false;
      const isAdmin = document.cookie.indexOf('admin_logged=1') !== -1;
      return (d.createdBy && d.createdBy === state.username) || isAdmin;
    }

    async function loadList() {
      loading.value = true; err.value = '';
      try { docs.value = (await send('list')).docs || []; }
      catch (e) { err.value = e.message; }
      loading.value = false;
    }

    async function openDoc(id) {
      loading.value = true; err.value = '';
      try {
        const cached = getCached(id);
        current.value = cached || (await send('get', { id })).doc;
        const m = await import('../renderers.js');
        rendered.value = m.markdownToHtml(current.value ? current.value.content : '');
        mode.value = 'view';
      } catch (e) { err.value = e.message; }
      loading.value = false;
    }

    function startNew() {
      form.title = ''; form.content = ''; form.tags = '';
      mode.value = 'new';
    }

    function startEdit() {
      if (!current.value) return;
      form.title = current.value.title || '';
      form.content = current.value.content || '';
      form.tags = (current.value.tags || []).join(', ');
      mode.value = 'edit';
    }

    async function save() {
      err.value = '';
      const title = form.title.trim();
      const content = form.content;
      if (!title || !content.trim()) { err.value = t('标题和内容不能为空'); return; }
      const tags = form.tags.split(/[,，]/).map(s => s.trim()).filter(Boolean).slice(0, 5);
      loading.value = true;
      try {
        if (mode.value === 'new') {
          const d = await send('create', { title, content, tags });
          current.value = { ...(d.doc || {}), content };
        } else {
          await send('update', { id: current.value.id, title, content, tags });
          current.value = { ...current.value, title, content, tags };
        }
        const m = await import('../renderers.js');
        rendered.value = m.markdownToHtml(current.value.content || '');
        mode.value = 'view';
      } catch (e) { err.value = e.message; }
      loading.value = false;
    }

    async function remove() {
      if (!current.value) return;
      if (!confirm(t('删除该文档？此操作不可恢复。'))) return;
      err.value = '';
      loading.value = true;
      try {
        await send('delete', { id: current.value.id });
        current.value = null; rendered.value = ''; mode.value = 'list';
      } catch (e) { err.value = e.message; }
      loading.value = false;
    }

    function toList() { mode.value = 'list'; current.value = null; rendered.value = ''; }

    Vue.onMounted(async () => {
      await loadList();
      if (props.openDocId) await openDoc(props.openDocId);
    });

    return { docs, mode, current, rendered, loading, err, q, form, filtered, canEdit, openDoc, startNew, startEdit, save, remove, toList, fmtTime, t };
  },
  template: `
  <div class="cm-kb">
    <div class="cm-header">
      <span>📚 {{ t('房间知识库') }}<span v-if="room" class="cm-kb-room"> · {{ room }}</span></span>
      <button class="cm-close" @click="$emit('close')" title="关闭">&times;</button>
    </div>
    <div class="cm-kb-body">
      <div v-if="loading" class="cm-loading">{{ t('加载中…') }}</div>
      <div v-else-if="err" class="cm-sessions-err">⚠️ {{ err }}</div>

      <template v-else-if="mode === 'list'">
        <div class="cm-kb-toolbar">
          <input v-model="q" class="cm-kb-search" :placeholder="t('搜索标题/标签…')" />
          <button class="cm-btn-primary" @click="startNew">＋ {{ t('新建文档') }}</button>
        </div>
        <div v-if="filtered.length === 0" class="cm-sessions-empty">{{ t('暂无文档，点击上方新建') }}</div>
        <div v-for="d in filtered" :key="d.id" class="cm-kb-item" @click="openDoc(d.id)">
          <div class="cm-kb-item-title">📄 {{ d.title }}</div>
          <div class="cm-kb-item-meta">
            {{ d.createdBy }} · {{ fmtTime(d.updatedAt || d.createdAt) }}
            <span v-if="d.tags && d.tags.length" class="cm-kb-tags">#{{ d.tags.join(' #') }}</span>
          </div>
        </div>
      </template>

      <template v-else-if="mode === 'view'">
        <div class="cm-kb-viewhead">
          <button class="cm-btn" @click="toList">← {{ t('返回') }}</button>
          <span style="flex:1"></span>
          <button v-if="canEdit(current)" class="cm-btn" @click="startEdit">✏️ {{ t('编辑') }}</button>
          <button v-if="canEdit(current)" class="cm-btn-danger" @click="remove">🗑️ {{ t('删除') }}</button>
        </div>
        <h2 class="cm-kb-doctitle">{{ current && current.title }}</h2>
        <div class="cm-kb-docbody" v-html="rendered"></div>
      </template>

      <template v-else>
        <div class="cm-kb-viewhead">
          <button class="cm-btn" @click="toList">← {{ t('取消') }}</button>
          <span style="flex:1"></span>
          <button class="cm-btn-primary" @click="save" :disabled="loading">💾 {{ t('保存') }}</button>
        </div>
        <input v-model="form.title" class="cm-kb-input" :placeholder="t('标题（≤100字）')" />
        <input v-model="form.tags" class="cm-kb-input" :placeholder="t('标签（逗号分隔，≤5个）')" />
        <textarea v-model="form.content" class="cm-kb-textarea" :placeholder="t('Markdown 正文（标题/表格/列表/代码块均支持）')"></textarea>
      </template>
    </div>
  </div>`
};
