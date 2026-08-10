// v1.53 附件/文件面板 — Vue3 重写（批2 工具域）
// 完全复刻旧 filespanel.js toggleFilesPanel()：图片/文件两 tab，扫描当前聊天区已渲染消息，
// 点击行滚动定位到对应消息并加 msg-ref-highlight 高亮（2s 后消失），点击后关闭面板。
// 数据源与旧实现一致（从 state.chatlog DOM 扫描，无网络请求）；切换 tab 即重新扫描。
// 弹窗壳由 modal-manager 提供，本文件只注入自身布局样式。
import * as Vue from '/static/chat/vendor/vue.js';
import { state, t } from '../state.js';
import { injectCss } from '../modal-manager.js';

injectCss('cm-style-filespanel', `
.cm-filespanel { display: flex; flex-direction: column; min-width: min(380px, 90vw); }
.cm-filespanel-tabs { display: flex; gap: 8px; padding: 12px 16px 0; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.cm-filespanel-tab { padding: 6px 14px; border-radius: 6px; font-size: 12px; cursor: pointer; background: var(--bg); color: var(--text-secondary); border: 1px solid var(--border); font-family: inherit; }
.cm-filespanel-tab.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.cm-filespanel-list { flex: 1; overflow-y: auto; min-height: 220px; padding: 12px; }
.cm-filespanel-empty { text-align: center; color: var(--text-secondary); padding: 40px 0; font-size: 13px; }
.cm-filespanel-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer; margin-bottom: 4px; background: var(--bg); }
.cm-filespanel-row:hover { background: var(--hover-bg, #e8e8e8); }
.cm-filespanel-thumb { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
.cm-filespanel-icon { font-size: 18px; flex-shrink: 0; }
.cm-filespanel-info { flex: 1; min-width: 0; overflow: hidden; }
.cm-filespanel-name { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-filespanel-meta { font-size: 10px; color: var(--text-secondary); }
`);

export default {
  name: 'FilesPanelModal',
  setup(props, { emit }) {
    const tab = Vue.ref('image');
    const items = Vue.ref([]);
    const empty = Vue.ref(false);

    function scan() {
      const msgs = state.chatlog ? state.chatlog.querySelectorAll('.chat-msg') : [];
      const arr = [];
      msgs.forEach((msg) => {
        if (tab.value === 'image') {
          const img = msg.querySelector('.bubble img');
          if (img) {
            const nameEl = msg.querySelector('.username');
            const timeEl = msg.querySelector('.msg-time');
            arr.push({ el: msg, src: img.src, name: nameEl ? nameEl.textContent : '?', time: timeEl ? timeEl.textContent : '', type: 'image' });
          }
        } else {
          const fileLink = msg.querySelector('.file-msg');
          if (fileLink) {
            const nameEl = msg.querySelector('.username');
            const timeEl = msg.querySelector('.msg-time');
            const fileName = (fileLink.querySelector('.file-name')?.textContent) || fileLink.textContent;
            arr.push({ el: msg, name: nameEl ? nameEl.textContent : '?', time: timeEl ? timeEl.textContent : '', fileName, type: 'file' });
          }
        }
      });
      arr.reverse();
      items.value = arr;
      empty.value = arr.length === 0;
    }

    function switchTab(type) {
      tab.value = type;
      scan();
    }

    function jump(item) {
      item.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      item.el.classList.add('msg-ref-highlight');
      setTimeout(() => item.el.classList.remove('msg-ref-highlight'), 2000);
      emit('close');
    }

    scan();

    return { tab, items, empty, switchTab, jump, t };
  },
  template: `
  <div class="cm-filespanel">
    <div class="cm-header">
      <span>📎 附件管理</span>
      <button class="cm-close" @click="$emit('close')" title="关闭">&times;</button>
    </div>
    <div class="cm-filespanel-tabs">
      <button type="button" class="cm-filespanel-tab" :class="{ active: tab === 'image' }" @click="switchTab('image')">{{ t('🖼 图片') }}</button>
      <button type="button" class="cm-filespanel-tab" :class="{ active: tab === 'file' }" @click="switchTab('file')">{{ t('📎 文件') }}</button>
    </div>
    <div class="cm-filespanel-list">
      <div v-if="empty" class="cm-filespanel-empty">{{ '暂无' + (tab === 'image' ? '图片' : t('文件')) }}</div>
      <template v-else>
        <div v-for="(item, i) in items" :key="i" class="cm-filespanel-row" @click="jump(item)">
          <img v-if="tab === 'image'" class="cm-filespanel-thumb" :src="item.src" alt="">
          <span v-else class="cm-filespanel-icon">📎</span>
          <div class="cm-filespanel-info">
            <div class="cm-filespanel-name">{{ tab === 'image' ? item.name : item.fileName }}</div>
            <div class="cm-filespanel-meta">{{ item.time }} · {{ item.name }}</div>
          </div>
        </div>
      </template>
    </div>
  </div>`
};
