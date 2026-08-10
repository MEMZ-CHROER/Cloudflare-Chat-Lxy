// @ts-check
// v1.53 批3B 导航壳 Vue3 化 — 浮钮条 / more-menu / mobile-bottom-bar / 用户菜单
// 多运行时：导航是"多按钮 + 响应式显隐"型 UI，交给 Vue3 声明式最舒适；
// 动作逻辑（openSettings/openMusic/toggleSearch/handleMenuAction 等）留在各原模块，组件只做绑定。
// 样式全部复用聊天室现有 class（.floating-btn/.more-menu-item/.mbb-btn/.user-menu-item），视觉零差异。
// 双轨：localStorage.chatLegacyModals=1 时 initNav 不挂载，旧 chat.html DOM + 旧绑定保底工作。
// @ts-ignore 运行时静态路径（/static/chat/vendor/vue.js）无 tsc 声明 → Vue 按 any 使用
import * as Vue from "/static/chat/vendor/vue.js";
import { state, t } from "./state.js";
import { injectCss } from "./modal-manager.js";
import { handleMenuAction } from "./menu.js";

/**
 * 用户菜单响应式状态（menu.js showUserMenu 双轨经 window.__navSetUserMenu 写入）
 * @typedef {{ visible: boolean, name: string, x: number, y: number, label: string,
 *   blocked: boolean, hasAdmin: boolean, relButtons: Record<string, boolean> }} UserMenuState
 */

/** @type {UserMenuState} */
export const userMenuState = Vue.reactive({
  visible: false,
  name: "",
  x: 0,
  y: 0,
  label: "", // 显示名（含备注）
  blocked: false,
  hasAdmin: false,
  relButtons: {}, // 关系按钮显隐（relation.js loadRelationMenuButtons 双轨写入）
});

injectCss(
  "cm-style-nav",
  `
#chat-nav { position: fixed; inset: 0; pointer-events: none; z-index: 900; }
#chat-nav .cm-nav-inner, #chat-nav .floating-btn, #chat-nav #more-menu-panel,
#chat-nav #mobile-bottom-bar, #chat-nav .user-menu { pointer-events: auto; }
#chat-nav .user-menu { position: fixed; z-index: 920; }
`
);

