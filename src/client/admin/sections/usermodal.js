// v1.52 管理后台 Vue3 迁移 - 用户详情弹窗（全局组件，store.userModal 控制开关）
import * as Vue from '/static/admin/vendor/vue.js';
import { store, toast, TAG_COLORS, navigate } from '/static/admin/store.js';

export default {
  name: 'UserModal',
  setup() {
    const username = Vue.ref('');
    const detail = Vue.reactive({ pts: 0, tag: null, tagColor: null, ip: '未知', banned: false, online: false, rooms: [] });
    const loading = Vue.ref(false);
    const err = Vue.ref(false);

    async function load() {
      if (!store.userModal) return;
      username.value = store.userModal;
      loading.value = true; err.value = false;
      try {
        let [pointsRes, tagsRes, ipsRes, onlineRes, bannedRes] = await Promise.all([
          fetch("/api/admin/points/get?name=" + encodeURIComponent(username.value)),
          fetch("/api/admin/tag/list"),
          fetch("/api/admin/user-ips"),
          fetch("/api/admin/all-users"),
          fetch("/api/admin/ban/list")
        ]);
        let pointsData = await pointsRes.json();
        let tagsData = await tagsRes.json();
        let ipsData = await ipsRes.json();
        let onlineData = await onlineRes.json();
        let bannedList = await bannedRes.json();

        detail.pts = pointsData.points !== undefined ? pointsData.points : 0;
        let tagInfo = tagsData[username.value] || null;
        detail.tag = tagInfo ? (tagInfo.tag || '') : null;
        detail.tagColor = tagInfo ? (tagInfo.color || '') : null;
        detail.ip = ipsData[username.value] || '未知';
        detail.banned = Array.isArray(bannedList) && bannedList.includes(username.value);
        let userRooms = [];
        for (let [room, users] of Object.entries(onlineData)) {
          if (users.includes(username.value)) userRooms.push(room);
        }
        detail.online = userRooms.length > 0;
        detail.rooms = userRooms;
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    Vue.onMounted(load);
    // 弹窗复用单实例：store.userModal 置值时触发加载（onMounted 只在首次挂载跑一次）
    Vue.watch(() => store.userModal, (v) => { if (v) load(); });

    function close() { store.userModal = null; }

    function managePoints() {
      store.ptsFocus = username.value;
      close();
      navigate('points');
    }

    async function globalKick() {
      if (!confirm(`确定将 ${username.value} 从所有房间踢出吗？`)) return;
      try {
        let r = await fetch("/api/admin/global-kick?name=" + encodeURIComponent(username.value));
        let data = await r.json();
        toast(`已从 ${data.kickedFrom.length} 个房间踢出 ${username.value}`);
        close();
      } catch (e) { toast('操作失败', 'err'); }
    }

    function mute() {
      let choice = prompt("选择禁言时长：\n1 - 1分钟\n2 - 10分钟\n3 - 1小时\n4 - 永久\n\n输入数字");
      if (!choice) return;
      let duration;
      if (choice === "1") duration = "1m";
      else if (choice === "2") duration = "10m";
      else if (choice === "3") duration = "1h";
      else if (choice === "4") duration = "permanent";
      else { toast('无效时长', 'warn'); return; }
      let reason = prompt("禁言原因（可选，留空跳过）", "");
      fetch("/api/admin/mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: username.value, duration, reason: reason || "" })
      })
        .then(r => r.json())
        .then(res => {
          if (res.ok) { toast(`已禁言 ${username.value}${duration === 'permanent' ? '（永久）' : ''}`); close(); }
          else toast('禁言失败: ' + (res.error || ''), 'err');
        })
        .catch(() => toast('禁言失败: 网络错误', 'err'));
    }

    async function ban() {
      if (!confirm(`确定封禁 ${username.value} 吗？`)) return;
      try {
        await fetch("/api/admin/global-kick?name=" + encodeURIComponent(username.value));
        let r = await fetch("/api/admin/ban/add?name=" + encodeURIComponent(username.value));
        toast(await r.text());
        close();
      } catch (e) { toast('操作失败', 'err'); }
    }

    async function unban() {
      if (!confirm(`确定解封 ${username.value} 吗？`)) return;
      try {
        let r = await fetch("/api/admin/ban/remove?name=" + encodeURIComponent(username.value));
        toast(await r.text());
        close();
      } catch (e) { toast('操作失败', 'err'); }
    }

    async function banIp() {
      let ip = detail.ip;
      if (!ip || ip === '未知') { toast('该用户无 IP 信息', 'warn'); return; }
      if (!confirm(`确定封禁IP ${ip} 吗？`)) return;
      try {
        let r = await fetch("/api/admin/ip-ban/add?ip=" + encodeURIComponent(ip));
        toast(await r.text());
        close();
      } catch (e) { toast('操作失败', 'err'); }
    }

    async function del() {
      if (!confirm(`⚠️ 确定要永久删除用户 ${username.value} 吗？\n\n此操作将清除：\n- 注册信息\n- 标签\n- 积分\n- 背包物品\n- 历史记录\n- 黑名单/封禁\n\n此操作不可撤销！`)) return;
      if (!confirm(`再次确认：真的要删除用户 ${username.value} 吗？`)) return;
      try {
        let r = await fetch("/api/admin/delete-user?name=" + encodeURIComponent(username.value));
        toast(await r.text());
        close();
      } catch (e) { toast('操作失败: ' + e.message, 'err'); }
    }

    return { store, TAG_COLORS, username, detail, loading, err, close, managePoints, globalKick, mute, ban, unban, banIp, del };
  },
  template: `
  <div v-if="store.userModal" class="av-modal-mask" @click.self="close">
    <div class="av-modal">
      <h3>👤 {{ username }}<button class="av-modal-close" @click="close">✕</button></h3>
      <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
      <div v-else-if="err" class="av-empty">加载失败</div>
      <template v-else>
        <div class="av-field"><span class="lbl">用户名</span><span class="val">{{ username }}</span></div>
        <div class="av-field"><span class="lbl">状态</span><span class="val" :style="{ color: detail.online ? 'var(--green)' : 'var(--text-3)' }">{{ detail.online ? '● 在线' : '○ 离线' }}</span></div>
        <div class="av-field"><span class="lbl">积分</span><span class="val" style="color:var(--orange);font-weight:700">{{ detail.pts }}</span></div>
        <div class="av-field"><span class="lbl">标签</span>
          <span class="val"><span v-if="detail.tag" class="av-badge" :style="{ background: (TAG_COLORS[detail.tagColor] || '#888') }">{{ detail.tag }}</span><span v-else style="color:var(--text-3)">无</span></span>
        </div>
        <div class="av-field"><span class="lbl">IP地址</span><span class="val" style="font-size:12px">{{ detail.ip }}</span></div>
        <div class="av-field"><span class="lbl">所在房间</span><span class="val" style="color:var(--cyan)">{{ detail.rooms.length ? detail.rooms.map(r => '#' + r).join(' ') : '无' }}</span></div>
        <div class="av-field"><span class="lbl">封禁状态</span><span class="val" :style="{ color: detail.banned ? 'var(--red)' : 'var(--green)' }">{{ detail.banned ? '已封禁' : '正常' }}</span></div>
        <div class="av-modal-actions">
          <button class="av-btn primary sm" @click="managePoints">管理积分</button>
          <button v-if="detail.online" class="av-btn danger sm" @click="globalKick">全局踢出</button>
          <button class="av-btn sm" @click="mute">禁言</button>
          <button v-if="!detail.banned" class="av-btn danger sm" @click="ban">封禁</button>
          <button v-else class="av-btn success sm" @click="unban">解封</button>
          <button class="av-btn danger sm" @click="banIp">封禁IP</button>
          <button class="av-btn sm" style="background:rgba(155,89,182,.15);border-color:rgba(155,89,182,.45);color:#e6ccff" @click="del">🗑 删除用户</button>
        </div>
      </template>
    </div>
  </div>`
};
