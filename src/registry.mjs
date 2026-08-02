import { handleRooms } from "./registry/rooms.mjs";
import { handleBans } from "./registry/bans.mjs";
import { handleBlacklist } from "./registry/blacklist.mjs";
import { handleAdmin } from "./registry/adminKey.mjs";
import { handleTags } from "./registry/tags.mjs";
import { handleUsers } from "./registry/users.mjs";
import { handlePoints } from "./registry/points.mjs";
import { handleShop } from "./registry/shop.mjs";
import { handleTasks } from "./registry/tasks.mjs";
import { handleLottery } from "./registry/lottery.mjs";
import { handleBot } from "./registry/bot.mjs";
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
  saveGameDailyWin, saveRedPackets, saveCheckinByIp, saveTaskRewardPaid
} from "./registry/persistence.mjs";

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

  // 💰 积分流水账本：记录每笔积分变动（上限 100 条/用户），供用户查看收支明细
  async addLedger(name, delta, type, desc) {
    try {
      if (!name) return;
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

  // M15：管理鉴权（与 registry/points.mjs 的 adminAuthorized 同源逻辑）
  adminAuthorized(auth) {
    if (!auth) return false;
    if (this.adminKey && auth === this.adminKey) return true;
    if (this.env) {
      if (this.env.ADMIN_SECRET_KEY && auth === this.env.ADMIN_SECRET_KEY) return true;
      if (this.env.ADMIN_KEY && auth === this.env.ADMIN_KEY) return true;
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
      "/room/webhook"
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
    else if (path.startsWith("/user-") || path === "/known-users" || path === "/user-init" || path === "/user-bio" || path === "/user-avatar" || path === "/user-profile")
      handler = handleUsers;
    else if (path.startsWith("/points/") || path.startsWith("/game/"))
      handler = handlePoints;
    else if (path.startsWith("/shop/") || path.startsWith("/admin/shop/"))
      handler = handleShop;
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