// ========== 浮钮 + more-menu + mobile-bottom-bar ==========
const NavBar = {
  name: "NavBar",
  setup() {
    const moreOpen = Vue.ref(false);
    const soundMuted = Vue.ref(!!state.soundMuted);
    const isDark = Vue.ref(document.body.classList.contains("dark"));

    function toggleSound() {
      state.soundMuted = !state.soundMuted;
      soundMuted.value = state.soundMuted;
    }
    function toggleDark() {
      const on = document.body.classList.toggle("dark");
      isDark.value = on;
      localStorage.setItem("darkMode", on ? "1" : "0");
    }
    /**
     * 懒加载动作：import 目标模块并调用 action.fn(...args)，失败静默吞掉
     * @param {{ file: string, fn: string, args?: any[] }} action 动作描述（模块文件名/导出函数名/参数）
     * @returns {() => void} 点击执行函数
     */
    function lazy(action) {
      return () =>
        import("./" + action.file + ".js")
          .then((m) => {
            const fn = m[action.fn];
            if (fn) fn.apply(null, action.args || []);
          })
          .catch(() => {});
    }

    // 动作映射：懒加载对应模块（对齐旧绑定，不提前拉依赖）
    /** @type {Record<string, () => void>} 更多菜单动作映射（键与 moreItems.action 对应） */
    const moreActions = {
      achievements: lazy({ file: "achievements", fn: "toggleAchievementsPanel" }),
      favorites: lazy({ file: "favorites", fn: "toggleFavoritesPanel" }),
      highlights: lazy({ file: "highlights", fn: "showHighlightsPanel" }),
      "room-info": lazy({ file: "roominfo", fn: "toggleRoomInfo" }),
      scheduler: () => {
        const btn = /** @type {HTMLElement | null} */ (document.querySelector("#schedule-btn"));
        if (btn) btn.click();
      },
      changelog: () => window.open("/changelog", "_blank"),
      archive: () => window.open("/archive", "_blank"),
      export: lazy({ file: "ui", fn: "exportChatLog" }),
      // v1.56 房间知识库：Vue 弹窗（懒加载 modals/kb.js）
      kb: () => import("./modal-manager.js").then((m) => m.openModal("kb", { room: state.roomname })),
    };
    /** @type {Record<string, () => void>} 浮钮条动作映射 */
    const floatActions = {
      search: lazy({ file: "search", fn: "toggleSearch" }),
      settings: lazy({ file: "settings", fn: "openSettings" }),
      music: lazy({ file: "music", fn: "openMusic" }),
      tag: lazy({ file: "shop", fn: "openShop", args: ["inventory"] }),
    };

    /** @type {{ action: string, icon: string, label: string }[]} 更多菜单项（渲染进 #more-menu-panel） */
    const moreItems = [
      { action: "achievements", icon: "🏅", label: t("我的成就") },
      { action: "favorites", icon: "⭐", label: t("收藏的消息") },
      { action: "highlights", icon: "🏆", label: t("精华消息") },
      { action: "room-info", icon: "ℹ️", label: t("房间信息") },
      { action: "scheduler", icon: "⏰", label: t("定时消息") },
      { action: "changelog", icon: "📋", label: t("更新日志") },
      { action: "archive", icon: "📦", label: t("版本存档") },
      { action: "export", icon: "📥", label: t("导出聊天") },
      { action: "kb", icon: "📚", label: t("房间知识库") },
    ];
    /** @type {{ key: string, icon: () => string, title: string, fn: () => void }[]} 移动端底部栏按钮 */
    const bottomItems = [
      { key: "sound", icon: () => (soundMuted.value ? "🔇" : "🔊"), title: "提示音", fn: toggleSound },
      { key: "dark", icon: () => (isDark.value ? "☀️" : "🌙"), title: "暗色模式", fn: toggleDark },
      { key: "search", icon: () => "🔍", title: "搜索", fn: () => floatActions.search() },
      {
        key: "more",
        icon: () => (moreOpen.value ? "✕" : "···"),
        title: "更多",
        fn: () => {
          moreOpen.value = !moreOpen.value;
        },
      },
    ];

    return {
      moreOpen,
      soundMuted,
      isDark,
      t,
      toggleSound,
      toggleDark,
      floatActions,
      moreActions,
      moreItems,
      bottomItems,
    };
  },
  template: `
  <div class="cm-nav-inner">
    <!-- 浮钮条 -->
    <div class="floating-btn" id="sound-toggle" :title="'提示音'" @click="toggleSound">{{ soundMuted ? '🔇' : '🔊' }}</div>
    <div class="floating-btn" id="dark-toggle" :title="'暗色模式'" @click="toggleDark">{{ isDark ? '☀️' : '🌙' }}</div>
    <div class="floating-btn" id="search-toggle" :title="t('搜索消息')" @click="floatActions.search">🔍</div>
    <div class="floating-btn" id="settings-toggle" :title="t('设置')" @click="floatActions.settings">⚙️</div>
    <div class="floating-btn" id="music-toggle" :title="'音乐播放器'" @click="floatActions.music">🎵</div>
    <div class="floating-btn" id="tag-warehouse-btn" :title="'标签仓库'" @click="floatActions.tag">🏷️</div>
    <div class="floating-btn" id="more-menu-btn" :title="t('更多')" @click="moreOpen = !moreOpen">{{ moreOpen ? '✕' : '···' }}</div>
    <!-- more-menu 面板 -->
    <div v-if="moreOpen" id="more-menu-backdrop" @click="moreOpen = false"></div>
    <div v-if="moreOpen" id="more-menu-panel" :class="{ show: moreOpen }">
      <div v-for="item in moreItems" :key="item.action" class="more-menu-item" @click="moreOpen = false; moreActions[item.action]()">
        <span class="mm-icon">{{ item.icon }}</span><span class="mm-label">{{ item.label }}</span>
      </div>
    </div>
    <!-- mobile-bottom-bar -->
    <div id="mobile-bottom-bar">
      <button v-for="b in bottomItems" :key="b.key" class="mbb-btn" :title="b.title" @click="b.fn()">{{ b.icon() }}</button>
    </div>
  </div>`,
};

