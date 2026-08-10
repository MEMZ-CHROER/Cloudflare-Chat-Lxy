// v1.53 私信弹窗 — Vue3 重写（批2 工具域，drawer 模式）
// 完全接管旧 #dm-panel：当前对话用户 / 消息缓存 / 输入框 + 发送（WebSocket whisper）。
// 数据源与旧实现一致：state.dmCache（websocket.js 经 addToDMCache 写入）。
// state 是普通对象非响应式，故本组件用 messages 本地镜像 + 定时轮询同步外来 whisper，
// 发送后立即同步刷新（对齐旧 renderDMLog 的即时行为）。
// 缓存写入复用 dm.js 的 addToDMCache 导出（保持与 websocket/命令侧一致，不动其实现）。
// 弹窗壳由 modal-manager 提供 drawer 模式（右侧滑入），本文件只注入自身布局样式。
import * as Vue from '/static/chat/vendor/vue.js';
import { state, t } from '../state.js';
import { formatTime } from '../renderers.js';
import { showError } from '../state.js';
import { injectCss } from '../modal-manager.js';
import { addToDMCache } from '../dm.js';

injectCss('cm-style-dm', `
.cm-dm { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.cm-dm-log { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 8px 12px; background: var(--bg); }
.cm-dm-msg { margin: 4px 0; display: flex; flex-direction: column; }
.cm-dm-msg.self { align-items: flex-end; }
.cm-dm-msg.other { align-items: flex-start; }
.cm-dm-msg-text { max-width: 80%; padding: 6px 10px; border-radius: 8px; font-size: 13px; line-height: 1.4; word-break: break-word; white-space: pre-wrap; }
.cm-dm-msg.self .cm-dm-msg-text { background: var(--primary); color: #fff; border-radius: 8px 2px 8px 8px; }
.cm-dm-msg.other .cm-dm-msg-text { background: var(--frosted-strong); backdrop-filter: var(--frosted-blur); -webkit-backdrop-filter: var(--frosted-blur); color: var(--text); border: 1px solid var(--frosted-border); border-radius: 2px 8px 8px 8px; }
.cm-dm-msg-time { font-size: 10px; color: var(--text-secondary); margin: 1px 4px 0; }
.cm-dm-msg.self .cm-dm-msg-time { text-align: right; }
.cm-dm-divider { text-align: center; font-size: 11px; color: var(--text-secondary); margin: 8px 0 4px; }
.cm-dm-system { text-align: center; font-size: 11px; color: var(--text-secondary); margin: 6px 0; font-style: italic; }
.cm-dm-input-area { display: flex; padding: 8px; gap: 6px; border-top: 1px solid var(--border); flex-shrink: 0; background: var(--surface-2); }
.cm-dm-input { flex: 1; min-width: 0; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: 13px; outline: none; font-family: inherit; background: var(--surface); color: var(--input-ink); }
.cm-dm-input:focus { border-color: var(--primary); }
.cm-dm-send { padding: 8px 16px; border: none; background: var(--primary); color: #fff; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px; font-family: inherit; }
.cm-dm-send:hover { background: var(--primary-dark); }
`);

export default {
  name: 'DmModal',
  props: ['user'],
  setup(props) {
    const messages = Vue.ref([]);   // 当前对话消息镜像（含 divider/system/isSelf 标记，结构照抄 state.dmCache）
    const input = Vue.ref('');
    const logEl = Vue.ref(null);
    let pollTimer = null;

    function scrollToBottom() {
      Vue.nextTick(() => {
        if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight;
      });
    }

    // 从 state.dmCache 同步镜像（复制数组触发 Vue 响应式）
    function sync() {
      const u = props.user;
      messages.value = (state.dmCache && state.dmCache[u]) ? state.dmCache[u].slice() : [];
      scrollToBottom();
    }

    // 切换对话（openModal 更新 props.user 时）
    Vue.watch(() => props.user, () => { sync(); });

    // 弹窗打开：首次同步 + 聚焦输入框（对齐 openDM 的 focus/select）
    Vue.onMounted(() => {
      sync();
      let inp = document.querySelector('.cm-dm-input');
      if (inp) { inp.focus(); inp.select(); }
      // state.dmCache 非响应式，轮询同步外来 whisper（addToDMCache 由 websocket.js 调用写入）
      pollTimer = setInterval(sync, 600);
    });
    Vue.onUnmounted(() => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    });

    // 发送：逻辑照抄 dm.js sendDM（WebSocket whisper + addToDMCache 缓存），输入框换成组件内 v-model
    function send() {
      let text = input.value.trim();
      if (!text) return;
      const u = props.user;
      if (!u) { showError(t("请先选择私信对象")); return; }
      if (!state.currentWebSocket) { showError(t("未连接到聊天室")); return; }
      input.value = "";
      state.currentWebSocket.send(JSON.stringify({type: "whisper", target: u, message: text}));
      addToDMCache(u, {from: state.username, message: text, timestamp: Date.now()}, true);
      sync();
    }

    return { props, messages, input, logEl, send, formatTime, t };
  },
  template: `
  <div class="cm-dm">
    <div class="cm-header">
      <span>💬 {{ t('私信: ') }}{{ props.user }}</span>
      <button class="cm-close" @click="$emit('close')" title="关闭">&times;</button>
    </div>
    <div ref="logEl" class="cm-dm-log">
      <div v-if="messages.length === 0" class="cm-dm-system">还没有消息，开始聊天吧</div>
      <div v-for="(m, i) in messages" :key="i">
        <div v-if="m.divider" class="cm-dm-divider">{{ m.divider }}</div>
        <div v-else-if="m.system" class="cm-dm-system">{{ m.system }}</div>
        <div v-else class="cm-dm-msg" :class="m.isSelf ? 'self' : 'other'">
          <span class="cm-dm-msg-text">{{ m.message }}</span>
          <span class="cm-dm-msg-time">{{ formatTime(m.timestamp) }}</span>
        </div>
      </div>
    </div>
    <div class="cm-dm-input-area">
      <input v-model="input" class="cm-dm-input" placeholder="输入消息..." @keyup.enter="send">
      <button class="cm-dm-send" type="button" @click="send">{{ t('发送') }}</button>
    </div>
  </div>`
};
