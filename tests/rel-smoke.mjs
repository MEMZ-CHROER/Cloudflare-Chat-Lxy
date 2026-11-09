// v1.48 关系链线上冒烟脚本（Node24 原生 WebSocket + fetch，直连 chat.liuxiyu.cn）
// 用法：node rel-smoke.mjs
// 2 账号（v1.43 hacknet 遗留测试账号，均保留）：A=hntest_1785912234  B=hntest533931  （密码 test123456）
// 开头/结尾清理双方关系，可重复跑。覆盖：关注/好友 accept+reject/拉黑过滤 whisper+@/block 自动 unfriend/解除/边界 400·403·404
const BASE = "https://chat.liuxiyu.cn";
const ROOM = "rel_smoke_room";
const A = "hntest_1785912234", AP = "test123456";
const B = "hntest533931", BP = "test123456";

async function j(path, opts = {}) {
  const r = await fetch(BASE + path, { headers: { "Content-Type": "application/json", "User-Agent": "CloudChat-Lxy" }, ...opts });
  const t = await r.text();
  let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: r.status, d };
}
let fails = 0;
function check(cond, label, extra) { console.log((cond ? "✅ " : "❌ ") + label + (extra !== undefined ? "  " + JSON.stringify(extra) : "")); if (!cond) fails++; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const relPost = (action, name, token, target, extra = {}) => j("/api/rel/" + action, { method: "POST", body: JSON.stringify({ name, token, target, ...extra }) });
const relGet = (action, name, token, qs = "") => j(`/api/rel/${action}?name=${encodeURIComponent(name)}&token=${encodeURIComponent(token)}${qs}`);

// WS helper：连房间并发 name/token 认证，等 session 建立（前端实际路径 /api/room/<room>/websocket）
function wsOpen(name, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://chat.liuxiyu.cn/api/room/${ROOM}/websocket`);
    ws.addEventListener("open", () => ws.send(JSON.stringify({ name, token })));
    ws.addEventListener("error", () => reject(new Error("ws error")));
    setTimeout(() => resolve(ws), 1000);
  });
}

