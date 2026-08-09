// v1.52 管理后台 Vue3 迁移 - AdminApp 骨架（登录遮罩 + 顶栏 + 侧边栏 + 动态组件路由）
// 双轨并行期：本应用挂在 /admin-vue/ 独立路径，旧 /admin/ 不受影响。
// 全部 fetch 走 httpOnly Cookie 鉴权，不带 ?key=。
import * as Vue from '/static/admin/vendor/vue.js';
import { store, navigate, toast } from '/static/admin/store.js';
import UserModal from '/static/admin/sections/usermodal.js';

// 路由表：key -> 懒加载组件。批量迁移时在此追加。
const ROUTES = {
  dashboard: () => import('/static/admin/sections/dashboard.js'),
  rooms: () => import('/static/admin/sections/rooms.js'),
  users: () => import('/static/admin/sections/users.js'),
  bans: () => import('/static/admin/sections/bans.js'),
  ipbans: () => import('/static/admin/sections/ipbans.js'),
  blacklist: () => import('/static/admin/sections/blacklist.js'),
  history: () => import('/static/admin/sections/history.js'),
  tags: () => import('/static/admin/sections/tags.js'),
  points: () => import('/static/admin/sections/points.js'),
  market: () => import('/static/admin/sections/market.js'),
  exp: () => import('/static/admin/sections/exp.js'),
  levelstyle: () => import('/static/admin/sections/levelstyle.js'),
  shop: () => import('/static/admin/sections/shop.js'),
  tasks: () => import('/static/admin/sections/tasks.js'),
  lottery: () => import('/static/admin/sections/lottery.js'),
  redeem: () => import('/static/admin/sections/redeem.js'),
  ipgroup: () => import('/static/admin/sections/ipgroup.js'),
};

// 侧边栏导航（superOnly: true 仅超管可见；过渡期只列已迁移页）
const NAV = [
  { key: 'dashboard', label: '📊 仪表盘' },
  { key: 'rooms', label: '🏠 房间列表', superOnly: true },
  { key: 'users', label: '👥 在线用户', superOnly: true },
  { key: 'bans', label: '🚫 封禁用户', superOnly: true },
  { key: 'ipbans', label: '🛡️ IP封禁', superOnly: true },
  { key: 'blacklist', label: '🚫 全局黑名单', superOnly: true },
  { key: 'history', label: '🕘 历史用户', superOnly: true },
  { key: 'tags', label: '🏷️ 用户标签' },
  { key: 'points', label: '💰 积分管理', superOnly: true },
  { key: 'exp', label: '⭐ 等级管理', superOnly: true },
  { key: 'levelstyle', label: '🏅 房间样式' },
  { key: 'shop', label: '🛒 商店管理' },
  { key: 'tasks', label: '📋 任务管理' },
  { key: 'lottery', label: '🎰 抽奖管理' },
  { key: 'ipgroup', label: '🌐 同IP检测', superOnly: true },
  { key: 'redeem', label: '🎁 兑换码', superOnly: true },
  { key: 'market', label: '💱 市场管理', superOnly: true },
];

// 从 location.pathname 解析当前 section key
function routeFromPath() {
  let p = location.pathname;
  let m = p.match(/^\/admin-vue\/([^/]*)\/?/);
  let key = m && m[1] ? m[1] : 'dashboard';
  return ROUTES[key] ? key : 'dashboard';
}

const AdminApp = {
  name: 'AdminApp',
  components: { UserModal },
  setup() {
    const booting = Vue.ref(true);
    const keyInput = Vue.ref('');
    const loginErr = Vue.ref(false);

    const asyncComps = Vue.computed(() => {
      const map = {};
      for (const k of Object.keys(ROUTES)) {
        map[k] = Vue.defineAsyncComponent(ROUTES[k]);
      }
      return map;
    });
    const currentComp = Vue.computed(() => asyncComps.value[store.current] || asyncComps.value.dashboard);
    const navItems = Vue.computed(() => NAV.filter(n => !n.superOnly || store.level === 'super'));
    const isSuper = Vue.computed(() => store.level === 'super');

    async function checkAuth() {
      booting.value = true;
      try {
        const r = await fetch('/api/admin/auth-check');
        const data = await r.json();
        store.level = data.level || null;
      } catch (e) { store.level = null; }
      booting.value = false;
    }

    async function doLogin() {
      const k = keyInput.value.trim();
      if (!k) return;
      try {
        const r = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: k })
        });
        if (!r.ok) { loginErr.value = true; return; }
        const data = await r.json();
        store.level = data.level;
        loginErr.value = false;
        keyInput.value = '';
        toast('登录成功');
      } catch (e) { loginErr.value = true; }
    }

    async function doLogout() {
      try { await fetch('/api/admin/logout', { method: 'POST' }); } catch (e) {}
      store.level = null;
      store.current = 'dashboard';
      try { history.pushState({}, '', '/admin-vue/dashboard/'); } catch {}
      toast('已退出登录');
    }

    // 顶栏 + 侧边栏共用导航
    function go(key) { navigate(key); }

    // popstate：浏览器前进/后退
    Vue.onMounted(() => {
      store.current = routeFromPath();
      checkAuth();
      window.addEventListener('popstate', () => { store.current = routeFromPath(); });
    });

    return { booting, keyInput, loginErr, store, navItems, isSuper, currentComp, doLogin, doLogout, go };
  },
  template: `
  <div class="av-app">
    <template v-if="booting">
      <div class="av-login"><div class="av-loading"><span class="spinner"></span>加载中...</div></div>
    </template>

    <template v-else-if="!store.level">
      <div class="av-login">
        <div class="av-login-card">
          <h2>🔐 CloudChat Admin</h2>
          <p class="sub">输入管理密钥以进入后台</p>
          <input v-model="keyInput" class="av-input" type="password" placeholder="管理密钥" @keydown.enter="doLogin" autofocus>
          <button class="av-btn primary" @click="doLogin">登 录</button>
          <p v-if="loginErr" class="av-login-err">密钥错误，请重试</p>
        </div>
      </div>
    </template>

    <template v-else>
      <header class="av-topbar">
        <span class="av-brand">🔐 CloudChat Admin <em>v1.52</em></span>
        <span style="display:flex;align-items:center;gap:12px">
          <span class="av-level" :class="store.level">{{ store.level }}</span>
          <button class="av-btn ghost sm" @click="doLogout">退出登录</button>
        </span>
      </header>
      <div class="av-body">
        <nav class="av-sidebar">
          <a v-for="n in navItems" :key="n.key" href="#" class="av-nav-item"
             :class="{ active: store.current === n.key }" @click.prevent="go(n.key)">{{ n.label }}</a>
        </nav>
        <main class="av-content">
          <component :is="currentComp" />
        </main>
      </div>
      <UserModal />
    </template>
  </div>`
};

Vue.createApp(AdminApp).mount('#admin-app');
