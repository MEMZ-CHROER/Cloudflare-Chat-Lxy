// v1.53 聊天室 Vue3 弹窗管理器（overlay Modal 管理器）
// 原生消息流保持原生，弹窗/表单/列表交给 Vue3 声明式渲染 —— "每个模块用专属于他的最好的框架"
// 样式全部使用聊天室自身 CSS 变量（--surface/--frosted/--radius + body.dark/body.theme-*），自动跟随明暗与主题。
// 双轨开关：localStorage.chatLegacyModals=1 时弹窗模块自行回退旧 overlay（本管理器不参与）。
import * as Vue from '/static/chat/vendor/vue.js';

// 自定义加载器注册表（jsdom 测试用它注入合成模块，生产可省略——按约定路径 ./modals/<name>.js 懒加载）
const registry = {};

// 原生宿主注册表（批3 游戏等 canvas/帧循环宿主）：registerModalHost(name, mount, unmount)
// mount(el) 把原生渲染进弹窗卡片容器并返回清理函数；unmount() 可选（整体卸载钩子）
const hosts = {};

// 弹窗栈：reactive 数组，支持多弹窗叠加、置顶
export const stack = Vue.reactive([]);

// 注入弹窗管理器通用样式（body 级，用聊天室 CSS 变量，非 admin 硬编码色）
injectCss('cm-style', `
#chat-modals { position: fixed; inset: 0; z-index: 1000; pointer-events: none; }
.cm-layer { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; pointer-events: auto; }
.cm-layer-drawer { justify-content: flex-end; }
.cm-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.6); animation: cm-fade .2s ease; }
.cm-card { position: relative; background: var(--surface-2); border: 1px solid var(--frosted-border); backdrop-filter: var(--frosted-blur); -webkit-backdrop-filter: var(--frosted-blur); border-radius: var(--radius); max-width: 92vw; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 8px 40px rgba(0,0,0,0.25); overflow: hidden; animation: cm-pop .22s ease; color: var(--text); }
.cm-card-drawer { height: 100vh; max-height: 100vh; width: min(380px, 92vw); border-radius: 0; animation: cm-slide .25s ease; }
.cm-body { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.cm-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); font-size: 18px; font-weight: 700; flex-shrink: 0; }
.cm-close { font-size: 24px; cursor: pointer; color: var(--text-secondary); line-height: 1; background: none; border: none; padding: 0 4px; }
.cm-close:hover { color: var(--text); }
.cm-loading { padding: 40px; text-align: center; color: var(--text-secondary); }
.cm-body-host { display: flex; flex-direction: column; overflow: hidden; }
.cm-host { display: flex; flex-direction: column; flex: 1; min-height: 320px; }
@keyframes cm-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes cm-pop { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: scale(1); } }
@keyframes cm-slide { from { transform: translateX(100%); } to { transform: translateX(0); } }
`);

// 供弹窗模块注入自身样式（避免样式塞进 style.css 与旧 overlay 纠缠）
export function injectCss(id, css) {
  if (!document || !document.head) return;
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

// 注册自定义加载器（覆盖默认路径约定；jsdom 测试注入合成模块）
export function registerModal(name, loader) {
  registry[name] = loader;
}

// 注册原生宿主（批3 游戏等）：mount(el) 渲染进弹窗卡片容器，返回清理函数；unmount() 可选
export function registerModalHost(name, mount, unmount) {
  hosts[name] = { mount, unmount };
}

function load(entry) {
  if (hosts[entry.name]) { entry.isHost = true; return; }
  const loader = registry[entry.name] || (() => import('./modals/' + entry.name + '.js'));
  entry.loading = true;
  loader().then((mod) => {
    entry.Component = (mod && mod.default) || mod || { template: '<div class="cm-loading">空组件</div>' };
  }).catch(() => {
    entry.Component = { template: '<div class="cm-loading">模块加载失败</div>' };
  }).finally(() => { entry.loading = false; });
}

// 打开弹窗：重复打开则更新 props 并置顶（不重建）
export function openModal(name, props = {}, opts = {}) {
  const idx = stack.findIndex((m) => m.name === name);
  if (idx !== -1) {
    stack[idx].props = props || {};
    stack[idx].opts = opts || {};
    const [top] = stack.splice(idx, 1);
    stack.push(top);
    return;
  }
  const entry = Vue.reactive({ name, props: props || {}, opts: opts || {}, Component: null, loading: false, isHost: false });
  stack.push(entry);
  load(entry);
}

export function closeModal(name) {
  const idx = stack.findIndex((m) => m.name === name);
  if (idx !== -1) stack.splice(idx, 1);
}

export function closeTop() {
  if (stack.length) closeModal(stack[stack.length - 1].name);
}

export function closeAll() {
  stack.splice(0);
}

// Escape 关闭最上层弹窗（幂等：与全局 Escape 调 closeXxx 不冲突）
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) closeTop();
});

// 原生宿主挂载桥：mounted 时把 mount(el) 渲染进容器，卸载时执行返回的清理函数
const HostMount = {
  name: 'HostMount',
  props: { entry: { type: Object, required: true } },
  setup(props) {
    const elRef = Vue.ref(null);
    Vue.onMounted(() => {
      const h = hosts[props.entry.name];
      if (!h || !elRef.value) return;
      try { props.entry._cleanup = h.mount(elRef.value); } catch (e) { console.warn('host mount failed:', props.entry.name, e); }
    });
    Vue.onBeforeUnmount(() => {
      const h = hosts[props.entry.name];
      if (h && h.unmount) { try { h.unmount(); } catch (e) {} }
      if (props.entry._cleanup) { try { props.entry._cleanup(); } catch (e) {} }
      props.entry._cleanup = null;
    });
    return { elRef };
  },
  template: '<div class="cm-host" ref="elRef"></div>'
};

const Root = {
  name: 'ModalManager',
  components: { HostMount },
  setup() {
    return { stack, closeModal };
  },
  template: `
  <Teleport to="body">
    <div v-for="m in stack" :key="m.name"
         class="cm-layer" :class="m.opts && m.opts.mode === 'drawer' ? 'cm-layer-drawer' : ''">
      <div class="cm-backdrop" @click="closeModal(m.name)"></div>
      <div class="cm-card" :class="m.opts && m.opts.mode === 'drawer' ? 'cm-card-drawer' : ''">
        <div v-if="m.Component" class="cm-body">
          <component :is="m.Component" v-bind="m.props" @close="closeModal(m.name)" />
        </div>
        <div v-else-if="m.isHost" class="cm-body cm-body-host">
          <HostMount :entry="m" />
        </div>
        <div v-else class="cm-loading">加载中…</div>
      </div>
    </div>
  </Teleport>`
};

// 挂载到 #chat-modals（chat.html body 级，懒加载：首次打开弹窗时才载入本模块）
const mountEl = document.getElementById('chat-modals');
if (mountEl) Vue.createApp(Root).mount(mountEl);
