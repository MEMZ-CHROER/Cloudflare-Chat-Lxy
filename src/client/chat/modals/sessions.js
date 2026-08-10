// v1.55 多设备会话管理弹窗 — Vue3 重写（账号纵深：查看/退出其他设备会话）
// 调用链：settings 弹窗"会话管理"入口 → modal-manager openModal('sessions', {name, token})
//       → /api/auth/user-sessions（list/revoke/revoke-all）→ registry /user-sessions
// 安全：list 只返回脱敏 tokenPreview（前8位）+ idx；revoke 按索引踢，不暴露完整 token
import * as Vue from '/static/chat/vendor/vue.js';
import { injectCss } from '../modal-manager.js';

injectCss('cm-style-sessions', `
.cm-sessions { display: flex; flex-direction: column; min-width: min(420px, 88vw); max-width: 92vw; }
.cm-sessions-body { padding: 18px 20px; overflow-y: auto; }
.cm-sessions-user { font-size: 13px; color: var(--text-secondary); margin-bottom: 14px; }
.cm-sessions-user strong { color: var(--text); }
.cm-session-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 10px; background: var(--surface); }
.cm-session-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.cm-session-device { font-size: 14px; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 6px; }
.cm-session-current { font-size: 11px; color: #27ae60; background: rgba(39,174,96,.12); border: 1px solid rgba(39,174,96,.4); padding: 1px 6px; border-radius: 10px; font-weight: 600; }
.cm-session-expired { font-size: 11px; color: var(--text-secondary); background: rgba(128,128,128,.14); border: 1px solid var(--border); padding: 1px 6px; border-radius: 10px; }
.cm-session-meta { font-size: 12px; color: var(--text-secondary); }
.cm-session-preview { font-size: 11px; color: var(--text-3, var(--text-secondary)); font-family: ui-monospace, Consolas, monospace; }
.cm-session-hint { font-size: 12px; color: #27ae60; font-weight: 600; white-space: nowrap; }
.cm-sessions-revokeall { width: 100%; margin-top: 6px; padding: 10px; background: none; color: #e74c3c; border: 1px solid #e74c3c; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
.cm-sessions-revokeall:hover { background: rgba(231,76,60,.12); }
.cm-sessions-err { color: #e74c3c; font-size: 13px; padding: 12px 0; }
.cm-sessions-empty { color: var(--text-secondary); font-size: 13px; padding: 16px 0; text-align: center; }
`);

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default {
  name: 'SessionsModal',
  props: { name: { type: String, default: '' }, token: { type: String, default: '' } },
  setup(props, ctx) {
    const sessions = Vue.ref([]);
    const loading = Vue.ref(true);
    const err = Vue.ref('');

    async function call(action, extra = {}) {
      const r = await fetch('/api/user-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: props.name, token: props.token, action, ...extra })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
      return d;
    }

    async function load() {
      loading.value = true; err.value = '';
      try {
        const d = await call('list');
        sessions.value = d.sessions || [];
      } catch (e) { err.value = e.message; }
      loading.value = false;
    }

    async function revoke(s) {
      if (!confirm('确定退出该设备会话？该设备将需要重新登录。')) return;
      try {
        await call('revoke', { revokeIdx: s.idx });
        await load();
      } catch (e) { err.value = e.message; }
    }

    async function revokeAll() {
      if (!confirm('确定退出所有设备？本机也会被退出，需要重新登录。')) return;
      try {
        await call('revoke-all');
        sessions.value = [];
        // 完整登出流程（清本地凭据 + 切回登录界面）；auth.js 不可用时兜底清凭据并关闭弹窗
        try {
          const auth = await import('../auth.js');
          if (auth && typeof auth.doLogout === 'function') { auth.doLogout(); return; }
        } catch (e) {}
        localStorage.removeItem('chat_token');
        localStorage.removeItem('chat_user');
        ctx.emit('close');
      } catch (e) { err.value = e.message; }
    }

    Vue.onMounted(load);
    return { sessions, loading, err, fmtTime, revoke, revokeAll };
  },
  template: `
  <div class="cm-sessions">
    <div class="cm-header">
      <span>🔑 多设备会话</span>
      <button class="cm-close" @click="$emit('close')" title="关闭">&times;</button>
    </div>
    <div class="cm-sessions-body">
      <p class="cm-sessions-user">当前账号：<strong>{{ name }}</strong> · 共 {{ sessions.length }} 个会话</p>
      <div v-if="loading" class="cm-loading">加载中…</div>
      <div v-else-if="err" class="cm-sessions-err">⚠️ {{ err }}</div>
      <div v-else-if="sessions.length === 0" class="cm-sessions-empty">暂无会话</div>
      <template v-else>
        <div class="cm-session-item" v-for="s in sessions" :key="s.idx">
          <div class="cm-session-info">
            <span class="cm-session-device">{{ s.device || '未知设备' }}
              <span v-if="s.current" class="cm-session-current">当前</span>
              <span v-if="s.expired" class="cm-session-expired">已过期</span>
            </span>
            <span class="cm-session-meta">{{ s.ip || '未知IP' }} · 创建 {{ fmtTime(s.createdAt) }} · 活跃 {{ fmtTime(s.lastActive) }}</span>
            <span class="cm-session-preview">{{ s.tokenPreview }}</span>
          </div>
          <button v-if="!s.current" class="cm-btn-danger" @click="revoke(s)">退出</button>
          <span v-else class="cm-session-hint">本机</span>
        </div>
        <button class="cm-sessions-revokeall" @click="revokeAll">退出所有设备</button>
      </template>
    </div>
  </div>`
};
