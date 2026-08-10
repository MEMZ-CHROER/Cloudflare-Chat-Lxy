// v1.53 搜索弹窗（drawer 模式）— Vue3 重写（批2 工具域）
// 完全复刻旧 search.js 的搜索交互：服务端全文搜索（/api/room/<room>/search?q=...&limit=50，带 channel/password），
// 结果列表（时间/名字/消息预览），点击结果 DOM 定位或加载该时间附近历史再定位（_savedView 供"返回实时"恢复），
// 上一/下一结果循环导航，回车触发搜索。请求序号防过期响应（_searchSeq）。
// 数据源与旧实现一致：fetch 搜索 API + 共享 state；弹窗壳由 modal-manager 提供（drawer 模式右侧滑入）。
// 文案与旧实现一致（t() 复用已有 key / 缺失 key 回退原文）；Vue 模板自动转义，无需手拼 HTML。
import * as Vue from '/static/chat/vendor/vue.js';
import { state, t } from '../state.js';
import { resetMsgDate, refreshReplyCounts } from '../renderers.js';
import { renderChannelMessage } from '../channels.js';
import { injectCss } from '../modal-manager.js';

injectCss('cm-style-search', `
.cm-search { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.cm-search-input { display: flex; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.cm-search-input input { flex: 1; min-width: 0; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--input-ink); font-size: 13px; outline: none; font-family: inherit; }
.cm-search-input input:focus { border-color: var(--primary); }
.cm-search-input button { padding: 8px 14px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
.cm-search-input button:hover { background: var(--primary-dark); }
.cm-search-body { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.cm-search-count { padding: 6px 16px 2px; font-size: 12px; color: var(--text-secondary); }
.cm-search-empty { padding: 32px 16px; text-align: center; color: var(--text-secondary); font-size: 13px; }
.cm-search-row { display: flex; align-items: center; gap: 8px; padding: 10px 16px; cursor: pointer; border-bottom: 1px solid var(--border); }
.cm-search-row:hover, .cm-search-row.active { background: rgba(var(--primary-rgb), 0.08); }
.cm-search-time { color: var(--text-secondary); font-size: 11px; flex-shrink: 0; }
.cm-search-name { font-weight: 600; font-size: 13px; flex-shrink: 0; max-width: 70px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-search-msg { flex: 1; min-width: 0; font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-search-footer { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--border); flex-shrink: 0; }
.cm-search-footer button { padding: 7px 12px; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px; font-size: 12px; cursor: pointer; font-family: inherit; white-space: nowrap; }
.cm-search-footer button:hover { border-color: var(--primary); color: var(--primary); }
.cm-search-nav-count { flex: 1; text-align: center; font-size: 12px; color: var(--text-secondary); white-space: nowrap; }
.cm-search-live { background: var(--primary) !important; color: #fff !important; border-color: var(--primary) !important; }
.cm-search-live:hover { background: var(--primary-dark) !important; color: #fff !important; }
`);

// 请求序号：丢弃过期搜索响应（对齐旧 serverSearch 的 _searchSeq）
let _searchSeq = 0;

function fmtTime(ts) {
  if (!ts) return '';
  try { return new Date(Number(ts)).toLocaleTimeString(); } catch (e) { return String(ts); }
}

