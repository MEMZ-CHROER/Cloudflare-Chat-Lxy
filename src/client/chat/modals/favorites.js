// v1.53 收藏弹窗 — Vue3 重写（批2 工具域）
// 与旧 overlay 行为一致：收藏列表来自 localStorage（chat_favorites_<room>），点击项滚动定位到消息。
// 纯逻辑（loadFavorites/getStorageKey/isFavorited）复用 ../favorites.js，弹窗壳由 modal-manager 提供。
// 原实现无"清空收藏"按钮，保持行为一致，不新增。
import * as Vue from '/static/chat/vendor/vue.js';
import { state, t } from '../state.js';
import { injectCss } from '../modal-manager.js';
import { loadFavorites } from '../favorites.js';

injectCss('cm-style-favorites', `
.cm-fav { display: flex; flex-direction: column; min-width: min(380px, 88vw); }
.cm-fav-body { padding: 12px; overflow-y: auto; }
.cm-fav-item { padding: 8px 10px; border-radius: 8px; cursor: pointer; margin-bottom: 4px; background: var(--bg); transition: background .15s; }
.cm-fav-item:hover { background: var(--hover-bg); }
.cm-fav-item-header { display: flex; align-items: center; gap: 4px; margin-bottom: 2px; }
.cm-fav-item-name { font-weight: 600; font-size: 12px; color: var(--text); }
.cm-fav-item-text { display: block; font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-fav-empty { text-align: center; color: var(--text-secondary); padding: 40px; }
`);

export default {
  name: 'FavoritesModal',
  setup(props, ctx) {
    // 与 renderFavoritesPanel 一致的排序（按加入时间倒序）
    const favorites = Vue.ref(loadFavorites().slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)));

    // 照抄 favorites.js scrollToMessage：滚动定位 + msg-ref-highlight 闪烁 2s
    function scrollToMessage(timestamp) {
      const el = state.chatlog && state.chatlog.querySelector('[data-timestamp="' + timestamp + '"]');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('msg-ref-highlight');
        setTimeout(() => el.classList.remove('msg-ref-highlight'), 2000);
      }
    }

    // 点击收藏项：滚动定位后关闭弹窗（对齐旧 scrollToMessage 末尾的 toggleFavoritesPanel()）
    function openAt(f) {
      scrollToMessage(f.timestamp);
      ctx.emit('close');
    }

    return { favorites, openAt, t };
  },
  template: `
  <div class="cm-fav">
    <div class="cm-header">
      <span>⭐ 收藏的消息</span>
      <button class="cm-close" @click="$emit('close')" title="关闭">&times;</button>
    </div>
    <div class="cm-fav-body">
      <div v-if="favorites.length === 0" class="cm-fav-empty">暂无收藏的消息</div>
      <div v-else>
        <div v-for="f in favorites" :key="f.timestamp" class="cm-fav-item" @click="openAt(f)">
          <div class="cm-fav-item-header">
            <span v-if="f.tag" class="tag" style="display:inline-block;font-size:9px;font-weight:600;color:#fff;padding:1px 4px;border-radius:3px;margin-right:4px;">{{ f.tag }}</span>
            <span class="cm-fav-item-name">{{ f.name || '' }}</span>
          </div>
          <span class="cm-fav-item-text">{{ f.text || '' }}</span>
        </div>
      </div>
    </div>
  </div>`
};
