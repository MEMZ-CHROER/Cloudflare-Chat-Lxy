// v1.52 管理后台 Vue3 迁移 - 房间 Webhook 管理（list/gen/del）
// 全部 fetch 走 httpOnly Cookie 鉴权，不带 ?key=。
import * as Vue from '/static/admin/vendor/vue.js';
import { toast } from '/static/admin/store.js';

export default {
  name: 'WebhooksSection',
  setup() {
    const rooms = Vue.ref([]);        // [{ name, hasWebhook }]
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    // 生成结果弹窗
    const modal = Vue.reactive({ show: false, room: '', url: '', secret: '', curl: '' });
    const copied = Vue.ref('');

    async function load() {
      loading.value = true; err.value = false;
      try {
        const r = await fetch('/api/admin/webhook/list');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        rooms.value = Object.keys(data || {}).map(name => ({ name, hasWebhook: !!(data[name] && data[name].hasWebhook) }));
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    const stats = Vue.computed(() => {
      const on = rooms.value.filter(r => r.hasWebhook).length;
      return { on, total: rooms.value.length };
    });

    async function gen(room) {
      if (!confirm('为 #' + room + ' 生成 Webhook？生成后外部系统即可向该房间推送消息。')) return;
      try {
        const r = await fetch('/api/admin/webhook/gen/' + encodeURIComponent(room));
        const d = await r.json();
        if (!r.ok) { toast(d.error || '生成失败', 'err'); return; }
        const baseUrl = location.origin + '/api/webhook/' + encodeURIComponent(room);
        modal.room = room;
        modal.url = baseUrl;
        modal.secret = d.secret || '';
        modal.curl = 'curl -X POST "' + baseUrl + '" -H "X-Webhook-Secret: ' + modal.secret + '" -H \'Content-Type: application/json\' -d \'{"content":"你好"}\'';
        modal.show = true;
        copied.value = '';
        await load();
      } catch (e) { toast('生成失败: ' + e.message, 'err'); }
    }

    async function del(room) {
      if (!confirm('删除 #' + room + ' 的 Webhook？外部系统将无法再推送。')) return;
      try {
        const r = await fetch('/api/admin/webhook/del/' + encodeURIComponent(room));
        const d = await r.json();
        if (!r.ok) { toast(d.error || '删除失败', 'err'); return; }
        toast('已删除 #' + room + ' 的 Webhook');
        await load();
      } catch (e) { toast('删除失败: ' + e.message, 'err'); }
    }

    async function copy(txt, key) {
      try {
        await navigator.clipboard.writeText(txt);
        copied.value = key;
        toast('已复制');
        setTimeout(() => { if (copied.value === key) copied.value = ''; }, 1600);
      } catch (e) { toast('复制失败，请手动选择', 'warn'); }
    }

    Vue.onMounted(load);
    return { rooms, loading, err, stats, modal, copied, gen, del, copy, close: () => { modal.show = false; } };
  },
  template: `
  <div class="av-page">
    <h1>🔗 房间 Webhook</h1>
    <p class="av-sub">为房间生成 Webhook，外部系统即可通过 API 向房间推送消息</p>

    <div class="av-stats">
      <div class="av-card av-stat"><div class="num">{{ stats.on }}</div><div class="lbl">已开启</div></div>
      <div class="av-card av-stat"><div class="num">{{ stats.total }}</div><div class="lbl">房间总数</div></div>
    </div>

    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="rooms.length === 0" class="av-empty">暂无房间</div>
    <div v-else style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
      <div v-for="r in rooms" :key="r.name" class="av-card" style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="mono" style="flex:1;font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">#{{ r.name }}</span>
          <span class="av-badge" :style="r.hasWebhook
            ? { background:'rgba(74,222,128,.14)', color:'var(--green)', border:'1px solid rgba(74,222,128,.35)' }
            : { background:'rgba(255,255,255,.06)', color:'var(--text-3)', border:'1px solid var(--border)' }">
            {{ r.hasWebhook ? '● 已开启' : '○ 未开启' }}
          </span>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button v-if="r.hasWebhook" class="av-btn danger sm" @click="del(r.name)">删除</button>
          <button v-else class="av-btn primary sm" @click="gen(r.name)">生成</button>
        </div>
      </div>
    </div>

    <!-- 生成结果弹窗 -->
    <div v-if="modal.show" class="av-modal-mask" @click.self="modal.show = false">
      <div class="av-modal">
        <h3>🔗 Webhook 已生成 <button class="av-modal-close" @click="modal.show = false">✕</button></h3>
        <p style="font-size:12px;color:var(--text-3);margin:-4px 0 12px">Secret 仅显示一次，请妥善保存</p>
        <div class="av-field"><span class="lbl">Webhook 地址</span><span class="val">{{ modal.url }}</span></div>
        <div style="margin:8px 0 2px;display:flex;justify-content:flex-end">
          <button class="av-btn ghost sm" @click="copy(modal.url,'url')">{{ copied==='url' ? '✓ 已复制' : '复制' }}</button>
        </div>
        <div class="av-field"><span class="lbl">Secret（保密）</span><span class="val" style="color:var(--orange)">{{ modal.secret }}</span></div>
        <div style="margin:8px 0 2px;display:flex;justify-content:flex-end">
          <button class="av-btn ghost sm" @click="copy(modal.secret,'secret')">{{ copied==='secret' ? '✓ 已复制' : '复制' }}</button>
        </div>
        <p style="margin:12px 0 4px;font-size:12px;color:var(--text-2)">调用示例</p>
        <pre class="mono" style="background:rgba(0,0,0,.45);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:11px;overflow-x:auto;white-space:pre-wrap;margin:0;color:#c9d6f5">{{ modal.curl }}</pre>
        <div style="margin-top:8px;display:flex;justify-content:flex-end">
          <button class="av-btn ghost sm" @click="copy(modal.curl,'curl')">{{ copied==='curl' ? '✓ 已复制' : '复制' }}</button>
        </div>
        <p style="font-size:11px;color:var(--text-3);margin:10px 0 0">可选字段：sender（发送者名，默认 Webhook）、channel（目标频道，默认 general）；secret 请通过 X-Webhook-Secret 请求头发送，勿放进 URL</p>
      </div>
    </div>
  </div>`
};
