// v1.53 精华消息弹窗 — Vue3 重写（批2 工具域）
// 与旧 overlay 行为一致：数据来源 state._highlights（websocket.js 推送时更新），点击项滚动定位到消息。
// Vue 模板插值默认 HTML 转义，等效旧实现的 escapeHtml 防注入。
import * as Vue from '/static/chat/vendor/vue.js';
import { state, t } from '../state.js';
import { injectCss } from '../modal-manager.js';

injectCss('cm-style-highlights', `
.cm-hl { display: flex; flex-direction: column; min-width: min(380px, 88vw); }
.cm-hl-body { padding: 12px; overflow-y: auto; }
.cm-hl-item { padding: 8px 10px; border-radius: 6px; cursor: pointer; margin-bottom: 4px; background: var(--bg); transition: background .1s; }
.cm-hl-item:hover { background: var(--hover-bg, #e8e8e8); }
.cm-hl-name { font-weight: 600; font-size: 12px; }
.cm-hl-text { font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-hl-empty { text-align: center; color: var(--text-secondary); padding: 40px 0; }
`);

export default {
  name: 'HighlightsModal',
  setup(props, ctx) {
    // 与旧 showHighlightsPanel 一致：读取 state._highlights 并倒序（最新的在前）
    const highlights = Vue.ref((state._highlights || []).slice().reverse());

    // 照抄旧实现的滚动定位：msg-ref-highlight 闪烁 2s，随后关闭弹窗
    function openAt(h) {
      const el = state.chatlog && state.chatlog.querySelector('[data-timestamp="' + h.timestamp + '"]');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('msg-ref-highlight');
        setTimeout(() => el.classList.remove('msg-ref-highlight'), 2000);
      }
      ctx.emit('close');
    }

    return { highlights, openAt, t };
  },
  template: `
  <div class="cm-hl">
    <div class="cm-header">
      <span>⭐ 精华消息</span>
      <button class="cm-close" @click="$emit('close')" title="关闭">&times;</button>
    </div>
    <div class="cm-hl-body">
      <div v-if="highlights.length === 0" class="cm-hl-empty">暂无精华消息</div>
      <div v-else>
        <div v-for="h in highlights" :key="h.timestamp" class="cm-hl-item" @click="openAt(h)">
          <div class="cm-hl-name">{{ h.name }}</div>
          <div class="cm-hl-text">{{ h.text }}</div>
        </div>
      </div>
    </div>
  </div>`
};
