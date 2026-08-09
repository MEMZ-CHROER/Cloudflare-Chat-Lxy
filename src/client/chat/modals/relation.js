// 👥 v1.53 关系链弹窗 — Vue3 重写（批1 范式弹窗，仿 settings.js）
// UI 绑定层：数据全部走原模块 API（/api/rel/*），点名字复用 window.showUserMenu/showProfile 原逻辑。
// 弹窗壳由 modal-manager 提供，本文件只注入自身布局样式（用聊天室 CSS 变量，自动跟随明暗/主题）。
// 三分栏：关注 / 好友 / 拉黑（图标+计数），顶部搜索框按用户名查关系状态并提供加关注/加好友/解除拉黑等行内动作。
import * as Vue from '/static/chat/vendor/vue.js';
import { state, t } from '../state.js';
import { getAuthName, getAuthToken, isAuthenticated } from '../auth.js';
import { injectCss } from '../modal-manager.js';

injectCss('cm-style-relation', `
.cm-relation { display: flex; flex-direction: column; height: 100%; min-width: min(400px, 88vw); }
.cm-relation-search { display: flex; gap: 8px; padding: 12px 16px 0; }
.cm-relation-search input { flex: 1; min-width: 0; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--input-ink); font-size: 13px; outline: none; font-family: inherit; }
.cm-relation-search input:focus { border-color: var(--primary); }
.cm-relation-search button { padding: 8px 14px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
.cm-relation-search button:hover { background: var(--primary-dark); }
.cm-relation-search button:disabled { opacity: .5; cursor: default; }
.cm-relation-search-result { padding: 12px 16px 0; }
.cm-relation-tabs { display: flex; border-bottom: 1px solid var(--border); margin-top: 12px; flex-shrink: 0; }
.cm-relation-tab { flex: 1; padding: 10px 4px; text-align: center; font-weight: 600; font-size: 13px; cursor: pointer; color: var(--text-secondary); border: none; background: none; border-bottom: 2px solid transparent; transition: all .2s; font-family: inherit; }
.cm-relation-tab.active { color: var(--primary); border-bottom-color: var(--primary); }
.cm-relation-count { display: inline-block; min-width: 16px; padding: 0 5px; margin-left: 4px; border-radius: 8px; background: rgba(var(--primary-rgb), 0.12); color: var(--primary); font-size: 11px; line-height: 16px; }
.cm-relation-list { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 12px 16px; }
.cm-relation-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-bottom: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
.cm-relation-avatar { width: 34px; height: 34px; border-radius: 50%; background: rgba(var(--primary-rgb), 0.12); color: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; overflow: hidden; flex-shrink: 0; }
.cm-relation-avatar img { width: 100%; height: 100%; object-fit: cover; }
.cm-relation-name { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; cursor: pointer; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-relation-name:hover { color: var(--primary); }
.cm-relation-actions { display: flex; gap: 6px; flex-shrink: 0; margin-left: 8px; }
.cm-relation-btn { padding: 5px 12px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 12px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); transition: all .2s; white-space: nowrap; font-family: inherit; }
.cm-relation-btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.cm-relation-btn:disabled { opacity: .5; cursor: default; }
.cm-relation-empty { text-align: center; padding: 40px 16px; color: var(--text-secondary); font-size: 14px; }
`);

const TABS = [
  { key: 'following', icon: '👀' },
  { key: 'friends', icon: '🤝' },
  { key: 'blocked', icon: '🚫' },
];

