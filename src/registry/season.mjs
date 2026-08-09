// 🏆 v1.45 赛季系统 — 服务端权威状态机（registry 层）
// 数据模型（挂在 reg 上，由主 agent 接线持久化）：
//   seasonState    单对象 { id, name, status, startAt, endAt, settled, settledAt, createdAt, goals:[{type,target,honor,label}] }
//                   status ∈ upcoming|active|ended，type ∈ msg|checkin|game|points|achievement
//   seasonProgress { baselines:[[name,{msg,checkin,game,achieve}]], points:[[name,"积分字符串"]] }  基线快照 + 赛季内差值
//   honorCoins     Map<name, string>（BigInt 字符串，同 userPoints）
// 计时：active 赛季结束时由 registry DO alarm 驱动 season_settle 事件（复用 hnTimers 事件表）
// 进度统计（无热路径钩子，查询/结算时按基线差值计算）：
//   msg/checkin/game/achievement = user.stats 计数器 / achievements.length − 基线快照
//   points = 赛季期间正向白名单入账累加（addLedger 钩子写入 seasonProgress.points，见 registry.mjs addLedger）

import { tokenValid } from "../utils.mjs";

const GOAL_TYPES = ["msg", "checkin", "game", "points", "achievement"];

const json = (obj, status) => new Response(JSON.stringify(obj), {
  status: status || 200, headers: { "Content-Type": "application/json" }
});

// 🔒 安全 BigInt 解析（同 shop.mjs toBigInt，防大数/科学计数法精度丢失 + 指数 DoS）
function toBigInt(val) {
  if (val == null) return 0n;
  try {
    let s = String(val).trim().toLowerCase();
    if (s.includes('e')) {
      let [base, exp] = s.split('e');
      let e = parseInt(exp, 10);
      if (e < 0) return 0n;
      if (e > 100000) return 0n; // 防 DoS：指数过大直接拒绝
      let dot = base.indexOf('.');
      if (dot === -1) s = base + '0'.repeat(e);
      else {
        let digits = base.replace('.', '');
        let fracLen = base.length - 1 - dot;
        let zeros = e - fracLen;
        s = digits + (zeros > 0 ? '0'.repeat(zeros) : '');
      }
    }
    return BigInt(s);
  } catch { return 0n; }
}

// 赛季开始时对全部注册用户逐人快照行为计数器（基线），points 数组置空并持久化
async function captureBaselines(reg) {
  const baselines = [];
  for (const [name, user] of reg.registeredUsers) {
    const stats = (user && user.stats) || { msgCount: 0, checkinCount: 0, gameWins: 0, shopCount: 0 };
    baselines.push([name, {
      msg: stats.msgCount || 0,
      checkin: stats.checkinCount || 0,
      game: stats.gameWins || 0,
      achieve: user && Array.isArray(user.achievements) ? user.achievements.length : 0
    }]);
  }
  reg.seasonProgress = { baselines, points: [] };
  await reg.saveSeasonProgress();
}

// 计算某用户单个目标的当前进度（基线快照 + 差值）：
//   points → seasonProgress.points 该 name 的 BigInt 字符串；其余 → 计数器 − 基线（clamp ≥0）
function computeSeasonProgress(reg, name, user, goal) {
  const sp = reg.seasonProgress || { baselines: [], points: [] };
  const bm = new Map(sp.baselines || []);
  const b = bm.get(name) || { msg: 0, checkin: 0, game: 0, achieve: 0 };
  if (goal.type === "points") {
    const pm = new Map(sp.points || []);
    return String(pm.get(name) || "0");
  }
  const stats = (user && user.stats) || { msgCount: 0, checkinCount: 0, gameWins: 0, shopCount: 0 };
  const achieved = user && Array.isArray(user.achievements) ? user.achievements.length : 0;
  let current = 0;
  if (goal.type === "msg") current = (stats.msgCount || 0) - (b.msg || 0);
  else if (goal.type === "checkin") current = (stats.checkinCount || 0) - (b.checkin || 0);
  else if (goal.type === "game") current = (stats.gameWins || 0) - (b.game || 0);
  else if (goal.type === "achievement") current = achieved - (b.achieve || 0);
  return Math.max(0, current);
}

// 赛季结算（幂等）：仅 active 且未 settled 才执行；
// 遍历 registeredUsers，逐目标 progress>=target → goal.honor 计入 honorCoins（BigInt 字符串加）+ 逐目标荣誉流水
async function settleSeason(reg) {
  const s = reg.seasonState;
  if (!s || s.status !== "active" || s.settled) return false;
  for (const [name, user] of reg.registeredUsers) {
    for (const g of (s.goals || [])) {
      const cur = toBigInt(computeSeasonProgress(reg, name, user, g));
      const target = toBigInt(g.target);
      const honor = toBigInt(g.honor);
      if (target > 0n && cur >= target && honor > 0n) {
        reg.honorCoins.set(name, String(toBigInt(reg.honorCoins.get(name)) + honor));
        await reg.addHonorLedger(name, "+" + String(g.honor), "season_reward", "赛季奖励:" + (g.label || ""));
      }
    }
  }
  await reg.saveHonorCoins();
  s.settled = true;
  s.settledAt = Date.now();
  s.status = "ended";
  await reg.saveSeasonState();
  // 结算完成后清空进度快照（置空数组对象并持久化）
  reg.seasonProgress = { baselines: [], points: [] };
  await reg.saveSeasonProgress();
  return true;
}

