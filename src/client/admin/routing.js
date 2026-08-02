// 路由导航 + 自动刷新
import { state } from './state.js';
import { loadRooms, loadRoomDetail } from './rooms.js';
import { loadGlobalUsers, loadBannedList, loadIpBannedList, loadGlobalBlacklist } from './users.js';
import { loadHistoryUsers } from './history.js';
import { loadUserTags } from './tags.js';
import { loadPointsSection } from './points.js';
import { loadExpSection } from './exp.js';
import { loadLevelStyleSection } from './levelstyle.js';
import { loadShopSection } from './shop.js';
import { loadTaskSection } from './tasks.js';
import { loadLotteryPools } from './lottery.js';
import { loadAdminKeyInfo } from './key.js';
import { loadDashboard } from './dashboard.js';
import { loadIpGroup } from './ipgroup.js';
import { loadSendMessageSection } from './sendmessage.js';
import { loadBotSection } from './bot.js';
import { loadRedeemSection } from './redeem.js';
import { loadKickProtected } from './kickprotect.js';
import { loadWebhooksSection } from './webhooks.js';

export const routeToSection = {
  '/admin/': 'dashboard-section',
  '/admin/dashboard/': 'dashboard-section',
  '/admin/rooms/': 'room-list-container',
  '/admin/users/': 'global-users-section',
  '/admin/bans/': 'banned-users-section',
  '/admin/ip-bans/': 'ip-banned-section',
  '/admin/history/': 'history-users-section',
  '/admin/blacklist/': 'global-blacklist-section',
  '/admin/kick-protect/': 'kick-protect-section',
  '/admin/points/': 'points-section',
  '/admin/exp/': 'exp-section',
  '/admin/level-style/': 'levelstyle-section',
  '/admin/shop/': 'shop-section',
  '/admin/task/': 'task-section',
  '/admin/ip-group/': 'ip-group-section',
  '/admin/admin-key/': 'admin-key-section',
  '/admin/user-tags/': 'user-tags-section',
  '/admin/lottery/': 'lottery-section',
  '/admin/send-message/': 'send-message-section',
  '/admin/webhooks/': 'webhooks-section',
  '/admin/bot/': 'bot-section',
  '/admin/emoji/': 'emoji-section',
  '/admin/redeem/': 'redeem-section',
};

export function getCurrentRoute() {
  let p = location.pathname;
  if (!p.endsWith('/')) p += '/';
  if (routeToSection[p]) return p;
  for (let r of Object.keys(routeToSection)) {
    if (r !== '/admin/' && p.startsWith(r)) return r;
  }
  return '/admin/dashboard/';
}

export function navigateTo(path, pushHistory) {
  if (pushHistory !== false) {
    history.pushState({}, '', path);
  }
  let targetId = routeToSection[path] || 'room-list-container';
  document.querySelectorAll('.page-section').forEach(el => {
    el.classList.remove('active');
  });
  let target = document.getElementById(targetId);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  let navItem = document.querySelector('.nav-item[data-route="' + path + '"]');
  if (navItem) navItem.classList.add('active');

  setTimeout(() => loadSectionData(targetId), 50);
}

function loadSectionData(sectionId) {
  switch (sectionId) {
    case 'dashboard-section': loadDashboard(); break;
    case 'room-list-container': loadRooms(); break;
    case 'global-users-section': loadGlobalUsers(); break;
    case 'banned-users-section': loadBannedList(); break;
    case 'ip-banned-section': loadIpBannedList(); break;
    case 'history-users-section': loadHistoryUsers(); break;
    case 'global-blacklist-section': loadGlobalBlacklist(); break;
    case 'kick-protect-section': loadKickProtected(); break;
    case 'points-section': loadPointsSection(); break;
    case 'exp-section': loadExpSection(); break;
    case 'levelstyle-section': loadLevelStyleSection(); break;
    case 'shop-section': loadShopSection(); break;
    case 'task-section': loadTaskSection(); break;
    case 'ip-group-section': loadIpGroup(); break;
    case 'admin-key-section': loadAdminKeyInfo(); break;
    case 'user-tags-section': loadUserTags(); break;
    case 'lottery-section': loadLotteryPools(); break;
    case 'send-message-section': loadSendMessageSection(); break;
    case 'webhooks-section': loadWebhooksSection(); break;
    case 'bot-section': loadBotSection(); break;
    case 'redeem-section': loadRedeemSection(); break;
  }
}

window.addEventListener('popstate', () => {
  navigateTo(getCurrentRoute(), false);
});

export function startAutoRefresh() {
  // 已禁用自动刷新
}

export function stopAutoRefresh() {
  if (state.refreshInterval) {
    clearInterval(state.refreshInterval);
    state.refreshInterval = null;
  }
}
