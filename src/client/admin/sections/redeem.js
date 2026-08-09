// v1.52 管理后台 Vue3 迁移 - 兑换码管理（superOnly）
import * as Vue from '/static/admin/vendor/vue.js';
import { toast } from '/static/admin/store.js';

function fmtTime(ts) {
  if (!ts) return '-';
  try { return new Date(ts).toLocaleString(); } catch (e) { return '-'; }
}

export default {
  name: 'RedeemSection',
  setup() {
    const rows = Vue.ref([]);
    const loading = Vue.ref(false);
    const err = Vue.ref(false);
    const statsText = Vue.ref('');
    // 批量生成
    const gen = Vue.reactive({ points: '', count: '', prefix: '' });
    // 自定义添加
    const custom = Vue.reactive({ code: '', points: '' });
    const genStatus = Vue.ref('');
    const addStatus = Vue.ref('');

    async function load() {
      loading.value = true; err.value = false;
      try {
        const r = await fetch('/api/admin/redeem/list');
        const data = await r.json();
        const entries = Object.entries(data || {});
        entries.sort((a, b) => {
          const aUsed = a[1].usedBy ? 1 : 0, bUsed = b[1].usedBy ? 1 : 0;
          if (aUsed !== bUsed) return aUsed - bUsed;
          return (b[1].createdAt || 0) - (a[1].createdAt || 0);
        });
        rows.value = entries.map(([code, info]) => ({
          code, points: info.points || 0, usedBy: info.usedBy || '', usedAt: info.usedAt || 0,
          createdBy: info.createdBy || '-', createdAt: info.createdAt || 0
        }));
        const used = rows.value.filter(r => r.usedBy).length;
        statsText.value = '共 ' + rows.value.length + ' 个兑换码，已使用 ' + used + ' 个';
      } catch (e) { err.value = true; }
      loading.value = false;
    }

    async function generate() {
      const points = gen.points;
      const count = parseInt(gen.count);
      if (!points || parseInt(points) <= 0) { toast('请输入有效积分', 'warn'); return; }
      if (!count || count <= 0) { toast('请输入有效数量', 'warn'); return; }
      if (count > 100) { toast('单次最多生成100个', 'warn'); return; }
      genStatus.value = '生成中...';
      try {
        const r = await fetch('/api/admin/redeem/generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: String(points), count, prefix: gen.prefix.trim().toUpperCase(), createdBy: 'admin' })
        });
        const data = await r.json();
        if (data.ok && data.codes) {
          genStatus.value = '✓ 已生成 ' + data.count + ' 个兑换码';
          toast('已生成 ' + data.count + ' 个兑换码:\n' + data.codes.join('\n'));
          await load();
        } else {
          toast('生成失败: ' + (data.error || '未知错误'), 'err');
          genStatus.value = '';
        }
      } catch (e) { toast('生成失败: ' + e.message, 'err'); genStatus.value = ''; }
    }

    async function addCustom() {
      const code = custom.code.trim().toUpperCase();
      const points = custom.points;
      if (!code) { toast('请输入兑换码', 'warn'); return; }
      if (!points || parseInt(points) <= 0) { toast('请输入有效积分', 'warn'); return; }
      if (code.length < 4) { toast('兑换码至少4位字符', 'warn'); return; }
      addStatus.value = '添加中...';
      try {
        const r = await fetch('/api/admin/redeem/add', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, points: String(points), createdBy: 'admin' })
        });
        const data = await r.json();
        if (data.ok) {
          custom.code = ''; custom.points = '';
          addStatus.value = '✓ 已添加';
          toast('已添加兑换码 ' + code);
          await load();
        } else {
          toast('添加失败: ' + (data.error || '未知错误'), 'err');
          addStatus.value = '';
        }
      } catch (e) { toast('添加失败: ' + e.message, 'err'); addStatus.value = ''; }
    }

    async function del(code) {
      if (!confirm('确定删除兑换码 ' + code + ' ？')) return;
      try {
        const r = await fetch('/api/admin/redeem/delete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        const data = await r.json();
        if (data.ok) await load();
        else toast('删除失败: ' + (data.error || '未知错误'), 'err');
      } catch (e) { toast('删除失败', 'err'); }
    }

    Vue.onMounted(load);
    return { rows, loading, err, statsText, gen, custom, genStatus, addStatus, generate, addCustom, del, fmtTime };
  },
  template: `
  <div class="av-page">
    <h1>🎟️ 兑换码管理</h1>
    <p class="av-sub">批量生成 / 自定义添加兑换码，用户凭码兑换积分</p>
    <div class="av-card" style="padding:14px 16px;margin-bottom:12px">
      <div class="av-toolbar" style="flex-wrap:wrap;gap:8px">
        <span style="color:var(--text-2);font-size:13px;font-weight:600">批量生成</span>
        <input v-model="gen.points" class="av-input" type="number" placeholder="积分" style="width:80px" />
        <input v-model="gen.count" class="av-input" type="number" placeholder="数量" style="width:70px" />
        <input v-model="gen.prefix" class="av-input" placeholder="前缀(可选)" maxlength="8" style="width:90px" />
        <button class="av-btn primary sm" @click="generate">生成</button>
        <span style="color:var(--text-3);font-size:12px">{{ genStatus }}</span>
        <span style="flex:1"></span>
        <span style="color:var(--text-2);font-size:13px">{{ statsText }}</span>
      </div>
    </div>
    <div class="av-card" style="padding:14px 16px;margin-bottom:16px">
      <div class="av-toolbar">
        <span style="color:var(--text-2);font-size:13px;font-weight:600">自定义</span>
        <input v-model="custom.code" class="av-input" placeholder="兑换码(≥4位)" style="width:160px" />
        <input v-model="custom.points" class="av-input" type="number" placeholder="积分" style="width:80px" />
        <button class="av-btn sm" @click="addCustom">添加</button>
        <span style="color:var(--text-3);font-size:12px">{{ addStatus }}</span>
      </div>
    </div>
    <div v-if="loading" class="av-loading"><span class="spinner"></span>加载中...</div>
    <div v-else-if="err" class="av-empty">加载失败</div>
    <div v-else-if="rows.length === 0" class="av-empty">暂无兑换码</div>
    <div v-else class="av-table-wrap">
      <table class="av-table">
        <thead><tr><th>兑换码</th><th>积分</th><th>状态</th><th>创建人</th><th>创建时间</th><th>使用人</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.code">
            <td class="mono" style="font-weight:700;color:var(--accent)">{{ row.code }}</td>
            <td class="mono" style="color:var(--orange);font-weight:700">{{ Number(row.points).toLocaleString() }}</td>
            <td><span class="av-badge" :style="{ background: row.usedBy ? 'rgba(255,255,255,.08)' : 'rgba(74,222,128,.15)', color: row.usedBy ? 'var(--text-3)' : 'var(--green)' }">{{ row.usedBy ? '已使用' : '未使用' }}</span></td>
            <td style="color:var(--text-2)">{{ row.createdBy }}</td>
            <td style="color:var(--text-3);font-size:12px">{{ fmtTime(row.createdAt) }}</td>
            <td style="color:var(--text-2)">{{ row.usedBy || '-' }}<template v-if="row.usedBy"><br><span style="font-size:11px;color:var(--text-3)">{{ fmtTime(row.usedAt) }}</span></template></td>
            <td><button v-if="!row.usedBy" class="av-btn danger sm" @click="del(row.code)">删除</button><span v-else style="color:var(--text-3)">-</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>`
};