// alarm 事件处理（registry.alarm() due 循环调用）：到点结算赛季，返回结算结果
export async function processSeasonTimer(reg, evt) {
  if (evt && evt.type === "season_settle") return await settleSeason(reg);
  return null;
}

export async function handleSeason(reg, request, url) {
  switch (url.pathname) {
    case "/season/status": {
      // 公开只读：赛季状态 + 目标列表
      const s = reg.seasonState;
      if (!s) return json({ status: "none" });
      return json({
        id: s.id, name: s.name, status: s.status,
        startAt: s.startAt, endAt: s.endAt,
        goals: s.goals || [],
        serverNow: Date.now()
      });
    }

    case "/season/progress": {
      // 需 token 鉴权：返回当前赛季 goals + 各目标进度 {type,target,current,honor,reached}
      const name = url.searchParams.get("name");
      const token = url.searchParams.get("token") || "";
      if (!name) return json({ error: "请提供用户名" }, { status: 400 });
      const user = reg.registeredUsers.get(name);
      if (!tokenValid(user, token)) return json({ error: "身份验证失败" }, { status: 403 });
      const s = reg.seasonState;
      if (!s) return json({ status: "none", goals: [] });
      const goals = [];
      for (const g of (s.goals || [])) {
        const current = computeSeasonProgress(reg, name, user, g);
        goals.push({
          type: g.type, target: g.target,
          current: current, honor: g.honor,
          reached: toBigInt(current) >= toBigInt(g.target)
        });
      }
      return json({
        id: s.id, name: s.name, status: s.status,
        startAt: s.startAt, endAt: s.endAt,
        goals, serverNow: Date.now()
      });
    }

    // ---------- 管理端点（registry adminExactPaths 统一鉴权） ----------
    case "/admin/season/config": {
      return json(reg.seasonState);
    }

    case "/admin/season/create": {
      if (request.method !== "POST") return json({ error: "请使用POST" }, { status: 405 });
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: "请求体不是合法JSON" }, { status: 400 }); }
      const name = String(body.name || "").trim().slice(0, 30);
      const startAt = Number(body.startAt);
      const endAt = Number(body.endAt);
      const goals = body.goals;
      if (!name) return json({ error: "请提供赛季名称" }, { status: 400 });
      if (!isFinite(startAt) || !isFinite(endAt) || !(endAt > startAt) || !(startAt > Date.now())) {
        return json({ error: "时间无效：需 开始>当前 且 结束>开始" }, { status: 400 });
      }
      if (!Array.isArray(goals) || goals.length === 0) return json({ error: "请提供目标列表" }, { status: 400 });
      if (goals.length > 20) return json({ error: "目标最多 20 个" }, { status: 400 });
      const cleanGoals = [];
      for (const g of goals) {
        if (!g || !GOAL_TYPES.includes(g.type)) return json({ error: "目标类型无效" }, { status: 400 });
        if (!/^[1-9]\d*$/.test(String(g.target || ""))) return json({ error: "目标值必须是正整数" }, { status: 400 });
        if (!/^[1-9]\d*$/.test(String(g.honor || ""))) return json({ error: "荣誉奖励必须是正整数" }, { status: 400 });
        if (String(g.label || "").length > 30) return json({ error: "目标描述不能超过 30 字" }, { status: 400 });
        cleanGoals.push({ type: g.type, target: parseInt(g.target, 10), honor: parseInt(g.honor, 10), label: String(g.label || "") });
      }
      // 同时仅允许一个未结束赛季
      const cur = reg.seasonState;
      if (cur && cur.status !== "ended") return json({ error: "已有未结束赛季，请先结算" }, { status: 409 });
      reg.seasonState = {
        id: "s" + Date.now(), name, status: "upcoming",
        startAt, endAt, settled: false, settledAt: null, createdAt: Date.now(),
        goals: cleanGoals
      };
      await reg.saveSeasonState();
      return json({ ok: true, id: reg.seasonState.id });
    }

    case "/admin/season/start": {
      if (request.method !== "POST") return json({ error: "请使用POST" }, { status: 405 });
      const s = reg.seasonState;
      if (!s) return json({ error: "暂无赛季" }, { status: 404 });
      if (s.status !== "upcoming") return json({ error: "赛季状态不正确，仅 upcoming 可开始" }, { status: 400 });
      s.status = "active";
      await captureBaselines(reg); // 内部已 saveSeasonProgress
      reg.hnAddTimer({ at: reg.seasonState.endAt, type: "season_settle", payload: {} });
      await reg.saveSeasonState();
      return json({ ok: true, id: s.id, endAt: s.endAt });
    }

    case "/admin/season/end": {
      if (request.method !== "POST") return json({ error: "请使用POST" }, { status: 405 });
      const settled = await settleSeason(reg); // 幂等兜底
      return json({ ok: true, settled });
    }

    default:
      return null;
  }
}