// ========== 用户菜单（对齐旧 #user-menu） ==========
const UserMenu = {
  name: "UserMenu",
  setup() {
    const s = userMenuState;
    const shown = Vue.computed(() => s.visible);
    const items = [
      { action: "at", label: "@ 提及", danger: false },
      { action: "dm", label: "💬 私信", danger: false },
      { action: "kick", label: "👢 踢出", danger: true },
      { action: "mute", label: "🔇 禁言", danger: true },
      { action: "ban", label: "🚫 封禁", danger: true },
      { action: "banip", label: "🔨 封禁IP", danger: true },
      { action: "batch-kick", label: "👢 批量踢出", danger: false },
      { action: "note", label: "📝 备注", danger: false },
      { action: "pay", label: "💰 转账积分", danger: false },
      { action: "tag", label: "🏷️ 修改标签", danger: false },
      { action: "block", label: "🚫 屏蔽", danger: false },
      { action: "unblock", label: "✅ 取消屏蔽", danger: false },
    ];
    const always = ["pay", "at", "dm", "batch-kick", "note"];
    const relItems = [
      { action: "rel-follow", label: "关注" },
      { action: "rel-unfollow", label: "取消关注" },
      { action: "rel-friend", label: "加好友" },
      { action: "rel-block", label: "拉黑" },
      { action: "rel-unblock", label: "解除拉黑" },
    ];
    function isVisible(it) {
      if (always.indexOf(it.action) !== -1) return true;
      if (it.action === "block") return !s.blocked;
      if (it.action === "unblock") return s.blocked;
      return s.hasAdmin;
    }
    function click(action) {
      handleMenuAction(action);
    }
    function stylePos() {
      const vw = window.innerWidth,
        vh = window.innerHeight;
      const left = Math.max(4, Math.min(s.x, vw - 172 - 4));
      const top = Math.max(4, Math.min(s.y, vh - 280 - 4));
      return { left: left + "px", top: top + "px" };
    }
    return { s, shown, items, relItems, isVisible, click, stylePos };
  },
  template: `
  <Teleport to="body">
    <div v-if="shown" id="user-menu" class="show" :style="stylePos()">
      <div class="user-menu-header" id="user-menu-name">{{ s.label }}</div>
      <div v-for="it in items" :key="it.action" class="user-menu-item" :class="{ danger: it.danger }"
           :style="{ display: isVisible(it) ? 'flex' : 'none' }" @click="click(it.action)">{{ it.label }}</div>
      <div class="user-menu-item" style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px;" @click="click('profile')">👤 用户主页</div>
      <div v-for="it in relItems" :key="it.action" class="menu-btn"
           :style="{ display: s.relButtons && s.relButtons[it.action] ? 'block' : 'none' }"
           @click="click(it.action)">{{ it.label }}</div>
    </div>
  </Teleport>`,
};

// ========== 初始化（双轨） ==========
/**
 * 初始化 Vue3 导航壳（双轨：chatLegacyModals=1 时跳过挂载，旧 DOM + 旧绑定保底）
 * @returns {void}
 */
export function initNav() {
  const mountEl = document.getElementById("chat-nav");
  if (!mountEl) return;
  if (localStorage.getItem("chatLegacyModals") === "1") return; // legacy：旧 DOM 保底，不挂 Vue
  // 隐藏旧导航 DOM（浮钮/more-menu/bottom-bar/用户菜单），Vue 接管；旧绑定仍挂着（对隐藏元素无害）
  const hideIds = [
    "sound-toggle",
    "dark-toggle",
    "search-toggle",
    "settings-toggle",
    "music-toggle",
    "tag-warehouse-btn",
    "more-menu-btn",
    "more-menu-backdrop",
    "more-menu-panel",
    "mobile-bottom-bar",
  ];
  for (const id of hideIds) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }
  const oldUserMenu = document.getElementById("user-menu");
  if (oldUserMenu) oldUserMenu.style.display = "none";
  // menu.js 双轨写用户菜单状态
  // @ts-ignore 运行时挂载全局（menu.js showUserMenu 双轨写入）
  window.__navSetUserMenu = (payload) => {
    Object.assign(userMenuState, payload);
  };
  Vue.createApp({
    name: "NavRoot",
    components: { NavBar, UserMenu },
    template: "<NavBar /><UserMenu />",
  }).mount(mountEl);
}
