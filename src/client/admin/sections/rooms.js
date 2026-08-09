// v1.52 管理后台 Vue3 迁移 - 房间列表（含公告/置顶/在线用户/黑名单/文件/消息查看，superOnly）
import * as Vue from '/static/admin/vendor/vue.js';
import { store, toast } from '/static/admin/store.js';

function fmtSize(sz) {
  sz = sz || 0;
  return sz < 1024 ? sz + ' B' : sz < 1024 * 1024 ? (sz / 1024).toFixed(1) + ' KB' : (sz / (1024 * 1024)).toFixed(1) + ' MB';
}
function fmtHM(ts) {
  let d = ts ? new Date(ts) : null;
  if (!d) return '';
  return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}
function fmtDM(ts) {
  let d = ts ? new Date(ts) : null;
  if (!d) return '';
  return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2);
}

export default {
  name: 'RoomsSection',
  setup() {
    const rooms = Vue.ref([]);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    const isSuper = Vue.computed(() => store.level === 'super');

    async function load() {
      loading.value = true; err.value = false;
      try {
        const r = await fetch('/api/rooms/list');
        const data = await r.json();
        rooms.value = Object.entries(data || {}).map(([name, count]) => ({
          name, count, open: false, detail: null, detailLoading: false,
          annInput: '', pinChan: 'general', pinTs: '', msgs: null, msgsLoading: false
        }));
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    async function fetchDetail(room) {
      let [usersRes, blacklistRes, userDetailsRes, filesRes] = await Promise.all([
        fetch('/api/admin/room-users/' + encodeURIComponent(room.name)),
        fetch('/api/admin/blacklist/list/' + encodeURIComponent(room.name)),
        fetch('/api/admin/room-users-detail/' + encodeURIComponent(room.name)),
        fetch('/api/admin/room-files/' + encodeURIComponent(room.name)).catch(() => ({ json: async () => [] }))
      ]);
      const users = await usersRes.json();
      const blacklist = await blacklistRes.json();
      const userDetails = await userDetailsRes.json();
      const files = await filesRes.json();
      let ipMap = {};
      if (Array.isArray(userDetails)) userDetails.forEach(u => { if (u && u.name) ipMap[u.name] = u.ip || ''; });
      room.detail = { users, blacklist, ipMap, files: Array.isArray(files) ? files : [], pinned: [] };
      try {
        const pr = await fetch('/api/admin/pin/get/' + encodeURIComponent(room.name));
        const data = await pr.json();
        let pinned = (data && data.pinned && typeof data.pinned === 'object') ? data.pinned : {};
        room.detail.pinned = Object.entries(pinned).flatMap(([channel, arr]) => (Array.isArray(arr) ? arr : []).map(p => ({ channel, ...p })));
      } catch (e) { room.detail.pinned = []; }
    }

    async function toggleRoom(room) {
      if (room.open) { room.open = false; room.detail = null; room.msgs = null; return; }
      room.open = true; room.detailLoading = true;
      try { await fetchDetail(room); } catch (e) { room.detail = null; toast('房间详情加载失败', 'err'); }
      room.detailLoading = false;
    }

    async function reloadDetail(room) {
      try { await fetchDetail(room); } catch (e) { toast('刷新失败', 'err'); }
    }

    function showUser(u) { store.userModal = u; }

    async function setAnnouncement(room) {
      try {
        const r = await fetch('/api/admin/announcement/' + encodeURIComponent(room.name) + '?text=' + encodeURIComponent((room.annInput || '').trim()));
        toast(await r.text());
        room.annInput = '';
      } catch (e) { toast('设置公告失败', 'err'); }
    }

    async function setPinned(room) {
      const channel = (room.pinChan || 'general').trim() || 'general';
      const ts = (room.pinTs || '').trim();
      if (!ts || !/^\d+$/.test(ts)) { toast('请输入有效消息时间戳（毫秒）', 'warn'); return; }
      try {
        const r = await fetch('/api/admin/pin/set/' + encodeURIComponent(room.name) + '?channel=' + encodeURIComponent(channel) + '&timestamp=' + encodeURIComponent(ts));
        toast(await r.text());
        room.pinTs = '';
        await reloadDetail(room);
      } catch (e) { toast('置顶失败', 'err'); }
    }

    async function clearPinned(room, ch, ts) {
      if (!confirm('确定取消这条置顶吗？')) return;
      try {
        const r = await fetch('/api/admin/pin/clear/' + encodeURIComponent(room.name) + '?channel=' + encodeURIComponent(ch) + '&timestamp=' + encodeURIComponent(ts));
        toast(await r.text());
        await reloadDetail(room);
      } catch (e) { toast('取消置顶失败', 'err'); }
    }

    async function toggleMessages(room) {
      if (room.msgs) { room.msgs = null; return; }
      room.msgsLoading = true;
      try {
        const r = await fetch('/api/admin/room-messages/' + encodeURIComponent(room.name) + '?limit=30');
        const msgs = await r.json();
        room.msgs = Array.isArray(msgs) ? msgs : [];
      } catch (e) { room.msgs = []; }
      room.msgsLoading = false;
    }

    async function kickUser(room, user) {
      if (!confirm('确定踢出 ' + user + ' 吗？')) return;
      try {
        const r = await fetch('/api/admin/kick-user/' + encodeURIComponent(room.name) + '?name=' + encodeURIComponent(user));
        toast(await r.text());
        await reloadDetail(room);
      } catch (e) { toast('操作失败', 'err'); }
    }

    async function addBlacklist(room, user) {
      try {
        const r = await fetch('/api/admin/blacklist/add/' + encodeURIComponent(room.name) + '?name=' + encodeURIComponent(user));
        toast(await r.text());
        await reloadDetail(room);
      } catch (e) { toast('操作失败', 'err'); }
    }
    async function removeBlacklist(room, user) {
      try {
        const r = await fetch('/api/admin/blacklist/remove/' + encodeURIComponent(room.name) + '?name=' + encodeURIComponent(user));
        toast(await r.text());
        await reloadDetail(room);
      } catch (e) { toast('操作失败', 'err'); }
    }

    async function clearRoom(room) {
      if (!confirm('确定清空 ' + room.name + ' 的聊天记录吗？此操作不可撤销！')) return;
      try {
        const r = await fetch('/api/admin/clear-room/' + encodeURIComponent(room.name));
        toast(await r.text());
      } catch (e) { toast('操作失败', 'err'); }
    }

    async function destroyRoom(room) {
      if (!confirm('⚠️ 确定要销毁房间 ' + room.name + ' 吗？\n\n此操作将：\n- 清空所有聊天记录\n- 断开所有用户连接\n- 从房间列表中移除\n\n此操作不可撤销！')) return;
      if (!confirm('再次确认：真的要销毁 ' + room.name + ' 吗？')) return;
      try {
        const r = await fetch('/api/admin/destroy-room/' + encodeURIComponent(room.name));
        toast(await r.text());
        await load();
      } catch (e) { toast('操作失败: ' + e.message, 'err'); }
    }

    Vue.onMounted(load);
    return { rooms, loading, err, isSuper, toggleRoom, reloadDetail, showUser, setAnnouncement, setPinned, clearPinned, toggleMessages, kickUser, addBlacklist, removeBlacklist, clearRoom, destroyRoom, fmtSize, fmtHM, fmtDM };
  },
  template: `
  <div class="av-page">
    <h1>🏠 房间列表</h1>
    <p class="av-sub">所有房间及其在线用户、公告、置顶、文件管理</p>
    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="rooms.length === 0" class="av-empty">暂无房间</div>
    <div v-else class="av-card" style="padding:8px 0">
      <div v-for="room in rooms" :key="room.name" class="room-card" style="border-bottom:1px solid rgba(255,255,255,.06)">
        <div class="room-header" style="display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer" @click="toggleRoom(room)">
          <span class="mono" style="color:var(--accent);font-weight:600">#{{ room.name }}</span>
          <span style="flex:1"></span>
          <span class="mono" style="color:var(--text-2);font-size:13px">👥 {{ room.count }} 在线</span>
          <span class="mono" style="color:var(--text-3)">{{ room.open ? '▼' : '▶' }}</span>
        </div>
        <div v-if="room.open && room.detailLoading" class="av-loading" style="padding:12px"><span class="spinner"></span>加载中...</div>
        <div v-if="room.open && room.detail" style="padding:0 16px 16px">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
            <button class="av-btn danger sm" @click="clearRoom(room)">清空聊天记录</button>
            <button class="av-btn sm" @click="toggleMessages(room)">{{ room.msgs ? '收起消息' : '查看消息' }}</button>
            <button v-if="isSuper" class="av-btn danger sm" style="background:rgba(192,57,43,.15);border-color:rgba(192,57,43,.45);color:#ff9c8a" @click="destroyRoom(room)">💥 销毁房间</button>
          </div>

          <div class="av-card" style="padding:10px 12px;margin-bottom:12px">
            <div style="font-size:13px;font-weight:600;margin-bottom:6px">📢 房间公告</div>
            <div style="display:flex;gap:6px">
              <input v-model="room.annInput" class="av-input" placeholder="输入公告内容（留空清除）" style="flex:1">
              <button class="av-btn sm" @click="setAnnouncement(room)">设置</button>
            </div>
          </div>

          <div class="av-card" style="padding:10px 12px;margin-bottom:12px">
            <div style="font-size:13px;font-weight:600;margin-bottom:6px">📌 置顶消息</div>
            <div v-if="room.detail.pinned.length === 0" class="av-empty" style="padding:4px 0">暂无置顶消息</div>
            <div v-for="p in room.detail.pinned" :key="p.channel + p.timestamp" style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;border-bottom:1px dashed rgba(255,255,255,.07)">
              <span style="color:#f59e0b;flex-shrink:0">#{{ p.channel }}</span>
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" :title="p.text || ''">📌 {{ (p.name || '?') + ': ' + (p.text || '') }}</span>
              <span class="mono" style="color:var(--text-3);flex-shrink:0">{{ fmtHM(p.timestamp) }} {{ fmtDM(p.timestamp) }}</span>
              <button class="av-btn danger sm" style="padding:1px 8px;font-size:11px" @click="clearPinned(room, p.channel, parseInt(p.timestamp))">清除</button>
            </div>
            <div style="display:flex;gap:6px;margin-top:6px">
              <input v-model="room.pinChan" class="av-input" placeholder="频道(general)" style="width:120px">
              <input v-model="room.pinTs" class="av-input" placeholder="消息时间戳(毫秒)" style="flex:1">
              <button class="av-btn sm" style="background:rgba(245,158,11,.15);border-color:rgba(245,158,11,.45);color:#fbbf24" @click="setPinned(room)">置顶</button>
            </div>
          </div>

          <div v-if="room.msgs" class="av-card" style="padding:10px 12px;margin-bottom:12px">
            <div style="font-size:13px;font-weight:600;margin-bottom:6px">📝 最近消息（{{ room.msgs.length }} 条）</div>
            <div v-if="room.msgs.length === 0" class="av-empty">暂无消息记录</div>
            <div v-for="(m, i) in room.msgs" :key="i" style="display:flex;gap:8px;padding:3px 0;font-size:12px;border-bottom:1px dashed rgba(255,255,255,.06)">
              <span class="mono" style="color:var(--text-3);flex-shrink:0">{{ fmtHM(m.timestamp) }}</span>
              <span style="color:var(--cyan);flex-shrink:0">{{ m.name || '?' }}</span>
              <span style="color:var(--text-2)">{{ m.type === 'image' ? '📷 [图片]' : m.type === 'file' ? ('📎 ' + (m.fileName || '[文件]')) : m.message }}</span>
            </div>
          </div>

          <div class="user-list" style="margin-bottom:12px">
            <div style="font-size:13px;font-weight:600;margin-bottom:6px">👥 在线用户</div>
            <div v-if="room.detail.users.length === 0" class="av-empty">暂无在线用户</div>
            <div v-for="u in room.detail.users" :key="u" style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;flex-wrap:wrap">
              <span style="cursor:pointer;color:var(--accent)" @click="showUser(u)">{{ u }}</span>
              <span v-if="isSuper && room.detail.ipMap[u]" class="mono" style="color:var(--text-3);font-size:11px">({{ room.detail.ipMap[u] }})</span>
              <span style="flex:1"></span>
              <button class="av-btn danger sm" @click="kickUser(room, u)">踢出</button>
              <button class="av-btn danger sm" @click="addBlacklist(room, u)">拉黑</button>
              <template v-if="isSuper">
                <button v-if="room.detail.blacklist.includes(u)" class="av-btn sm" @click="removeBlacklist(room, u)">移出黑名单</button>
                <button v-else class="av-btn sm" @click="addBlacklist(room, u)">禁止踢人</button>
              </template>
            </div>
          </div>

          <div v-if="room.detail.blacklist.length > 0" style="margin-bottom:12px">
            <div style="font-size:13px;font-weight:600;margin-bottom:6px">🚫 黑名单</div>
            <span v-for="b in room.detail.blacklist" :key="b" style="margin:2px 4px 2px 0;display:inline-flex;gap:4px;align-items:center">
              <button class="av-btn danger sm" @click="removeBlacklist(room, b)">{{ b }} ✕</button>
            </span>
          </div>

          <div>
            <div style="font-size:13px;font-weight:600;margin-bottom:6px">📎 文件（{{ room.detail.files.length }}）</div>
            <div v-if="room.detail.files.length === 0" class="av-empty">暂无文件</div>
            <div v-for="f in room.detail.files" :key="f.timestamp" style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px">
              <span style="color:var(--text-2)">📄 <b>{{ f.fileName || 'unknown' }}</b> <span class="mono" style="color:var(--text-3)">({{ f.name || 'unknown' }})</span></span>
              <span style="flex:1"></span>
              <span class="mono" style="color:var(--text-3)">{{ fmtSize(f.fileSize) }}</span>
              <a class="av-btn sm" style="text-decoration:none" :href="'/api/admin/room-file-data/' + encodeURIComponent(room.name) + '?timestamp=' + f.timestamp" target="_blank" rel="noopener noreferrer">下载</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`
};