async function main() {
  console.log("=== Phase 0: 登录 + 清理残留关系 ===");
  const la = await j("/api/login", { method: "POST", body: JSON.stringify({ name: A, password: AP }) });
  const lb = await j("/api/login", { method: "POST", body: JSON.stringify({ name: B, password: BP }) });
  let ta = la.d && la.d.token, tb = lb.d && lb.d.token;
  check(!!ta && !!tb, "0. 双 token", { a: !!ta, b: !!tb });
  // 幂等清理上次残留：unblock/unfriend/unfollow 双向（不存在也返回 ok，幂等）
  for (const [n, t, o] of [[A, ta, B], [B, tb, A]]) {
    await relPost("unblock", n, t, o).catch(() => {});
    await relPost("unfriend", n, t, o).catch(() => {});
    await relPost("unfollow", n, t, o).catch(() => {});
  }

  console.log("\n=== Phase 1: HTTP 关系链核心 ===");
  // 1. A 关注 B
  let r = await relPost("follow", A, ta, B);
  check(r.d && r.d.ok === true, "1. A 关注 B", r.d);
  r = await relGet("lists", A, ta, "&tab=following");
  check(Array.isArray(r.d.names) && r.d.names.includes(B), "1. A 关注列表含 B", r.d.names);
  r = await relGet("lists", B, tb, "&tab=followers");
  check(Array.isArray(r.d.names) && r.d.names.includes(A), "1. B 粉丝列表含 A", r.d.names);
  r = await relGet("status", A, ta, "&target=" + encodeURIComponent(B));
  check(r.d.status.following === true && r.d.status.followedBy === false, "1. A→B following=true / followedBy=false（B 未关注 A）", r.d.status);

  // 2. A 申请 B → B reject → 清理 → A 可重新申请（验证 reject 双清）
  r = await relPost("request", A, ta, B);
  check(r.d && r.d.ok === true, "2. A 申请 B", r.d);
  r = await relGet("lists", B, tb, "&tab=requests");
  check(Array.isArray(r.d.names) && r.d.names.includes(A), "2. B 好友申请含 A", r.d.names);
  r = await relGet("status", A, ta, "&target=" + encodeURIComponent(B));
  check(r.d.status.pendingOut === true, "2. A pendingOut", r.d.status);
  r = await relPost("respond", B, tb, A, { action: "reject" });
  check(r.d && r.d.ok === true && r.d.friends === false, "2. B reject A", r.d);
  r = await relGet("status", A, ta, "&target=" + encodeURIComponent(B));
  check(r.d.status.pendingOut === false, "2. reject 后 A pendingOut 已清", r.d.status);
  r = await relGet("lists", B, tb, "&tab=requests");
  check(Array.isArray(r.d.names) && !r.d.names.includes(A), "2. B requests 不再含 A", r.d.names);
  r = await relPost("request", A, ta, B);
  check(r.d && r.d.ok === true, "2. A 重新申请 B 成功（reject 已清 pending）", r.d);

  // 3. B accept A → 双方 friends；重复申请 400
  r = await relPost("respond", B, tb, A, { action: "accept" });
  check(r.d && r.d.ok === true && r.d.friends === true, "3. B accept A", r.d);
  r = await relGet("lists", A, ta, "&tab=friends");
  check(Array.isArray(r.d.names) && r.d.names.includes(B), "3. A 好友含 B", r.d.names);
  r = await relGet("lists", B, tb, "&tab=friends");
  check(Array.isArray(r.d.names) && r.d.names.includes(A), "3. B 好友含 A", r.d.names);
  r = await relPost("request", A, ta, B);
  check(r.d && r.d.error === "你们已经是好友", "3. 已好友再申请 400", r.d);

  // 4. B 拉黑 A（A 是 B 好友）→ 自动 unfriend；A 关注 B 保留（不删对方关注我）
  r = await relPost("block", B, tb, A);
  check(r.d && r.d.ok === true && r.d.blocked === true, "4. B 拉黑 A", r.d);
  r = await relGet("lists", B, tb, "&tab=friends");
  check(Array.isArray(r.d.names) && !r.d.names.includes(A), "4. B 好友不再含 A", r.d.names);
  r = await relGet("lists", A, ta, "&tab=friends");
  check(Array.isArray(r.d.names) && !r.d.names.includes(B), "4. A 好友不再含 B", r.d.names);
  r = await relGet("lists", B, tb, "&tab=blocked");
  check(Array.isArray(r.d.names) && r.d.names.includes(A), "4. B 拉黑列表含 A", r.d.names);
  r = await relGet("status", A, ta, "&target=" + encodeURIComponent(B));
  check(r.d.status.following === true && r.d.status.blockedBy === true, "4. A 关注保留 + blockedBy", r.d.status);
  r = await relPost("request", A, ta, B);
  check(r.d && r.d.error === "对方已拉黑你，无法发送申请", "4. 被拉黑后申请 400", r.d);

  // 5. 边界：自关注 400 / 不存在 404（用真 token，不 invalidate）
  r = await relPost("follow", A, ta, A);
  check(r.status === 400 && r.d.error === "不能对自己操作", "5a. 自关注 400", r.d);
  r = await relPost("follow", A, ta, "no_such_user_xyz");
  check(r.status === 404 && r.d.error === "用户不存在", "5b. 关注不存在 404", r.d);

  // 6. B unblock A → A 重新申请 → accept → 复联
  r = await relPost("unblock", B, tb, A);
  check(r.d && r.d.ok === true && r.d.blocked === false, "6. B 解除拉黑 A", r.d);
  r = await relGet("lists", B, tb, "&tab=blocked");
  check(Array.isArray(r.d.names) && !r.d.names.includes(A), "6. B blocked 不再含 A", r.d.names);
  r = await relPost("request", A, ta, B);
  check(r.d && r.d.ok === true, "6. A 重新申请 B（解除后可申请）", r.d);
  r = await relPost("respond", B, tb, A, { action: "accept" });
  check(r.d && r.d.ok === true && r.d.friends === true, "6. B 再 accept → 好友复联", r.d);

  // 7. 错 token 403（放最后：会触发 user-check-auth 清空该用户真实 token，后续用新 login）
  r = await relPost("follow", A, "bad_token", B);
  check(r.status === 403 && r.d.error && r.d.error.includes("请先登录"), "7. 错 token 403", r.d);

  console.log("\n=== Phase 2: WS 拉黑过滤（刷新 token 后重新拉黑 A） ===");
  const la2 = await j("/api/login", { method: "POST", body: JSON.stringify({ name: A, password: AP }) });
  const lb2 = await j("/api/login", { method: "POST", body: JSON.stringify({ name: B, password: BP }) });
  ta = la2.d && la2.d.token; tb = lb2.d && lb2.d.token;
  check(!!ta && !!tb, "P2. 刷新双 token");
  r = await relPost("block", B, tb, A);
  check(r.d && r.d.ok === true, "P2. B 重新拉黑 A", r.d);

  const wsB = await wsOpen(B, tb);
  const wsA = await wsOpen(A, ta);
  await sleep(400);
  const gotB = [], gotA = [];
  wsB.addEventListener("message", ev => { try { gotB.push(JSON.parse(ev.data)); } catch (_) {} });
  wsA.addEventListener("message", ev => { try { gotA.push(JSON.parse(ev.data)); } catch (_) {} });

  // P2-1: A whisper B → A 收拦截 error，B 无 whisper
  wsA.send(JSON.stringify({ type: "whisper", target: B, message: "hello from a" }));
  await sleep(1400);
  let aErr = gotA.find(x => x.error && x.error.includes("对方已拉黑你"));
  let bWhisper = gotB.find(x => x.type === "whisper" && x.from === A);
  check(!!aErr, "P2-1. A 私信 B 被拦截（收到拉黑提示）", aErr);
  check(!bWhisper, "P2-1. B 未收到 A 的私信", bWhisper || null);

  // P2-2: A 公共消息 @B → B 收到公共消息但无 at-mention 红点（B 拉黑 A，@ 不打扰 B）
  const msgBody = "rel test @" + B + " 公共消息互通";
  wsA.send(JSON.stringify({ message: msgBody }));
  await sleep(1400);
  let bPub = gotB.find(x => x.message === msgBody);
  let bAt = gotB.find(x => x.type === "at-mention" && x.from === A);
  check(!!bPub, "P2-2. B 收到 A 公共消息（拉黑不影响公共消息）", !!bPub);
  check(!bAt, "P2-2. B 未收到 A 的 @ 红点（被拉黑者 @ 不打扰）", bAt || null);

  // P2-3: A 无 @ 公共消息 → B 收到；B 发公共 → A 收到（反向互通）
  const msg2 = "rel plain message from a";
  wsA.send(JSON.stringify({ message: msg2 }));
  await sleep(1200);
  check(!!gotB.find(x => x.message === msg2), "P2-3. B 收到 A 无@公共消息");
  const msg3 = "rel reply from b";
  wsB.send(JSON.stringify({ message: msg3 }));
  await sleep(1200);
  check(!!gotA.find(x => x.message === msg3), "P2-3. A 收到 B 公共消息（反向互通）");

  wsA.close(); wsB.close();

  console.log("\n=== Phase 3: 清理关系（保留账号） ===");
  // 解除双方所有关系，恢复原状（账号保留，供后续测试复用）
  for (const [n, t, o] of [[A, ta, B], [B, tb, A]]) {
    await relPost("unblock", n, t, o).catch(() => {});
    await relPost("unfriend", n, t, o).catch(() => {});
    await relPost("unfollow", n, t, o).catch(() => {});
  }
  r = await relGet("lists", A, ta, "&tab=following");
  check(Array.isArray(r.d.names) && r.d.names.length === 0, "3. A 关注清空", r.d.names);
  r = await relGet("lists", B, tb, "&tab=blocked");
  check(Array.isArray(r.d.names) && r.d.names.length === 0, "3. B 拉黑清空", r.d.names);

  console.log(fails === 0 ? "\n🎉 全部通过" : `\n⚠️ ${fails} 项失败`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