export default {
  name: 'SearchModal',
  setup() {
    const keyword = Vue.ref('');
    const loading = Vue.ref(false);
    const results = Vue.ref([]);
    const currentIndex = Vue.ref(-1);
    const error = Vue.ref('');
    const expanded = Vue.ref(false);   // 是否已执行过搜索（区分初始空态与无结果空态）
    const hasSavedView = Vue.ref(false);

    function clearHighlights() {
      document.querySelectorAll('.search-highlight').forEach((el) => {
        const parent = el.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(el.textContent), el);
          parent.normalize();
        }
      });
    }

    function searchUrl(q) {
      let url = '/api/room/' + encodeURIComponent(state.roomname) + '/search?q=' + encodeURIComponent(q) + '&limit=50';
      if (state.currentChannel) url += '&channel=' + encodeURIComponent(state.currentChannel);
      if (state.roomPassword) url += '&password=' + encodeURIComponent(state.roomPassword);
      return url;
    }

    function historyUrl(item) {
      let url = '/api/room/' + encodeURIComponent(state.roomname) + '/history?before=' + (item.timestamp + 1) + '&limit=60';
      if (state.currentChannel) url += '&channel=' + encodeURIComponent(state.currentChannel);
      if (state.roomPassword) url += '&password=' + encodeURIComponent(state.roomPassword);
      return url;
    }

    // 回车/点按钮搜索：照抄旧 doSearch→serverSearch 的 fetch API 与结果处理
    async function doSearch() {
      clearHighlights();
      const q = keyword.value.trim();
      if (!q) {
        results.value = [];
        currentIndex.value = -1;
        error.value = '';
        loading.value = false;
        expanded.value = false;
        return;
      }
      loading.value = true;
      error.value = '';
      expanded.value = true;
      const my = ++_searchSeq;
      try {
        const r = await fetch(searchUrl(q));
        if (my !== _searchSeq) return; // 过期响应丢弃
        const data = await r.json();
        if (my !== _searchSeq) return;
        if (!Array.isArray(data)) {
          results.value = [];
          currentIndex.value = -1;
          error.value = (data && data.error) || t('搜索失败');
          return;
        }
        results.value = data;
        currentIndex.value = -1;
        error.value = data.length === 0 ? t('无匹配结果') : '';
      } catch (e) {
        if (my !== _searchSeq) return;
        results.value = [];
        currentIndex.value = -1;
        error.value = t('搜索失败: ') + e.message;
      } finally {
        if (my === _searchSeq) loading.value = false;
      }
    }

    function onEnter() { doSearch(); }

    function showBackToLiveButton() {
      let btn = document.getElementById('back-to-live-btn');
      if (!btn) {
        btn = document.createElement('div');
        btn.id = 'back-to-live-btn';
        btn.textContent = '⬅ ' + t('返回实时');
        btn.style.cssText = 'position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:60;background:var(--primary);color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);';
        btn.addEventListener('click', () => backToLive());
        document.body.appendChild(btn);
      }
      btn.style.display = 'block';
    }

    function hideBackToLiveButton() {
      const btn = document.getElementById('back-to-live-btn');
      if (btn) btn.style.display = 'none';
    }

    // 点击结果：优先 DOM 定位；不在 DOM 则加载该时间附近历史替换聊天区再定位（照抄旧 jumpToResult）
    async function jumpToResult(item) {
      const el = state.chatlog.querySelector('[data-timestamp="' + item.timestamp + '"]');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('msg-ref-highlight');
        setTimeout(() => el.classList.remove('msg-ref-highlight'), 2000);
        return;
      }
      try {
        const r = await fetch(historyUrl(item));
        const msgs = await r.json();
        if (!Array.isArray(msgs)) return;
        // M19：保存跳转前的实时视图，加载历史定位后提供"返回实时"
        if (!state._savedView) {
          state._savedView = { html: state.chatlog.innerHTML, lastSeen: state.lastSeenTimestamp };
          hasSavedView.value = true;
        }
        state.chatlog.innerHTML = '<div id="spacer"></div>';
        state.lastSeenTimestamp = 0;
        resetMsgDate();
        msgs.forEach((m) => renderChannelMessage(m));
        refreshReplyCounts();
        showBackToLiveButton();
        const target = state.chatlog.querySelector('[data-timestamp="' + item.timestamp + '"]');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('msg-ref-highlight');
          setTimeout(() => target.classList.remove('msg-ref-highlight'), 2000);
        }
      } catch (e) {}
    }

    // M19：返回实时视图（历史定位后可一键回到跳转前的实时界面）
    function backToLive() {
      if (state._savedView) {
        state.chatlog.innerHTML = state._savedView.html;
        state.lastSeenTimestamp = state._savedView.lastSeen;
        state._savedView = null;
        hasSavedView.value = false;
        resetMsgDate();
        refreshReplyCounts();
      }
      hideBackToLiveButton();
    }

    // 上一/下一结果：循环索引 + 滚动定位（照抄旧 searchPrev/searchNext→moveInResults）
    function moveInResults(dir) {
      if (!results.value || results.value.length === 0) return;
      if (currentIndex.value < 0) currentIndex.value = 0;
      currentIndex.value = (currentIndex.value + dir + results.value.length) % results.value.length;
      const target = results.value[currentIndex.value];
      const el = state.chatlog.querySelector('[data-timestamp="' + target.timestamp + '"]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function searchPrev() { moveInResults(-1); }
    function searchNext() { moveInResults(1); }

    return {
      keyword, loading, results, currentIndex, error, expanded, hasSavedView,
      doSearch, onEnter, jumpToResult, backToLive, searchPrev, searchNext,
      fmtTime, t,
    };
  },
  template: `
  <div class="cm-search">
    <div class="cm-header">
      <span>🔍 {{ t('search') }}</span>
      <button class="cm-close" @click="$emit('close')" title="关闭">&times;</button>
    </div>
    <div class="cm-search-input">
      <input v-model="keyword" @keyup.enter="onEnter" :placeholder="t('searchPlaceholder')">
      <button @click="doSearch">{{ t('search') }}</button>
    </div>
    <div class="cm-search-body">
      <div v-if="loading" class="cm-search-empty">{{ t('搜索中...') }}</div>
      <template v-else>
        <div v-if="!expanded" class="cm-search-empty">输入关键词搜索历史消息</div>
        <template v-else>
          <div v-if="error" class="cm-search-empty">{{ error }}</div>
          <template v-else>
            <div v-if="results.length" class="cm-search-count">{{ t('历史找到 ') }}{{ results.length }}{{ t(' 条') }}</div>
            <div v-for="(m, i) in results" :key="m.timestamp + '-' + i" class="cm-search-row" :class="{ active: currentIndex === i }" @click="jumpToResult(m)">
              <span class="cm-search-time">{{ fmtTime(m.timestamp) }}</span>
              <strong class="cm-search-name">{{ m.name || '?' }}</strong>
              <span class="cm-search-msg">{{ m.message || '' }}</span>
            </div>
            <div v-if="!results.length" class="cm-search-empty">{{ t('无匹配结果') }}</div>
          </template>
        </template>
      </template>
    </div>
    <div v-if="results.length" class="cm-search-footer">
      <button @click="searchPrev">⬆ 上一条</button>
      <span class="cm-search-nav-count">{{ currentIndex >= 0 ? (currentIndex + 1) + '/' + results.length : t('历史找到 ') + results.length + t(' 条') }}</span>
      <button @click="searchNext">⬇ 下一条</button>
      <button v-if="hasSavedView" class="cm-search-live" @click="backToLive">⬅ {{ t('返回实时') }}</button>
    </div>
  </div>`
};
