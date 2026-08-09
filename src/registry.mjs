import { handleRooms } from "./registry/rooms.mjs";
import { handleBans } from "./registry/bans.mjs";
import { handleBlacklist } from "./registry/blacklist.mjs";
import { handleAdmin } from "./registry/adminKey.mjs";
import { handleTags } from "./registry/tags.mjs";
import { handleUsers } from "./registry/users.mjs";
import { handlePoints } from "./registry/points.mjs";
import { handleShop } from "./registry/shop.mjs";
import { handleExp } from "./registry/exp.mjs";
import { handleTasks } from "./registry/tasks.mjs";
import { handleLottery } from "./registry/lottery.mjs";
import { handleBot } from "./registry/bot.mjs";
import { levelForExp, safeEqual } from "./utils.mjs";
import { checkAchievements } from "./registry/achievements.mjs";
import { handleEmoji } from "./registry/emoji.mjs";
import { handleRedeem } from "./registry/redeem.mjs";
import { handleLog } from "./registry/log.mjs";
import { handleRedPacket } from "./registry/redpacket.mjs";
import { handleMute } from "./registry/mute.mjs";
import {
  loadAll, saveRooms, saveBanned, saveBannedIps, saveTags, saveKnownUsers,
  saveUserIps, saveGlobalBlacklist, saveAdminKey, savePoints, saveRegisteredUsers,
  saveShopItems, saveBotCommands, saveUserInventory, saveTasks, saveTaskClaims,
  saveTaskCompletions, saveLotteryPools, saveLotteryRecords, saveEmoji,
  saveRedeemCodes, saveKickProtected, saveMutes,
  saveGameDailyWin, saveRedPackets, saveCheckinByIp, saveTaskRewardPaid,
  saveHacknetGames,
  saveSeasonState, saveSeasonProgress, saveHonorCoins, saveOauthStates,
  saveMarketOrders, saveMarketConfig, saveUserRelations, saveLp
} from "./registry/persistence.mjs";
import { handleHacknet, processHnTimer } from "./registry/hacknet.mjs";
import { handleSeason, processSeasonTimer } from "./registry/season.mjs";
import { handleHonor } from "./registry/honor.mjs";
import { handleOauth } from "./registry/oauth.mjs";
import { handleMarket } from "./registry/market.mjs";
import { handleRelations } from "./registry/relations.mjs";
import { handleLp } from "./registry/lp.mjs";

// 🏆 v1.45 赛季 points 目标白名单：仅这 6 类正向入账计入赛季积分进度。
// 排除 transfer（防自刷转账）与 admin（防管理员铸币灌入赛季进度）。
const SEASON_POINT_TYPES = ["checkin", "task", "game", "lottery", "redpacket", "reward"];

