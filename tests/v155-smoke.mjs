// v1.55 线上冒烟（可丢弃临时文件）：静态模块 + 多会话端到端 + reset-password 鉴权
// C 段用 hacknet 测试账号（只 login/list/revoke，不改密码，避免破坏 hacknet 对局 token）
// D 段用遗留临时账号 v155_309026（密码未知，但 super reset 不需要旧密码）
import fs from 'fs';

const BASE = 'https://chat.liuxiyu.cn';
let pass = 0, fail = 0;
const ok = (c, n, e = '') => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + n + (e ? ' :: ' + e : '')); };
async function get(u, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(BASE + u); return { status: r.status, text: await r.text() }; }
    catch (e) { if (i === tries - 1) throw e; await new Promise(r => setTimeout(r, 3000)); }
  }
}
async function post(u, body) {
  const r = await fetch(BASE + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch (e) { j = { raw: t }; }
  return { status: r.status, json: j, text: t };
}
const toml = fs.readFileSync('wrangler.toml', 'utf8');
const keyOf = k => { const m = toml.match(new RegExp(k + ' *= *"[^"]*"')); return m ? m[0].replace(/^[^"]*"|"$/g, '') : ''; };
const ADMIN_KEY = keyOf('ADMIN_KEY');
const ADMIN_SECRET_KEY = keyOf('ADMIN_SECRET_KEY');

console.log('== A. 静态模块 ==');
for (const p of ['/static/chat/modals/sessions.js', '/static/chat/modals/settings.js', '/static/chat/modal-manager.js', '/static/admin/users.js']) {
  const r = await get(p);
  ok(r.status === 200, 'GET ' + p + ' 200', '实际 ' + r.status + (r.status === 200 ? ' len=' + r.text.length : ''));
}

console.log('== C. 多会话（hacknet 账号 hntest_1785912234） ==');
const nameC = 'hntest_1785912234', pwdC = 'test123456';
const l1 = await post('/api/login', { name: nameC, password: pwdC, device: '冒烟设备A' });
ok(l1.json.ok === true, '登录 设备A', 'status ' + l1.status + ' ' + JSON.stringify(l1.json).slice(0, 60));
const tok1 = l1.json.token;
const l2 = await post('/api/login', { name: nameC, password: pwdC, device: '冒烟设备B' });
ok(l2.json.ok === true, '登录 设备B', 'status ' + l2.status);
const tok2 = l2.json.token;

const ls = await post('/api/user-sessions', { name: nameC, token: tok2, action: 'list' });
ok(ls.json.ok === true && Array.isArray(ls.json.sessions), 'sessions list ok', 'status ' + ls.status);
ok(ls.json.sessions.length >= 2, '会话数≥2（A+B），实际 ' + ls.json.sessions.length, JSON.stringify(ls.json).slice(0, 100));
ok(ls.json.sessions.filter(s => s.current).length === 1, '恰好 1 个当前会话');
const mine = ls.json.sessions.filter(s => [tok1, tok2].some(t => s.tokenPreview.startsWith(t.slice(0, 8))));
ok(mine.length === 2 && mine.every(s => s.device && s.ip), '本次新增会话带 device+ip 字段', '新增 ' + mine.length + ' 个 ' + JSON.stringify(mine).slice(0, 80));

const pre1 = await post('/api/user-sessions', { name: nameC, token: tok1, action: 'list' });
ok(pre1.status === 200 && pre1.json.ok === true, '多会话下各 token 独立可用（tok1 也能 list）', 'status ' + pre1.status);

// revoke tok1 会话（按 tokenPreview 精确匹配，不受历史遗留会话影响）
const target = ls.json.sessions.find(s => s.tokenPreview.startsWith(tok1.slice(0, 8)));
ok(!!target && !target.current, '找到 tok1 会话且非 current', target ? 'idx=' + target.idx + ' preview=' + target.tokenPreview : '未找到');
const rv = await post('/api/user-sessions', { name: nameC, token: tok2, action: 'revoke', revokeIdx: target.idx });
ok(rv.json.ok === true, 'revoke tok1 会话 ok', 'status ' + rv.status);
const ls2 = await post('/api/user-sessions', { name: nameC, token: tok2, action: 'list' });
ok(ls2.json.sessions.length === ls.json.sessions.length - 1, '会话数 -1（' + ls.json.sessions.length + '→' + ls2.json.sessions.length + '）');
ok(!ls2.json.sessions.some(s => s.tokenPreview.startsWith(tok1.slice(0, 8))), 'list 中不再含 tok1 会话');

const curIdx = ls2.json.sessions.find(s => s.current).idx;
const bad = await post('/api/user-sessions', { name: nameC, token: tok2, action: 'revoke', revokeIdx: curIdx });
ok(bad.status === 400, 'revoke 当前会话被拒 400', 'status ' + bad.status + ' ' + JSON.stringify(bad.json).slice(0, 60));

const chk1 = await post('/api/user-sessions', { name: nameC, token: tok1, action: 'list' });
ok(chk1.status === 403, '被 revoke 的会话 token 立即失效 (403)', 'status ' + chk1.status);
const chk2 = await post('/api/user-sessions', { name: nameC, token: tok2, action: 'list' });
ok(chk2.status === 200 && chk2.json.ok === true, '未 revoke 的 tok2 仍可用 (200)', 'status ' + chk2.status);

console.log('== D. 管理员重置密码（super-only） ==');
const noKey = await post('/api/admin/reset-password', { name: 'v155_309026', newPassword: 'x123456' });
ok(noKey.status === 401, 'reset-password 无key → 401', 'status ' + noKey.status);
const adminR = await fetch(BASE + '/api/admin/reset-password?key=' + encodeURIComponent(ADMIN_KEY), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'v155_309026', newPassword: 'x123456' }) });
ok(adminR.status === 403, 'reset-password 普通admin → 403', 'status ' + adminR.status);
// super：对遗留临时账号 v155_309026 改密为 x123456（无需旧密码）→ 全链路验证
const nameD = 'v155_309026', newPwd = 'x123456';
const sup = await fetch(BASE + '/api/admin/reset-password?key=' + encodeURIComponent(ADMIN_SECRET_KEY) + '&name=' + encodeURIComponent(nameD), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nameD, newPassword: newPwd }) });
ok(sup.status === 200, 'reset-password super → 200', 'status ' + sup.status + ' ' + (await sup.text()).slice(0, 60));
const nl = await post('/api/login', { name: nameD, password: newPwd, device: '重置后登录' });
ok(nl.json.ok === true, '重置后的新密码可登录', 'status ' + nl.status);
const nlTok = nl.json.token;
const lsD = await post('/api/user-sessions', { name: nameD, token: nlTok, action: 'list' });
ok(lsD.json.ok === true && lsD.json.sessions.length === 1, '重置后旧会话全清、新登录仅 1 会话', '实际 ' + (lsD.json.sessions || []).length);
// 旧密码（重置前未知，但 v155_309026 曾用 smoke<ts>x 注册——密码已变，用旧密码应失败）
const oldPwdLogin = await post('/api/login', { name: nameD, password: 'xwrongpass', device: '旧密码尝试' });
ok(oldPwdLogin.json.ok !== true, '错误旧密码被拒', 'status ' + oldPwdLogin.status);

console.log('\n==== ' + pass + ' 通过 / ' + fail + ' 失败 ====');
if (fail) process.exit(1);