export default {
  name: 'RelationModal',
  props: ['tab'],
  setup(props) {
    // ---- 语言响应式（langchange 刷新 labels）----
    const langTick = Vue.ref(0);
    window.addEventListener('langchange', () => { langTick.value++; });
    const labels = Vue.computed(() => {
      void langTick.value;
      return {
        manage: t('relManage'),
        close: t('close'),
        relMyFollowing: t('relMyFollowing'),
        relMyFriends: t('relMyFriends'),
        relMyBlocked: t('relMyBlocked'),
        relFollowTarget: t('relFollowTarget'),
        relUnfollow: t('relUnfollow'),
        relAddFriend: t('relAddFriend'),
        relDeleteFriend: t('relDeleteFriend'),
        relUnblock: t('relUnblock'),
        relPleaseLogin: t('relPleaseLogin'),
        relOpFailed: t('relOpFailed'),
        relEmpty: t('relEmpty'),
        relLoading: t('relLoading'),
        search: t('search'),
        loadFailed: t('加载失败'),
      };
    });

    // ---- 状态 ----
    const activeTab = Vue.ref(props.tab && TABS.some(x => x.key === props.tab) ? props.tab : 'following');
    const loading = Vue.ref(false);
    const listError = Vue.ref('');
    const names = Vue.ref([]);
    const counts = Vue.reactive({ following: 0, followers: 0, friends: 0, blocked: 0, requests: 0 });
    const keyword = Vue.ref('');
    const searching = Vue.ref(false);
    const searchResult = Vue.ref(null);   // { name, status }
    const searchError = Vue.ref('');
    const busy = Vue.reactive({});        // "action:target" -> true
    const avatarMap = Vue.reactive({});   // name -> avatar dataURL/url（懒加载）
    const avatarLoading = new Set();

    // 头像懒加载（/api/user/profile 公开无鉴权端点）
    function loadAvatar(name) {
      if (!name || avatarMap[name] !== undefined || avatarLoading.has(name)) return;
      avatarLoading.add(name);
      fetch('/api/user/profile?name=' + encodeURIComponent(name))
        .then(r => r.json())
        .then(d => { avatarMap[name] = (d && d.avatar) || ''; })
        .catch(() => { avatarMap[name] = ''; });
    }

    // ---- 列表加载（照抄原 loadRelationsList 的 API 与响应结构）----
    async function loadList(tab) {
      if (!isAuthenticated()) { names.value = []; listError.value = labels.value.relPleaseLogin; return; }
      loading.value = true; listError.value = '';
      try {
        let r = await fetch('/api/rel/lists?name=' + encodeURIComponent(getAuthName()) + '&token=' + encodeURIComponent(getAuthToken()) + '&tab=' + encodeURIComponent(tab));
        let data = await r.json();
        if (!data || data.ok === false) { names.value = []; listError.value = labels.value.loadFailed; return; }
        let c = data.counts || {};
        counts.following = c.following || 0;
        counts.followers = c.followers || 0;
        counts.friends = c.friends || 0;
        counts.blocked = c.blocked || 0;
        counts.requests = c.requests || 0;
        names.value = Array.isArray(data.names) ? data.names : [];
        names.value.forEach(n => loadAvatar(n));
      } catch (e) {
        names.value = [];
        listError.value = labels.value.loadFailed + ': ' + e.message;
      } finally {
        loading.value = false;
      }
    }

    function switchTab(tab) {
      activeTab.value = tab;
      loadList(tab);
    }

    // manager 复用弹窗更新 props.tab 时跟随切换
    Vue.watch(() => props.tab, (nv) => { if (nv && nv !== activeTab.value) switchTab(nv); });

    // 统一 POST 封装（照抄原 postAction：body {name,token,target} + _busy 防抖）
    async function postAction(action, target, extra) {
      if (!target) return;
      if (!isAuthenticated()) { alert(labels.value.relPleaseLogin); return; }
      let key = action + ':' + target;
      if (busy[key]) return;
      busy[key] = true;
      try {
        let body = { name: getAuthName(), token: getAuthToken(), target };
        if (extra) Object.assign(body, extra);
        let r = await fetch('/api/rel/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        let d = await r.json();
        if (d && d.error) alert(t(d.error) || labels.value.relOpFailed);
        else {
          loadList(activeTab.value);
          if (searchResult.value && searchResult.value.name === target) refreshSearchStatus();
        }
      } catch (e) {
        alert(labels.value.relOpFailed + ': ' + e.message);
      } finally {
        busy[key] = false;
      }
    }

    // ---- 搜索（后端无独立用户搜索端点，用 /api/rel/status 校验目标存在并取关系状态）----
    async function doSearch() {
      let q = keyword.value.trim();
      if (!q) return;
      if (!isAuthenticated()) { alert(labels.value.relPleaseLogin); return; }
      if (q === getAuthName()) { searchResult.value = null; searchError.value = t('不能对自己操作'); return; }
      searching.value = true; searchError.value = ''; searchResult.value = null;
      try {
        let r = await fetch('/api/rel/status?name=' + encodeURIComponent(getAuthName()) + '&token=' + encodeURIComponent(getAuthToken()) + '&target=' + encodeURIComponent(q));
        let d = await r.json();
        if (d && d.ok && d.status) {
          searchResult.value = { name: q, status: d.status };
          loadAvatar(q);
        } else {
          searchError.value = (d && d.error) ? t(d.error) : labels.value.loadFailed;
        }
      } catch (e) {
        searchError.value = labels.value.relOpFailed + ': ' + e.message;
      } finally {
        searching.value = false;
      }
    }

    async function refreshSearchStatus() {
      let sr = searchResult.value;
      if (!sr || !sr.name) return;
      try {
        let r = await fetch('/api/rel/status?name=' + encodeURIComponent(getAuthName()) + '&token=' + encodeURIComponent(getAuthToken()) + '&target=' + encodeURIComponent(sr.name));
        let d = await r.json();
        if (d && d.ok && d.status) sr.status = d.status;
      } catch (_) {}
    }

    // 搜索结果行内动作（按 loadRelationMenuButtons 同款优先级）
    const searchActions = Vue.computed(() => {
      let sr = searchResult.value;
      if (!sr) return [];
      let st = sr.status || {};
      let acts = [];
      if (st.blockedBy) return acts;
      if (st.blocked) { acts.push({ label: labels.value.relUnblock, action: 'unblock' }); return acts; }
      if (st.friends) { acts.push({ label: labels.value.relDeleteFriend, action: 'unfriend' }); return acts; }
      acts.push({ label: st.following ? labels.value.relUnfollow : labels.value.relFollowTarget, action: st.following ? 'unfollow' : 'follow' });
      if (!st.pendingOut && !st.pendingIn) acts.push({ label: labels.value.relAddFriend, action: 'request' });
      return acts;
    });

    function runSearchAction(a) {
      if (!searchResult.value) return;
      postAction(a.action, searchResult.value.name);
    }

    // 三分栏行内动作（照抄原 renderRowActions 的 tab 分支）
    function rowActionFor(n) {
      if (activeTab.value === 'following') return { action: 'unfollow', label: labels.value.relUnfollow };
      if (activeTab.value === 'friends') return { action: 'unfriend', label: labels.value.relDeleteFriend };
      if (activeTab.value === 'blocked') return { action: 'unblock', label: labels.value.relUnblock };
      return null;
    }

    // 点名字 → 用户菜单（照抄原逻辑：有 showUserMenu 用它弹菜单，否则退回 showProfile）
    function openUser(name, e) {
      if (e) e.stopPropagation();
      let rct = e && e.currentTarget ? e.currentTarget.getBoundingClientRect() : null;
      if (typeof window.showUserMenu === 'function' && rct) window.showUserMenu(name, rct.left, rct.bottom + 4);
      else if (typeof window.showProfile === 'function') window.showProfile(name);
    }

    // 初始加载
    loadList(activeTab.value);

    return {
      labels, TABS, activeTab, loading, listError, names, counts,
      keyword, searching, searchResult, searchError, busy, avatarMap,
      switchTab, doSearch, searchActions, runSearchAction, rowActionFor, openUser, postAction,
    };
  },
  template: `
  <div class="cm-relation">
    <div class="cm-header">
      <span>👥 {{ labels.manage }}</span>
      <button class="cm-close" @click="$emit('close')" title="关闭">&times;</button>
    </div>
    <!-- 搜索用户：加关注 / 加好友 -->
    <div class="cm-relation-search">
      <input v-model="keyword" placeholder="搜索用户名..." @keyup.enter="doSearch">
      <button :disabled="searching" @click="doSearch">{{ labels.search }}</button>
    </div>
    <div v-if="searchError || searchResult" class="cm-relation-search-result">
      <div v-if="searchError" class="cm-relation-empty">{{ searchError }}</div>
      <div v-else class="cm-relation-row">
        <span class="cm-relation-avatar">
          <img v-if="avatarMap[searchResult.name]" :src="avatarMap[searchResult.name]" alt="">
          <span v-else class="cm-relation-avatar-letter">{{ searchResult.name.charAt(0) }}</span>
        </span>
        <span class="cm-relation-name" @click="openUser(searchResult.name, $event)">{{ searchResult.name }}</span>
        <span class="cm-relation-actions">
          <button v-for="a in searchActions" :key="a.action" class="cm-relation-btn"
            :disabled="busy[a.action + ':' + searchResult.name]" @click="runSearchAction(a)">{{ a.label }}</button>
        </span>
      </div>
    </div>
    <!-- 三分栏 -->
    <div class="cm-relation-tabs">
      <button v-for="tb in TABS" :key="tb.key" type="button" class="cm-relation-tab"
        :class="{ active: activeTab === tb.key }" @click="switchTab(tb.key)">
        {{ tb.icon }} {{ labels['relMy' + (tb.key === 'following' ? 'Following' : tb.key === 'friends' ? 'Friends' : 'Blocked')] }}
        <span class="cm-relation-count">{{ counts[tb.key] }}</span>
      </button>
    </div>
    <!-- 列表 -->
    <div class="cm-relation-list">
      <div v-if="loading" class="cm-loading">{{ labels.relLoading }}</div>
      <div v-else-if="listError" class="cm-relation-empty">{{ listError }}</div>
      <div v-else-if="names.length === 0" class="cm-relation-empty">{{ labels.relEmpty }}</div>
      <template v-else>
        <div v-for="n in names" :key="n" class="cm-relation-row">
          <span class="cm-relation-avatar">
            <img v-if="avatarMap[n]" :src="avatarMap[n]" alt="">
            <span v-else class="cm-relation-avatar-letter">{{ n.charAt(0) }}</span>
          </span>
          <span class="cm-relation-name" @click="openUser(n, $event)">{{ n }}</span>
          <span class="cm-relation-actions">
            <button v-if="rowActionFor(n)" type="button" class="cm-relation-btn"
              :disabled="busy[rowActionFor(n).action + ':' + n]"
              @click="postAction(rowActionFor(n).action, n)">{{ rowActionFor(n).label }}</button>
          </span>
        </div>
      </template>
    </div>
  </div>`
};
