// v1.52 管理后台 Vue3 迁移 - 发送消息（广播到房间 + 房间在线列表快速发送）
import * as Vue from '/static/admin/vendor/vue.js';
import { toast } from '/static/admin/store.js';

export default {
  name: 'SendMessageSection',
  setup() {
    const rooms = Vue.ref({});        // { name: 在线数 }
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    const form = Vue.reactive({ room: '', sender: '', text: '' });
    const sending = Vue.ref(false);
    const lastSent = Vue.ref(null);   // { room, sender, text, ok, at }

    async function load() {
      loading.value = true; err.value = false;
      try {
        const r = await fetch('/api/rooms/list');
        rooms.value = await r.json();
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    const roomList = Vue.computed(() =>
      Object.keys(rooms.value).map(name => ({ name, online: rooms.value[name] || 0 }))
    );

    async function send(room, sender, text) {
      if (!room) { toast('请选择目标房间', 'warn'); return; }
      if (!text) { toast('请输入消息内容', 'warn'); return; }
      sending.value = true;
      try {
        const r = await fetch('/api/admin/send-message/' + encodeURIComponent(room)
          + '?text=' + encodeURIComponent(text) + '&sender=' + encodeURIComponent(sender || '系统公告'));
        const result = await r.text();
        lastSent.value = { room, sender: sender || '系统公告', text, ok: r.ok, at: new Date().toLocaleTimeString() };
        if (r.ok) toast('✓ 已发送到 #' + room);
        else toast('✗ ' + result, 'err');
        return r.ok;
      } catch (e) { toast('发送失败: ' + e.message, 'err'); return false; }
      finally { sending.value = false; }
    }

    async function doSend() {
      const ok = await send(form.room, form.sender.trim(), form.text.trim());
      if (ok) form.text = '';
    }

    const quickTexts = Vue.reactive({});

    async function quickSend(room) {
      const text = (quickTexts[room] || '').trim();
      if (!text) { toast('请输入消息内容', 'warn'); return; }
      const ok = await send(room, '系统通知', text);
      if (ok) quickTexts[room] = '';
    }

    Vue.onMounted(load);
    return { rooms, roomList, loading, err, form, sending, lastSent, quickTexts, doSend, quickSend };
  },
  template: `
  <div class="av-page">
    <h1>📣 发送消息</h1>
    <p class="av-sub">向指定房间广播一条系统消息（或指定发送者名称）</p>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:16px;align-items:start">
      <!-- 主发送表单 -->
      <div class="av-card" style="padding:16px 18px">
        <h3 style="margin:0 0 14px;font-size:15px;display:flex;align-items:center;gap:8px">✍️ 广播消息</h3>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div class="av-toolbar" style="flex-wrap:wrap">
            <select v-model="form.room" class="av-select" style="flex:1;min-width:180px">
              <option value="">选择房间...</option>
              <option v-for="r in roomList" :key="r.name" :value="r.name">#{{ r.name }} ({{ r.online }} 在线)</option>
            </select>
            <input v-model="form.sender" class="av-input" placeholder="发送者（默认 系统公告）" style="width:170px" />
          </div>
          <textarea v-model="form.text" class="av-input" rows="3" placeholder="消息内容..." style="resize:vertical"></textarea>
          <div style="display:flex;align-items:center;gap:10px">
            <button class="av-btn primary" :disabled="sending" @click="doSend">{{ sending ? '发送中...' : '发 送' }}</button>
            <span style="flex:1"></span>
            <span class="mono" style="font-size:12px;color:var(--text-3)">{{ form.text.length }} 字</span>
          </div>
        </div>

        <!-- 发送预览气泡 -->
        <div v-if="lastSent" style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">
          <div style="font-size:12px;color:var(--text-3);margin-bottom:8px;display:flex;gap:10px;align-items:center">
            <span>最近发送</span>
            <span class="mono">#{{ lastSent.room }} · {{ lastSent.at }}</span>
            <span class="av-badge" :style="lastSent.ok
              ? { background:'rgba(74,222,128,.14)', color:'var(--green)' }
              : { background:'rgba(255,107,107,.12)', color:'var(--red)' }">{{ lastSent.ok ? '成功' : '失败' }}</span>
          </div>
          <div style="display:flex;justify-content:flex-end">
            <div style="max-width:82%;background:linear-gradient(135deg,rgba(122,162,255,.2),rgba(34,211,238,.14));border:1px solid rgba(122,162,255,.4);border-radius:14px 14px 4px 14px;padding:9px 14px;font-size:13px;box-shadow:0 4px 16px rgba(122,162,255,.12)">
              <div style="font-size:11px;color:var(--cyan);margin-bottom:2px">{{ lastSent.sender }}</div>
              {{ lastSent.text }}
            </div>
          </div>
        </div>
      </div>

      <!-- 房间在线列表 + 快速发送 -->
      <div class="av-card" style="padding:16px 18px">
        <h3 style="margin:0 0 12px;font-size:15px;display:flex;align-items:center;gap:8px">👥 在线房间快速发送</h3>
        <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
        <div v-else-if="err" class="av-empty">加载失败</div>
        <div v-else-if="roomList.length === 0" class="av-empty">暂无在线房间</div>
        <div v-else style="display:flex;flex-direction:column;gap:8px">
          <div v-for="r in roomList" :key="r.name" class="av-toolbar" style="flex-wrap:nowrap">
            <span class="mono" style="flex-shrink:0;font-weight:600;font-size:13px;color:var(--text)">#{{ r.name }}</span>
            <span class="av-badge" :style="{ background:'rgba(34,211,238,.1)', color:'var(--cyan)' }">{{ r.online }}</span>
            <input v-model="quickTexts[r.name]" class="av-input" placeholder="快速发送..." style="flex:1;min-width:0;font-size:12px;padding:5px 10px"
                   @keydown.enter="quickSend(r.name)" />
            <button class="av-btn sm primary" @click="quickSend(r.name)">发送</button>
          </div>
        </div>
      </div>
    </div>
  </div>`
};
