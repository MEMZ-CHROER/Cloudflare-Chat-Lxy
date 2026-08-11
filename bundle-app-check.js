// src/client/admin/app.js
import * as Vue from "/static/admin/vendor/vue.js";
import { store, navigate, toast } from "/static/admin/store.js";
import UserModal from "/static/admin/sections/usermodal.js";
var ROUTES = {
  dashboard: () => import("/static/admin/sections/dashboard.js"),
  rooms: () => import("/static/admin/sections/rooms.js"),
  users: () => import("/static/admin/sections/users.js"),
  bans: () => import("/static/admin/sections/bans.js"),
  ipbans: () => import("/static/admin/sections/ipbans.js"),
  blacklist: () => import("/static/admin/sections/blacklist.js"),
  history: () => import("/static/admin/sections/history.js"),
  tags: () => import("/static/admin/sections/tags.js"),
  points: () => import("/static/admin/sections/points.js"),
  market: () => import("/static/admin/sections/market.js"),
  exp: () => import("/static/admin/sections/exp.js"),
  levelstyle: () => import("/static/admin/sections/levelstyle.js"),
  shop: () => import("/static/admin/sections/shop.js"),
  tasks: () => import("/static/admin/sections/tasks.js"),
  lottery: () => import("/static/admin/sections/lottery.js"),
  redeem: () => import("/static/admin/sections/redeem.js"),
  ipgroup: () => import("/static/admin/sections/ipgroup.js"),
  webhooks: () => import("/static/admin/sections/webhooks.js"),
  bot: () => import("/static/admin/sections/bot.js"),
  sendmessage: () => import("/static/admin/sections/sendmessage.js"),
  kickprotect: () => import("/static/admin/sections/kickprotect.js"),
  adminkey: () => import("/static/admin/sections/adminkey.js"),
  log: () => import("/static/admin/sections/log.js"),
  season: () => import("/static/admin/sections/season.js"),
  honor: () => import("/static/admin/sections/honor.js"),
  emoji: () => import("/static/admin/sections/emoji.js")
};
var NAV = [
  { key: "dashboard", label: "\u{1F4CA} \u4EEA\u8868\u76D8" },
  { key: "rooms", label: "\u{1F3E0} \u623F\u95F4\u5217\u8868", superOnly: true },
  { key: "users", label: "\u{1F465} \u5728\u7EBF\u7528\u6237", superOnly: true },
  { key: "bans", label: "\u{1F6AB} \u5C01\u7981\u7528\u6237", superOnly: true },
  { key: "ipbans", label: "\u{1F6E1}\uFE0F IP\u5C01\u7981", superOnly: true },
  { key: "blacklist", label: "\u{1F6AB} \u5168\u5C40\u9ED1\u540D\u5355", superOnly: true },
  { key: "history", label: "\u{1F558} \u5386\u53F2\u7528\u6237", superOnly: true },
  { key: "tags", label: "\u{1F3F7}\uFE0F \u7528\u6237\u6807\u7B7E" },
  { key: "points", label: "\u{1F4B0} \u79EF\u5206\u7BA1\u7406", superOnly: true },
  { key: "exp", label: "\u2B50 \u7B49\u7EA7\u7BA1\u7406", superOnly: true },
  { key: "levelstyle", label: "\u{1F3C5} \u623F\u95F4\u6837\u5F0F" },
  { key: "shop", label: "\u{1F6D2} \u5546\u5E97\u7BA1\u7406" },
  { key: "tasks", label: "\u{1F4CB} \u4EFB\u52A1\u7BA1\u7406" },
  { key: "lottery", label: "\u{1F3B0} \u62BD\u5956\u7BA1\u7406" },
  { key: "ipgroup", label: "\u{1F310} \u540CIP\u68C0\u6D4B", superOnly: true },
  { key: "redeem", label: "\u{1F381} \u5151\u6362\u7801", superOnly: true },
  { key: "market", label: "\u{1F4B1} \u5E02\u573A\u7BA1\u7406", superOnly: true },
  { key: "webhooks", label: "\u{1F517} Webhook" },
  { key: "bot", label: "\u{1F916} \u673A\u5668\u4EBA\u547D\u4EE4" },
  { key: "sendmessage", label: "\u{1F4E3} \u53D1\u9001\u6D88\u606F" },
  { key: "kickprotect", label: "\u{1F6E1}\uFE0F \u8E22\u51FA\u4FDD\u62A4", superOnly: true },
  { key: "adminkey", label: "\u{1F511} \u7BA1\u7406\u5458\u5BC6\u94A5", superOnly: true },
  { key: "log", label: "\u{1F4DC} \u64CD\u4F5C\u65E5\u5FD7", superOnly: true },
  { key: "season", label: "\u{1F3C6} \u8D5B\u5B63\u7BA1\u7406", superOnly: true },
  { key: "honor", label: "\u{1FA99} \u8363\u8A89\u7BA1\u7406", superOnly: true },
  { key: "emoji", label: "\u{1F600} \u8868\u60C5\u7BA1\u7406" }
];
function routeFromPath() {
  let p = location.pathname;
  let m = p.match(/^\/admin-vue\/([^/]*)\/?/);
  let key = m && m[1] ? m[1] : "dashboard";
  return ROUTES[key] ? key : "dashboard";
}
var AdminApp = {
  name: "AdminApp",
  components: { UserModal },
  setup() {
    const booting = Vue.ref(true);
    const keyInput = Vue.ref("");
    const loginErr = Vue.ref(false);
    const asyncComps = Vue.computed(() => {
      const map = {};
      for (const k of Object.keys(ROUTES)) {
        map[k] = Vue.defineAsyncComponent(ROUTES[k]);
      }
      return map;
    });
    const currentComp = Vue.computed(() => asyncComps.value[store.current] || asyncComps.value.dashboard);
    const navItems = Vue.computed(() => NAV.filter((n) => !n.superOnly || store.level === "super"));
    const isSuper = Vue.computed(() => store.level === "super");
    async function checkAuth() {
      booting.value = true;
      try {
        const r = await fetch("/api/admin/auth-check");
        const data = await r.json();
        store.level = data.level || null;
      } catch (e) {
        store.level = null;
      }
      booting.value = false;
    }
    async function doLogin() {
      const k = keyInput.value.trim();
      if (!k) return;
      try {
        const r = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: k })
        });
        if (!r.ok) {
          loginErr.value = true;
          return;
        }
        const data = await r.json();
        store.level = data.level;
        loginErr.value = false;
        keyInput.value = "";
        toast("\u767B\u5F55\u6210\u529F");
      } catch (e) {
        loginErr.value = true;
      }
    }
    async function doLogout() {
      try {
        await fetch("/api/admin/logout", { method: "POST" });
      } catch (e) {
      }
      store.level = null;
      store.current = "dashboard";
      try {
        history.pushState({}, "", "/admin-vue/dashboard/");
      } catch {
      }
      toast("\u5DF2\u9000\u51FA\u767B\u5F55");
    }
    function go(key) {
      navigate(key);
    }
    Vue.onMounted(() => {
      store.current = routeFromPath();
      checkAuth();
      window.addEventListener("popstate", () => {
        store.current = routeFromPath();
      });
    });
    return { booting, keyInput, loginErr, store, navItems, isSuper, currentComp, doLogin, doLogout, go };
  },
  template: `
  <div class="av-app">
    <template v-if="booting">
      <div class="av-login"><div class="av-loading"><span class="spinner"></span>\u52A0\u8F7D\u4E2D...</div></div>
    </template>

    <template v-else-if="!store.level">
      <div class="av-login">
        <div class="av-login-card">
          <h2>\u{1F510} CloudChat Admin</h2>
          <p class="sub">\u8F93\u5165\u7BA1\u7406\u5BC6\u94A5\u4EE5\u8FDB\u5165\u540E\u53F0</p>
          <input v-model="keyInput" class="av-input" type="password" placeholder="\u7BA1\u7406\u5BC6\u94A5" @keydown.enter="doLogin" autofocus>
          <button class="av-btn primary" @click="doLogin">\u767B \u5F55</button>
          <p v-if="loginErr" class="av-login-err">\u5BC6\u94A5\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5</p>
        </div>
      </div>
    </template>

    <template v-else>
      <header class="av-topbar">
        <span class="av-brand">\u{1F510} CloudChat Admin <em>v1.52</em></span>
        <span style="display:flex;align-items:center;gap:12px">
          <span class="av-level" :class="store.level">{{ store.level }}</span>
          <button class="av-btn ghost sm" @click="doLogout">\u9000\u51FA\u767B\u5F55</button>
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
Vue.createApp(AdminApp).mount("#admin-app");
