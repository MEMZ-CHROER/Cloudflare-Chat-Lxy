// ⭐ 成就系统：静态定义表 + 判定解锁（纯展示，不绑功能特权）
import { levelForExp } from "../utils.mjs";

// 成就定义表。check(stats, level) → 是否满足解锁条件
export const ACHIEVEMENTS = [
  { id: "first_msg",  icon: "💬", name: "初来乍到",  desc: "发出第一条消息",      check: (s, l) => (s.msgCount || 0) >= 1 },
  { id: "msg_100",    icon: "🗣️", name: "话痨",     desc: "累计发言 100 条",     check: (s, l) => (s.msgCount || 0) >= 100 },
  { id: "msg_1000",   icon: "🔥", name: "舌战群儒",  desc: "累计发言 1000 条",    check: (s, l) => (s.msgCount || 0) >= 1000 },
  { id: "checkin_1",  icon: "📅", name: "签到首日",  desc: "完成第一次签到",      check: (s, l) => (s.checkinCount || 0) >= 1 },
  { id: "checkin_7",  icon: "📆", name: "一周坚持",  desc: "累计签到 7 天",       check: (s, l) => (s.checkinCount || 0) >= 7 },
  { id: "game_win_1", icon: "🎮", name: "小试牛刀",  desc: "赢得第一局游戏",      check: (s, l) => (s.gameWins || 0) >= 1 },
  { id: "shop_1",     icon: "🛒", name: "剁手党",    desc: "完成第一次购物",      check: (s, l) => (s.shopCount || 0) >= 1 },
  { id: "level_5",    icon: "⭐", name: "崭露头角",  desc: "等级达到 Lv.5",       check: (s, l) => l >= 5 },
  { id: "level_10",   icon: "🌟", name: "声名鹊起",  desc: "等级达到 Lv.10",      check: (s, l) => l >= 10 },
];

// 检查用户是否新解锁成就；有则写入 user.achievements 并持久化。返回新解锁的成就 id 数组。
export async function checkAchievements(reg, name, user) {
  try {
    if (!user) user = reg.registeredUsers.get(name);
    if (!user) return [];
    if (!Array.isArray(user.achievements)) user.achievements = [];
    let stats = user.stats || { msgCount: 0, checkinCount: 0, gameWins: 0, shopCount: 0 };
    let level = levelForExp(user.exp || 0).level;
    let unlocked = new Set(user.achievements);
    let newly = [];
    for (let a of ACHIEVEMENTS) {
      if (!unlocked.has(a.id) && a.check(stats, level)) {
        unlocked.add(a.id);
        newly.push(a.id);
      }
    }
    if (newly.length) {
      user.achievements = [...unlocked];
      await reg.saveRegisteredUsers();
    }
    return newly;
  } catch (e) { return []; }
}
