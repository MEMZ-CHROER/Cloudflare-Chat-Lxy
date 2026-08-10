// v1.54 运营数据看板 - 在线峰值 / 消息趋势 / 积分吞吐 / 房间活跃度
// 数据源：/api/admin/ops-stats（registry /ops/stats 聚合 + 遍历房间聚合每日消息量）
import * as Vue from '/static/admin/vendor/vue.js';

const TYPE_LABELS = { checkin: '签到', task: '任务', game: '游戏', lottery: '抽奖', redpacket: '红包', transfer: '转账', reward: '奖励', admin: '管理员', shop: '商店', other: '其他' };

function last7Days() {
  let out = [];
  let today = new Date();
  for (let i = 6; i >= 0; i--) {
    let d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    let date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    let label = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    out.push({ date, label });
  }
  return out;
}
function timeFmt(ts) {
  if (!ts) return '--';
  let d = new Date(ts);
  let pad = (n) => String(n).padStart(2, '0');
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

export default {
  name: 'StatsSection',
  setup() {
    const stats = Vue.reactive({ online: 0, todayPeak: 0, todayPeakDate: null, globalPeak: 0, globalPeakTs: 0, registeredUsers: 0, totalPoints: '0' });
    const rooms = Vue.ref([]);
    const msgTrend = Vue.ref([]);
    const ledgerTrend = Vue.ref([]);
    const err = Vue.ref(false);

    async function load() {
      err.value = false;
      try {
        let r = await fetch('/api/admin/ops-stats');
        if (!r.ok) throw new Error();
        let d = await r.json();
        stats.online = d.online || 0;
        stats.todayPeak = d.todayPeak || 0;
        stats.todayPeakDate = d.todayPeakDate || null;
        stats.globalPeak = d.globalPeak || 0;
        stats.globalPeakTs = d.globalPeakTs || 0;
        stats.registeredUsers = d.registeredUsers || 0;
        stats.totalPoints = d.totalPoints || '0';
        rooms.value = (Array.isArray(d.rooms) ? d.rooms : []).filter(x => x && x.name).sort((a, b) => b.count - a.count);

        // 消息趋势：近 7 日（缺日补 0）
        let days = last7Days();
        let daySet = new Set(days.map(x => x.date));
        msgTrend.value = days.map(x => ({ ...x, count: (d.msgByDay || {})[x.date] || 0 }));

        // 积分吞吐：近 7 日按 type 汇总（count 笔数 + total 净变动）
        let agg = {};
        for (let [day, types] of Object.entries(d.ledgerByDay || {})) {
          if (!daySet.has(day)) continue;
          for (let [t, v] of Object.entries(types || {})) {
            if (!agg[t]) agg[t] = { count: 0, total: 0 };
            agg[t].count += (v.count || 0);
            agg[t].total += (Number(v.total) || 0);
          }
        }
        ledgerTrend.value = Object.entries(agg).map(([type, v]) => ({ type, ...v })).sort((a, b) => b.total - a.total);
      } catch (e) {
        err.value = true;
      }
    }

    const maxMsg = Vue.computed(() => { let m = 0; for (let x of msgTrend.value) if (x.count > m) m = x.count; return m || 1; });
    const barH = (c) => (c > 0 ? Math.max(5, Math.round(c / maxMsg.value * 120)) : 3);

    Vue.onMounted(load);

    return { stats, rooms, msgTrend, ledgerTrend, err, barH, timeFmt, TYPE_LABELS };
  },
  template: `
  <div class="av-page">
    <h1>📈 运营数据</h1>
    <p class="av-sub">在线峰值 · 消息趋势 · 积分吞吐 · 房间活跃度</p>
    <div v-if="err" class="av-empty">加载失败，请确认已登录管理后台</div>
    <div class="av-stats">
      <div class="av-card av-stat"><div class="num green">{{ stats.online }}</div><div class="lbl">当前在线</div></div>
      <div class="av-card av-stat"><div class="num">{{ stats.todayPeak }}</div><div class="lbl">今日峰值 · {{ stats.todayPeakDate || '--' }}</div></div>
      <div class="av-card av-stat"><div class="num">{{ stats.globalPeak }}</div><div class="lbl">历史峰值 · {{ timeFmt(stats.globalPeakTs) }}</div></div>
      <div class="av-card av-stat"><div class="num">{{ stats.registeredUsers }}</div><div class="lbl">注册用户</div></div>
      <div class="av-card av-stat"><div class="num" style="background:none;color:var(--orange)">{{ stats.totalPoints }}</div><div class="lbl">总积分</div></div>
    </div>

    <div class="av-card" style="padding:16px;margin-bottom:14px">
      <h3 style="margin:0 0 12px;font-size:15px">📈 每日消息量（近 7 日）</h3>
      <div v-if="!msgTrend.length" class="av-empty">暂无消息数据</div>
      <div v-else style="display:flex;align-items:flex-end;gap:12px;height:150px;padding:6px 2px 0">
        <div v-for="b in msgTrend" :key="b.date" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
          <div class="mono" style="font-size:11px;color:var(--text-2);margin-bottom:4px">{{ b.count }}</div>
          <div :title="b.date + ' 消息数 ' + b.count" style="width:100%;max-width:46px;border-radius:6px 6px 0 0;background:linear-gradient(180deg,var(--accent),var(--cyan));opacity:.9"
               :style="{ height: barH(b.count) + 'px' }"></div>
          <div style="font-size:11px;color:var(--text-3);margin-top:6px">{{ b.label }}</div>
        </div>
      </div>
    </div>

    <div class="av-card" style="padding:16px;margin-bottom:14px">
      <h3 style="margin:0 0 12px;font-size:15px">💰 积分吞吐（近 7 日）</h3>
      <div v-if="!ledgerTrend.length" class="av-empty">近 7 日暂无积分流水</div>
      <div v-else class="av-table-wrap">
        <table class="av-table">
          <thead><tr><th>类型</th><th>笔数</th><th>净变动</th></tr></thead>
          <tbody>
            <tr v-for="l in ledgerTrend" :key="l.type">
              <td>{{ TYPE_LABELS[l.type] || l.type }}</td>
              <td class="mono">{{ l.count }}</td>
              <td class="mono" :style="{ color: l.total >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }">{{ l.total >= 0 ? '+' : '' }}{{ l.total }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="av-card" style="padding:16px">
      <h3 style="margin:0 0 12px;font-size:15px">🏠 房间活跃度</h3>
      <div v-if="!rooms.length" class="av-empty">暂无在线房间</div>
      <div v-else class="av-table-wrap">
        <table class="av-table">
          <thead><tr><th>房间</th><th>当前在线</th><th>峰值</th><th>峰值时间</th></tr></thead>
          <tbody>
            <tr v-for="rm in rooms" :key="rm.name">
              <td class="mono">{{ rm.name }}</td>
              <td><span class="av-badge" style="color:var(--green);border:1px solid rgba(74,222,128,.4)">{{ rm.count }}</span></td>
              <td class="mono">{{ rm.peak || 0 }}</td>
              <td class="mono" style="color:var(--text-2)">{{ timeFmt(rm.peakTs) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>`
};
