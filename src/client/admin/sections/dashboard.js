// v1.52 管理后台 Vue3 迁移 - 仪表盘（概览）
import * as Vue from '/static/admin/vendor/vue.js';
import { store } from '/static/admin/store.js';

export default {
  name: 'DashboardSection',
  setup() {
    const stats = Vue.reactive({ rooms: 0, online: 0, users: 0, banned: '0', ipbanned: 0, points: '0', ipgroups: 0 });
    const top10 = Vue.ref([]);
    const err = Vue.ref(false);

    async function load() {
      err.value = false;
      try {
        let [roomsRes, onlineRes, pointsRes, bannedRes, historyRes, ipBannedRes, ipsRes] = await Promise.all([
          fetch("/api/rooms/list"),
          fetch("/api/admin/all-users"),
          fetch("/api/admin/points/all"),
          fetch("/api/admin/ban/list"),
          fetch("/api/admin/users/history"),
          fetch("/api/admin/ip-ban/list"),
          fetch("/api/admin/user-ips")
        ]);
        let rooms = await roomsRes.json();
        let onlineData = await onlineRes.json();
        let pointsData = await pointsRes.json();
        let bannedList = await bannedRes.json();
        let historyList = await historyRes.json();
        let ipBannedList = await ipBannedRes.json();
        let ipsData = await ipsRes.json();

        let onlineSet = new Set();
        for (let users of Object.values(onlineData)) {
          users.forEach(u => onlineSet.add(u));
        }
        stats.rooms = Object.keys(rooms).length;
        stats.online = onlineSet.size;
        stats.users = Array.isArray(historyList) ? historyList.length : 0;
        stats.banned = (Array.isArray(bannedList) ? bannedList.length : 0) + (ipBannedList.length > 0 ? " (+" + ipBannedList.length + " IP)" : "");
        stats.ipbanned = ipBannedList.length;

        let totalPoints = 0n;
        let pointsEntries = Object.entries(pointsData);
        pointsEntries.forEach(([, p]) => { try { totalPoints += BigInt(String(p)); } catch {} });
        stats.points = String(totalPoints);

        let ipToUsers = {};
        for (let [user, ip] of Object.entries(ipsData)) {
          if (!ip) continue;
          if (!ipToUsers[ip]) ipToUsers[ip] = [];
          ipToUsers[ip].push(user);
        }
        stats.ipgroups = Object.values(ipToUsers).filter(u => u.length > 1).length;

        pointsEntries.sort((a, b) => { try { return BigInt(String(b[1])) < BigInt(String(a[1])) ? -1 : 1; } catch { return 0; } });
        top10.value = pointsEntries.slice(0, 10).map(([user, pts], i) => ({ user, pts: String(pts), rank: i + 1 }));
      } catch (e) {
        err.value = true;
      }
    }

    Vue.onMounted(load);
    const showUser = (u) => { store.userModal = u; };

    return { stats, top10, err, showUser };
  },
  template: `
  <div class="av-page">
    <h1>📊 系统概览</h1>
    <p class="av-sub">全局实时数据一览</p>
    <div v-if="err" class="av-empty">加载失败</div>
    <div class="av-stats">
      <div class="av-card av-stat"><div class="num">{{ stats.rooms }}</div><div class="lbl">房间数</div></div>
      <div class="av-card av-stat"><div class="num green">{{ stats.online }}</div><div class="lbl">在线用户</div></div>
      <div class="av-card av-stat"><div class="num">{{ stats.users }}</div><div class="lbl">注册用户</div></div>
      <div class="av-card av-stat"><div class="num red">{{ stats.banned }}</div><div class="lbl">封禁用户</div></div>
      <div class="av-card av-stat"><div class="num red">{{ stats.ipbanned }}</div><div class="lbl">封禁 IP</div></div>
      <div class="av-card av-stat"><div class="num">{{ stats.points }}</div><div class="lbl">总积分</div></div>
      <div class="av-card av-stat"><div class="num">{{ stats.ipgroups }}</div><div class="lbl">同IP分组</div></div>
    </div>
    <div class="av-card" style="padding:16px">
      <h3 style="margin:0 0 12px;font-size:15px">🏆 积分排行榜 Top 10</h3>
      <div v-if="!top10.length" class="av-empty">暂无积分数据</div>
      <div v-else class="av-table-wrap">
        <table class="av-table">
          <thead><tr><th style="width:50px"></th><th>用户名</th><th>积分</th></tr></thead>
          <tbody>
            <tr v-for="t in top10" :key="t.user">
              <td><span class="rank-badge" :class="'r' + t.rank">{{ t.rank }}</span></td>
              <td><span class="mono" style="cursor:pointer;color:var(--accent)" @click="showUser(t.user)">{{ t.user }}</span></td>
              <td class="mono" style="color:var(--orange);font-weight:600">{{ t.pts }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>`
};