// 安全 BigInt 解析（同 shop.mjs / points.mjs 局部 toBigInt，避免引入模块耦合）
function _toBigInt(val) {
  if (val == null) return 0n;
  try {
    let s = String(val).trim().toLowerCase();
    if (s.includes('e')) {
      let [base, exp] = s.split('e');
      let e = parseInt(exp, 10);
      if (e < 0) return 0n;
      if (e > 100000) return 0n;
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

// RoomRegistry Durable Object — 全局单例，跟踪所有房间、用户、商城、任务、抽奖等
export class RoomRegistry {
  constructor(state, env) {
    this.state = state;
    this.storage = state.storage;
    this.env = env;
    this.rooms = new Map();
    this.banned = new Set();
    this.bannedIps = new Set();
    this.tags = new Map();
    this.knownUsers = new Set();
    this.userIps = new Map();
    this.globalBlacklist = new Set();
    this.adminKey = env.ADMIN_KEY || null;
    this.userPoints = new Map();
    this.registeredUsers = new Map();
    this.shopItems = new Map();
    this.userInventory = new Map();
    this.tasks = new Map();
    this.taskCompletions = new Map();
    this.taskClaims = new Map();
    this.taskRewardPaid = new Map();   // name -> Set<taskId> 已完成且已发奖励（L19 防崩溃重试双发）
    this.lotteryPools = new Map();
    this.lotteryRecords = new Map();
    this.botCommands = new Map();
    this.emoji = new Map();
    this.redeemCodes = new Map();
    this.kickProtected = new Set();
    this.mutes = new Map();
    this.redPackets = new Map();
    this.checkinByIp = new Map();   // ip -> {date, count} 每 IP 每日签到计数（L13a 持久化防重启清零）
    // 游戏防刷状态（内存字段，不持久化）
    this.gameBets = new Map();       // name -> {wager, ts} 未结算下注
    this.gameLastWin = new Map();    // name -> ts 上次结算时间
    this.gameDailyWin = new Map();   // name -> {date, total} 每日净赢
    // 🎮 v1.43 Hacknet 对战小游戏（全局单例持有）
    this.hacknetGames = new Map();   // gameId -> game（持久化 storage key "hacknetGames"）
    this.hnTimers = [];              // [{at, type, gameId, payload}] 事件表（alarm 统一调度，从 game 状态可重建）
    this.hnTickets = new Map();      // room -> [{ticket, expiry}] 单次入场 ticket（内存，惰性清理）
    this.hnSessions = new Map();     // sid -> {name, expiry} 游戏会话（status 轮询轻量鉴权，省 user-check-auth）
    // 🏆 v1.45 赛季 + 荣誉闭环（持久化 storage key：seasonState / seasonProgress / honorCoins）
    this.seasonState = null;         // 赛季状态单对象（upcoming|active|ended，结算后 settled=true）
    this.seasonProgress = null;      // {baselines:[[name,{msg,checkin,game,achieve}]], points:[[name,"积分"]]}
    this.honorCoins = new Map();     // name -> 荣誉币字符串（BigInt 精度，同 userPoints）
    // 🔐 v1.46 OAuth state 生命周期（持久化 storage key "oauthStates"）：Map<state,{provider,redirectUri,preAuthName,createdAt}>
    this.oauthStates = new Map();
    // 💱 v1.47 交易市场（持久化 storage key：marketOrders / marketConfig）
    this.marketOrders = [];   // 交易市场挂单（storage key "marketOrders"）
    this.marketConfig = { feePercent: 5, enabled: true, maxOpenOrders: 20, maxPrice: "10000000" };
    this.userRelations = new Map();   // 👥 v1.48 关系链：关注/好友/拉黑（storage key "userRelations"）
    // 🧪 v1.49 LuckPerms 权限系统（storage key "lpData"）：{users, groups} 均 Map
    this.lp = {users: new Map(), groups: new Map()};
    // 🧪 v1.49 诊断：实例标识 + load 完成标记（区分冷启动/多实例，定位 LP 读不到问题）
    this._instId = (crypto && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : String(Math.random()).slice(2, 8);
    this._loaded = false;
    this._loadPromise = Promise.race([
      this.load(),
      new Promise(resolve => setTimeout(resolve, 10000))
    ]).catch(err => {
      console.error("RoomRegistry load failed:", err);
    });
  }

  async load() {
    let data = await loadAll(this.storage);
    if (data.rooms) this.rooms = data.rooms;
    if (data.banned) this.banned = data.banned;
    if (data.bannedIps) this.bannedIps = data.bannedIps;
    if (data.tags) this.tags = data.tags;
    if (data.knownUsers) this.knownUsers = data.knownUsers;
    if (data.userIps) this.userIps = data.userIps;
    if (data.globalBlacklist) this.globalBlacklist = data.globalBlacklist;
    if (data.adminKey) this.adminKey = data.adminKey;
    if (data.userPoints) this.userPoints = data.userPoints;
    if (data.registeredUsers) this.registeredUsers = data.registeredUsers;
    if (data.shopItems) this.shopItems = data.shopItems;
    if (data.userInventory) this.userInventory = data.userInventory;
    if (data.tasks) this.tasks = data.tasks;
    if (data.taskCompletions) this.taskCompletions = data.taskCompletions;
    if (data.taskClaims) this.taskClaims = data.taskClaims;
    if (data.taskRewardPaid) this.taskRewardPaid = data.taskRewardPaid;
    if (data.rateLimitExempt) this.rateLimitExempt = data.rateLimitExempt;
    if (data.lotteryPools) this.lotteryPools = data.lotteryPools;
    if (data.lotteryRecords) this.lotteryRecords = data.lotteryRecords;
    if (data.botCommands) this.botCommands = data.botCommands;
    if (data.emoji) this.emoji = data.emoji;
    if (data.redeemCodes) this.redeemCodes = data.redeemCodes;
    if (data.kickProtected) this.kickProtected = data.kickProtected;
    if (data.mutes) this.mutes = data.mutes;
    if (data.gameDailyWin) this.gameDailyWin = data.gameDailyWin;
    if (data.redPackets) this.redPackets = data.redPackets;
    if (data.checkinByIp) this.checkinByIp = data.checkinByIp;
    // 🎮 v1.43：恢复 Hacknet 局状态，并从 game 状态重建 alarm 事件表（冷启动后定时器不丢）
    if (data.hacknetGames) this.hacknetGames = data.hacknetGames;
    if (handleHacknet && this.hacknetGames.size > 0) {
      this.hnRebuildTimers();
    }

    // 🏆 v1.45：恢复赛季状态 / 进度 / 荣誉币
    if (data.seasonState) this.seasonState = data.seasonState;
    if (data.seasonProgress) this.seasonProgress = data.seasonProgress;
    if (data.honorCoins) this.honorCoins = new Map(data.honorCoins);
    // 🔐 v1.46 OAuth state 恢复
    if (data.oauthStates) this.oauthStates = new Map(data.oauthStates);
    // 💱 v1.47 交易市场恢复
    if (data.marketOrders) this.marketOrders = data.marketOrders;
    if (data.marketConfig) this.marketConfig = Object.assign({feePercent:5,enabled:true,maxOpenOrders:20,maxPrice:"10000000"}, data.marketConfig);
    // 👥 v1.48 关系链恢复（Map<name,{following,friends,pendingOut,pendingIn,blocked} 均 Set>）
    if (data.userRelations) this.userRelations = data.userRelations;
    // 🧪 v1.49 LuckPerms 权限系统恢复
    if (data.lp) this.lp = data.lp;

    // 🕶️ 内置消耗品：匿名券（consumable → 购买不写入背包，可重复购买，计数在 user.anonCoupons）
    if (!this.shopItems.has("anon_coupon")) {
      this.shopItems.set("anon_coupon", {name: "匿名券", description: "匿名发言一次，消息显示为「匿名」🕶️ 紫色标签（真实身份仅管理员可查）", price: 50, consumable: true, enabled: true});
    }

    // 🏆 v1.45：冷启动重建赛季结算定时器（active 且未结算且 endAt 未到 → 排 alarm）
    if (this.seasonState && this.seasonState.status === "active" && !this.seasonState.settled && this.seasonState.endAt > Date.now()) {
      this.hnAddTimer({at: this.seasonState.endAt, type: "season_settle", payload: {}});
    }

    this._loaded = true;
  }

  async save() { await saveRooms(this.storage, this.rooms); }
  async saveBanned() { await saveBanned(this.storage, this.banned); }
  async saveBannedIps() { await saveBannedIps(this.storage, this.bannedIps); }
  async saveTags() { await saveTags(this.storage, this.tags); }
  async saveKnownUsers() { await saveKnownUsers(this.storage, this.knownUsers); }
  async saveUserIps() { await saveUserIps(this.storage, this.userIps); }
  async saveGlobalBlacklist() { await saveGlobalBlacklist(this.storage, this.globalBlacklist); }
  async saveAdminKey() { await saveAdminKey(this.storage, this.adminKey); }
  async savePoints() { await savePoints(this.storage, this.userPoints); }
  async saveRegisteredUsers() { await saveRegisteredUsers(this.storage, this.registeredUsers); }
  async saveShopItems() { await saveShopItems(this.storage, this.shopItems); }
  async saveBotCommands() { await saveBotCommands(this.storage, this.botCommands); }
  async saveUserInventory() { await saveUserInventory(this.storage, this.userInventory); }
  async saveTasks() { await saveTasks(this.storage, this.tasks); }
  async saveTaskClaims() { await saveTaskClaims(this.storage, this.taskClaims); }
  async saveTaskCompletions() { await saveTaskCompletions(this.storage, this.taskCompletions); }
  async saveTaskRewardPaid() { await saveTaskRewardPaid(this.storage, this.taskRewardPaid); }
  async saveLotteryPools() { await saveLotteryPools(this.storage, this.lotteryPools); }
  async saveLotteryRecords() { await saveLotteryRecords(this.storage, this.lotteryRecords); }
  async saveEmoji() { await saveEmoji(this.storage, this.emoji); }
  async saveKickProtected() { await saveKickProtected(this.storage, this.kickProtected); }
  async saveMutes() { await saveMutes(this.storage, this.mutes); }
  async saveGameDailyWin() { await saveGameDailyWin(this.storage, this.gameDailyWin); }
  async saveRedPackets() { await saveRedPackets(this.storage, this.redPackets); }
  async saveCheckinByIp() { await saveCheckinByIp(this.storage, this.checkinByIp); }

  // 🎮 v1.43 Hacknet 对战：持久化 + alarm 调度 + 入场 ticket
  async saveHacknetGames() { await saveHacknetGames(this.storage, this.hacknetGames); }

  // 🏆 v1.45 赛季 + 荣誉：持久化
  async saveSeasonState() { await saveSeasonState(this.storage, this.seasonState); }
  async saveSeasonProgress() { await saveSeasonProgress(this.storage, this.seasonProgress); }
  async saveHonorCoins() { await saveHonorCoins(this.storage, this.honorCoins); }

  // 🔐 v1.46 OAuth state 持久化
  async saveOauthStates() { await saveOauthStates(this.storage, this.oauthStates); }

  // 💱 v1.47 交易市场持久化
  async saveMarketOrders() { await saveMarketOrders(this.storage, this.marketOrders); }
  async saveMarketConfig() { await saveMarketConfig(this.storage, this.marketConfig); }

  // 👥 v1.48 关系链持久化
  async saveUserRelations() { await saveUserRelations(this.storage, this.userRelations); }

  // 🧪 v1.49 LuckPerms 权限系统持久化
  async saveLp() { await saveLp(this.storage, this.lp); }

  // 事件入表并重排 alarm（DO 同一时刻仅一个 pending alarm）
  hnAddTimer(timer) {
    this.hnTimers.push(timer);
    this.hnReschedule();
  }

  // 重排 alarm 到最早事件（先删旧再设新；无事件则取消）
  hnReschedule() {
    try {
      if (!this.hnTimers.length) {
        try { this.storage.deleteAlarm(); } catch (e) {}
        return;
      }
      this.hnTimers.sort((a, b) => a.at - b.at);
      const earliest = this.hnTimers[0].at;
      try { this.storage.deleteAlarm(); } catch (e) {}
      this.storage.setAlarm(earliest).catch(() => {});
    } catch (e) {}
  }

  // 冷启动/恢复：从 game 状态重建事件表（trace 超时 / 密码恢复 / AI tick）
  hnRebuildTimers() {
    this.hnTimers = [];
    for (let [gameId, game] of this.hacknetGames) {
      if (!game || game.state !== "active") continue;
      for (let side of ["a", "b"]) {
        let name = game.sides && game.sides[side];
        if (!name || name === "__AI__") continue;
        let p = game.player && game.player[name];
        if (!p) continue;
        if (p.trace && p.trace.active && p.trace.deadline) {
          this.hnTimers.push({at: p.trace.deadline, type: "hn_trace", gameId, payload: {side}});
        }
        if (Array.isArray(p.exposed)) {
          for (let ex of p.exposed) {
            this.hnTimers.push({at: ex.until, type: "hn_restore_pwd", gameId, payload: {side, room: ex.room}});
          }
        }
      }
      if (game.ai) {
        if (game.ai.nextTickAt) {
          this.hnTimers.push({at: game.ai.nextTickAt, type: "hn_ai_tick", gameId, payload: {}});
        }
        if (game.ai.trace && game.ai.trace.active && game.ai.trace.deadline) {
          this.hnTimers.push({at: game.ai.trace.deadline, type: "hn_trace", gameId, payload: {side: "b", ai: true}});
        }
      }
    }
    this.hnReschedule();
  }

  // 单次入场 ticket 校验（safeEqual 常量时间比较 + 消费即删 + 过期惰性清理）
  async hnTicketOk(room, password) {
    try {
      const list = this.hnTickets.get(room);
      if (!list || !list.length) return false;
      const now = Date.now();
      const valid = list.filter(t => t.expiry > now);
      if (valid.length !== list.length) {
        if (valid.length) this.hnTickets.set(room, valid);
        else this.hnTickets.delete(room);
      }
      for (let i = 0; i < valid.length; i++) {
        if (safeEqual(valid[i].ticket, String(password))) {
          valid.splice(i, 1); // 消费
          if (valid.length) this.hnTickets.set(room, valid);
          else this.hnTickets.delete(room);
          return true;
        }
      }
      return false;
    } catch (e) { return false; }
  }

  // DO alarm：处理到期事件（trace 惩罚 / 密码恢复 / AI tick），末尾重排下一事件
  async alarm() {
    if (this._loadPromise) await this._loadPromise;
    const now = Date.now();
    const due = this.hnTimers.filter(t => t.at <= now);
    if (!due.length) return;
    this.hnTimers = this.hnTimers.filter(t => t.at > now);
    for (const evt of due) {
      try {
        if (evt.type === "season_settle") {
          if (processSeasonTimer) await processSeasonTimer(this, evt);
        } else if (processHnTimer) {
          await processHnTimer(this, evt);
        }
      } catch (e) {
        console.error("hn timer failed:", evt && evt.type, e && e.message);
      }
    }
    this.hnReschedule();
  }

  // 💰 积分流水账本：记录每笔积分变动（上限 100 条/用户），供用户查看收支明细
  async addLedger(name, delta, type, desc) {
    try {
      if (!name) return;
      // 🏆 v1.45 赛季 points 目标：正向白名单入账时累加进 seasonProgress.points（BigInt 字符串和）。
      // 排除 transfer（自刷）/ admin（铸币）。非热路径（仅在积分流水写入时触发，不进消息/签到热路径）。
      if (SEASON_POINT_TYPES.includes(type) && _toBigInt(delta) > 0n &&
          this.seasonState && this.seasonState.status === "active" && !this.seasonState.settled) {
        if (!this.seasonProgress) this.seasonProgress = {baselines: [], points: []};
        let pm = new Map(this.seasonProgress.points || []);
        pm.set(name, String(_toBigInt(pm.get(name)) + _toBigInt(delta)));
        this.seasonProgress.points = [...pm];
        await this.saveSeasonProgress();
      }
      let key = "ledger:" + name;
      let raw = await this.storage.get(key);
      let arr = [];
      if (raw) { let p = JSON.parse(raw); if (Array.isArray(p)) arr = p; }
      arr.push({ts: Date.now(), delta: String(delta), type: type || "other", desc: (desc || "").slice(0, 80)});
      if (arr.length > 100) arr = arr.slice(-100);
      await this.storage.put(key, JSON.stringify(arr));
    } catch (e) {}
  }

  // 读取积分流水
  async getLedger(name, limit) {
    try {
      let raw = await this.storage.get("ledger:" + name);
      if (!raw) return [];
      let arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.slice(-(limit || 50)) : [];
    } catch (e) { return []; }
  }

  // 🏆 v1.45 荣誉币流水账本（复制 addLedger，独立 key "honorLedger:"+name，上限 100 条）
  async addHonorLedger(name, delta, type, desc) {
    try {
      if (!name) return;
      let key = "honorLedger:" + name;
      let raw = await this.storage.get(key);
      let arr = [];
      if (raw) { let p = JSON.parse(raw); if (Array.isArray(p)) arr = p; }
      arr.push({ts: Date.now(), delta: String(delta), type: type || "other", desc: (desc || "").slice(0, 80)});
      if (arr.length > 100) arr = arr.slice(-100);
      await this.storage.put(key, JSON.stringify(arr));
    } catch (e) {}
  }

  // 读取荣誉币流水
  async getHonorLedger(name, limit) {
    try {
      let raw = await this.storage.get("honorLedger:" + name);
      if (!raw) return [];
      let arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.slice(-(limit || 50)) : [];
    } catch (e) { return []; }
  }

  // ⭐ 经验系统：发放经验（可顺带 +1 对应统计项），并检查成就解锁。
  // statsKey ∈ {msg, checkin, game, shop}，对应 user.stats.{msgCount, checkinCount, gameWins, shopCount}。
  // 返回 {exp, level, leveledUp, newLevel, achievements(新解锁数组)}；用户不存在返回 null。
  async grantExp(name, amount, statsKey) {
    let user = this.registeredUsers.get(name);
    if (!user) return null;
    if (!user.stats) user.stats = { msgCount: 0, checkinCount: 0, gameWins: 0, shopCount: 0 };
    // statsKey（msg/checkin/game/shop）→ 用户统计字段名映射
    const STATS_FIELD = { msg: "msgCount", checkin: "checkinCount", game: "gameWins", shop: "shopCount" };
    let field = STATS_FIELD[statsKey];
    if (field && field in user.stats) user.stats[field] = (user.stats[field] || 0) + 1;
    let oldExp = user.exp || 0;
    let beforeLevel = levelForExp(oldExp).level;
    user.exp = oldExp + (amount > 0 ? amount : 0);
    // ⚠️ 已知限制（F6）：此处全量写 registeredUsers（storage 写放大）。改为按用户 key 增量写
    // （storage.put("user:"+name)）需同步改造 loadAll 读取路径与 persistence.mjs（不属本次改动范围），
    // 且多读路径依赖整表 Map，改动大、风险高。评估后决定不重构，暂接受现状。
    await this.saveRegisteredUsers();
    let afterLevel = levelForExp(user.exp).level;
    let achievements = await checkAchievements(this, name, user);
    return { exp: user.exp, level: afterLevel, leveledUp: afterLevel > beforeLevel, newLevel: afterLevel, achievements };
  }

  // M15：管理鉴权（与 registry/points.mjs 的 adminAuthorized 同源逻辑）
  // 🔒 安全修复（F8）：改用常量时间比较 safeEqual，降低密钥时序测信道风险
  adminAuthorized(auth) {
    if (!auth) return false;
    if (this.adminKey && safeEqual(auth, this.adminKey)) return true;
    if (this.env) {
      if (this.env.ADMIN_SECRET_KEY && safeEqual(auth, this.env.ADMIN_SECRET_KEY)) return true;
      if (this.env.ADMIN_KEY && safeEqual(auth, this.env.ADMIN_KEY)) return true;
    }
    return false;
  }

  async fetch(request) {
    if (this._loadPromise) await this._loadPromise;

    let url = new URL(request.url);
    let path = url.pathname;

    // M15：registry 管理端点统一鉴权——防"api 无鉴权端点 → 转发 registry 管理端点"的绕过链。
    // auth 由 api/admin 子模块转发时携带（?auth=，源自 httpOnly cookie admin_key 或 URL ?key=）。
    // /room-destroy 不加守卫（chatroom /destroy 命令内部调用，且已有 DESTROY_KEY + admin API 双重校验）
    let auth = url.searchParams.get("auth") || "";
    const adminExactPaths = new Set([
      "/tag/set", "/tag/remove",
      "/ban", "/unban", "/ip-ban", "/ip-unban", "/kick-protect", "/kick-unprotect",
      "/global-blacklist/add", "/global-blacklist/remove",
      "/admin-key/set", "/admin-key/reset",
      "/user-delete", "/set-password",
      "/admin/shop/items", "/admin/shop/item/add", "/admin/shop/item/toggle", "/admin/shop/item/delete",
      "/admin/tasks/list", "/admin/task/add", "/admin/task/toggle", "/admin/task/delete",
      "/redeem/generate", "/redeem/add", "/redeem/delete", "/redeem/list",
      "/log/add", "/log/list", "/log/clear",
      "/admin/user-inventory",
      "/admin/mute", "/admin/unmute", "/admin/mute-list",
      "/emoji/add", "/emoji/remove",
      "/room/webhook",
      "/anon/grant", "/anon/log",
      "/exp/set", "/exp/add", "/exp/batch",
      "/admin/season/config", "/admin/season/create", "/admin/season/start", "/admin/season/end",
      "/admin/honor-shop/items", "/admin/honor-shop/item/add", "/admin/honor-shop/item/toggle", "/admin/honor-shop/item/delete",
      "/admin/honor/add",
      "/admin/market/config", "/admin/market/orders", "/admin/market/delist"
    ]);
    let needsAdmin = adminExactPaths.has(path) || path.startsWith("/lottery/admin/") ||
      (path === "/bot-commands" && ["add", "update", "delete"].includes(url.searchParams.get("action")));
    if (needsAdmin && !this.adminAuthorized(auth)) {
      return new Response("无权操作", { status: 403 });
    }

    let handler = null;

    if (path === "/register" || path === "/update" || path === "/list" || path === "/password-status" || path === "/verify-password" || path === "/set-password" || path === "/room-destroy" || path === "/room/webhook" || path === "/room/webhook-verify")
      handler = handleRooms;
    else if (path.startsWith("/ban") || path.startsWith("/unban") || path.startsWith("/banned-list") || path.startsWith("/is-banned") || path.startsWith("/ip-") || path.startsWith("/kick-"))
      handler = handleBans;
    else if (path.startsWith("/global-blacklist") || path === "/is-globally-blacklisted")
      handler = handleBlacklist;
    else if (path.startsWith("/admin-key") || path === "/combined-auth" || path === "/admin/user-inventory")
      handler = handleAdmin;
    else if (path.startsWith("/tag/"))
      handler = handleTags;
    else if (path.startsWith("/user-") || path === "/user/achievements" || path.startsWith("/xp/") || path === "/known-users" || path === "/user-init" || path === "/user-bio" || path === "/user-avatar" || path === "/user-profile")
      handler = handleUsers;
    else if (path.startsWith("/rel/"))
      handler = handleRelations;
    else if (path.startsWith("/lp/"))
      handler = handleLp;
    else if (path.startsWith("/hn/"))
      handler = handleHacknet;
    else if (path.startsWith("/season/") || path.startsWith("/admin/season/"))
      handler = handleSeason;
    else if (path.startsWith("/honor/") || path.startsWith("/admin/honor/") || path.startsWith("/admin/honor-shop/"))
      handler = handleHonor;
    else if (path.startsWith("/oauth/"))
      handler = handleOauth;
    else if (path.startsWith("/points/") || path.startsWith("/game/"))
      handler = handlePoints;
    else if (path.startsWith("/exp/"))
      handler = handleExp;
    else if (path.startsWith("/shop/") || path.startsWith("/admin/shop/") || path.startsWith("/anon/"))
      handler = handleShop;
    else if (path.startsWith("/market/") || path.startsWith("/admin/market/"))
      handler = handleMarket;
    else if (path.startsWith("/task") || path.startsWith("/tasks") || path.startsWith("/admin/task"))
      handler = handleTasks;
    else if (path.startsWith("/lottery"))
      handler = handleLottery;
    else if (path === "/bot-commands")
      handler = handleBot;
    else if (path.startsWith("/emoji"))
      handler = handleEmoji;
    else if (path.startsWith("/redeem"))
      handler = handleRedeem;
    else if (path.startsWith("/log/"))
      handler = handleLog;
    else if (path.startsWith("/redpacket"))
      handler = handleRedPacket;
    else if (path.startsWith("/admin/mute") || path.startsWith("/admin/unmute") || path === "/mute-status" || path === "/admin/mute-list")
      handler = handleMute;

    if (handler) {
      let result = await handler(this, request, url);
      if (result) return result;
    }

    return new Response("未找到", { status: 404 });
  }
}
