// v1.53 房间信息弹窗 — Vue3 重写（批2 工具域）
// 完全复刻旧 roominfo.js toggleRoomInfo() 的信息面板：房间名/在线用户/用户名/WebSocket/消息时间戳。
// 数据源与旧实现一致（全部读共享 state，无网络请求）。弹窗壳由 modal-manager 提供，本文件只注入自身布局样式。
// 在线用户数每 2s 重扫一次 roster，弹窗打开期间保持响应式。
import * as Vue from '/static/chat/vendor/vue.js';
import { state, t } from '../state.js';
import { injectCss } from '../modal-manager.js';

injectCss('cm-style-roominfo', `
.cm-roominfo { display: flex; flex-direction: column; min-width: min(340px, 88vw); }
.cm-roominfo-content { padding: 20px; }
.cm-roominfo-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 14px; }
.cm-roominfo-label { color: var(--text-secondary); }
.cm-roominfo-value { font-weight: 700; }
.cm-roominfo-ok { color: #2ecc71; }
.cm-roominfo-bad { color: #e74c3c; }
`);

export default {
  name: 'RoomInfoModal',
  setup() {
    const roomname = Vue.ref(state.roomname || '');
    const username = Vue.ref(state.username || '');
    const onlineCount = Vue.ref(0);
    const wsConnected = Vue.ref(false);
    const lastSeen = Vue.ref('-');

    function refresh() {
      onlineCount.value = state.roster ? state.roster.querySelectorAll('[data-name]').length : 0;
      wsConnected.value = !!state.currentWebSocket;
      lastSeen.value = state.lastSeenTimestamp ? new Date(state.lastSeenTimestamp).toLocaleTimeString() : '-';
    }

    refresh();
    const timer = setInterval(refresh, 2000);
    Vue.onUnmounted(() => clearInterval(timer));

    return { roomname, username, onlineCount, wsConnected, lastSeen, t };
  },
  template: `
  <div class="cm-roominfo">
    <div class="cm-header">
      <span>📋 房间信息</span>
      <button class="cm-close" @click="$emit('close')" title="关闭">&times;</button>
    </div>
    <div class="cm-roominfo-content">
      <div class="cm-roominfo-row"><span class="cm-roominfo-label">房间:</span><span class="cm-roominfo-value">#{{ roomname }}</span></div>
      <div class="cm-roominfo-row"><span class="cm-roominfo-label">在线用户:</span><span class="cm-roominfo-value">{{ onlineCount }}</span></div>
      <div class="cm-roominfo-row"><span class="cm-roominfo-label">用户名:</span><span class="cm-roominfo-value">{{ username }}</span></div>
      <div class="cm-roominfo-row"><span class="cm-roominfo-label">WebSocket:</span>
        <span class="cm-roominfo-value" :class="wsConnected ? 'cm-roominfo-ok' : 'cm-roominfo-bad'">{{ wsConnected ? '✅ 已连接' : t('❌ 未连接') }}</span>
      </div>
      <div class="cm-roominfo-row"><span class="cm-roominfo-label">消息时间戳:</span><span class="cm-roominfo-value">{{ lastSeen }}</span></div>
    </div>
  </div>`
};
