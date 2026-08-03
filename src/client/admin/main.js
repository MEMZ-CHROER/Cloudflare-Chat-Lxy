// 管理后台入口
import { state } from './state.js';
import { checkAuthAndLoad, isSuper, showSuperSections } from './auth.js';
import {
  loadGlobalUsers, globalKick, banUser, unbanUser, loadBannedList,
  loadIpBannedList, banIpByInput, banIp, unbanIp, loadGlobalBlacklist,
  setPoints, grantAnon, blacklistUser, unblacklistUser, deleteUser
} from './users.js';
import { loadHistoryUsers } from './history.js';
import { loadAdminKeyInfo, changeAdminKey, resetAdminKey } from './key.js';
import {
  loadPointsSection, searchPointsUser, setPtsToolbar, addPtsToolbar,
  deductPtsToolbar, setPtsInline, addPtsInline, deductPtsInline,
  toggleAllCheckboxes, updateSelectedCount, batchAdd, batchDeduct, exportPointsCSV
} from './points.js';
import {
  loadExpSection, searchExpUser, setExpToolbar, addExpToolbar,
  deductExpToolbar, setExpInline, addExpInline, deductExpInline
} from './exp.js';
import { loadLevelStyleSection, onLevelStyleRoomChange, setLevelStyle, clearLevelStyle } from './levelstyle.js';
import { loadShopSection, addShopItem, toggleShopItem, deleteShopItem } from './shop.js';
import { loadTaskSection, addTaskItem, toggleTaskItem, deleteTaskItem } from './tasks.js';
import { loadUserTags, setTag, removeTag } from './tags.js';
import {
  loadLotteryPools, showAddPoolForm, showEditPoolForm, closeLotteryPoolModal,
  saveLotteryPool, toggleLotteryPool, deleteLotteryPool, showAddPrizeForm,
  closeLotteryPrizeModal, addLotteryPrize, deletePrize, restockPrize
} from './lottery.js';
import { loadIpGroup, toggleIpGroup } from './ipgroup.js';
import { quickSearch, showUserDetail, closeUserModal, muteUser } from './usermodal.js';
import { LIGHT_COLORS, TAG_COLORS } from './utils.js';
import { navigateTo, getCurrentRoute, startAutoRefresh, stopAutoRefresh } from './routing.js';
import { loadRooms, kickUser, addBlacklist, removeBlacklist, clearRoom, loadRoomDetail, destroyRoom } from './rooms.js';
import { toggleRoomMessages, setAnnouncement, setPinned, clearPinned } from './messages.js';
import { addBot, toggleBot, deleteBot } from './bot.js';
import { sendMessage, quickSendMessage } from './sendmessage.js';
import { loadRedeemSection, generateRedeemCodes, addRedeemCode, deleteRedeemCode } from './redeem.js';
import { loadKickProtected, kickProtectAdd, kickProtectRemove } from './kickprotect.js';
import { loadLogSection, clearLog } from './log.js';
import { loadWebhooksSection, genWebhook, delWebhook } from './webhooks.js';

// ======== 暴露到 window 供 onclick 调用 ========

// 用户管理
window.globalKick = globalKick;
window.banUser = banUser;
window.unbanUser = unbanUser;
window.blacklistUser = blacklistUser;
window.unblacklistUser = unblacklistUser;
window.deleteUser = deleteUser;
window.banIpByInput = banIpByInput;
window.banIp = banIp;
window.unbanIp = unbanIp;

// 标签
window.setTag = setTag;
window.removeTag = removeTag;
window.loadUserTags = loadUserTags;

// 积分
window.searchPointsUser = searchPointsUser;
window.grantAnon = grantAnon;
window.setPointsToolbar = setPtsToolbar;
window.addPointsToolbar = addPtsToolbar;
window.deductPointsToolbar = deductPtsToolbar;
window.setPtsInline = setPtsInline;
window.addPtsInline = addPtsInline;
window.deductPtsInline = deductPtsInline;
window.toggleAllCheckboxes = toggleAllCheckboxes;
window.updateSelectedCount = updateSelectedCount;
window.batchAdd = batchAdd;
window.batchDeduct = batchDeduct;
window.exportPointsCSV = exportPointsCSV;

// 经验等级
window.searchExpUser = searchExpUser;
window.setExpToolbar = setExpToolbar;
window.addExpToolbar = addExpToolbar;
window.deductExpToolbar = deductExpToolbar;
window.setExpInline = setExpInline;
window.addExpInline = addExpInline;
window.deductExpInline = deductExpInline;

// 房间等级样式
window.onLevelStyleRoomChange = onLevelStyleRoomChange;
window.setLevelStyle = setLevelStyle;
window.clearLevelStyle = clearLevelStyle;

// 商店
window.addShopItem = addShopItem;
window.toggleShopItem = toggleShopItem;
window.deleteShopItem = deleteShopItem;

// 任务
window.addTaskItem = addTaskItem;
window.toggleTaskItem = toggleTaskItem;
window.deleteTaskItem = deleteTaskItem;

// 抽奖
window.loadLotteryPools = loadLotteryPools;
window.showAddPoolForm = showAddPoolForm;
window.showEditPoolForm = showEditPoolForm;
window.closeLotteryPoolModal = closeLotteryPoolModal;
window.saveLotteryPool = saveLotteryPool;
window.toggleLotteryPool = toggleLotteryPool;
window.deleteLotteryPool = deleteLotteryPool;
window.showAddPrizeForm = showAddPrizeForm;
window.closeLotteryPrizeModal = closeLotteryPrizeModal;
window.addLotteryPrize = addLotteryPrize;
window.deletePrize = deletePrize;
window.restockPrize = restockPrize;

// 房间
window.kickUser = kickUser;
window.addBlacklist = addBlacklist;
window.removeBlacklist = removeBlacklist;
window.clearRoom = clearRoom;
window.destroyRoom = destroyRoom;
window.toggleRoomMessages = toggleRoomMessages;
window.setAnnouncement = setAnnouncement;
window.setPinned = setPinned;
window.clearPinned = clearPinned;

// 路由
window.navigateTo = navigateTo;

// 机器人
window.addBot = addBot;
window.toggleBot = toggleBot;
window.deleteBot = deleteBot;

// 发送消息
window.sendMessage = sendMessage;
window.quickSendMessage = quickSendMessage;

// 房间 Webhook
window.genWebhook = genWebhook;
window.delWebhook = delWebhook;

// IP 分组
window.loadIpGroup = loadIpGroup;
window.toggleIpGroup = toggleIpGroup;

// 用户详情
window.quickSearch = quickSearch;
window.showUserDetail = showUserDetail;
window.closeUserModal = closeUserModal;
window.muteUser = muteUser;

// 密钥
window.changeAdminKey = changeAdminKey;
window.resetAdminKey = resetAdminKey;

// 兑换码
window.generateRedeemCodes = generateRedeemCodes;
window.addRedeemCode = addRedeemCode;
window.deleteRedeemCode = deleteRedeemCode;
window.loadRedeemSection = loadRedeemSection;

// 踢出保护
window.kickProtectAdd = kickProtectAdd;
window.kickProtectRemove = kickProtectRemove;
window.loadKickProtected = loadKickProtected;

// 操作日志
window.loadLogSection = loadLogSection;
window.clearLog = clearLog;

// ======== 事件绑定 ========

// 登录
document.querySelector("#login-btn").addEventListener("click", async () => {
  let k = document.querySelector("#admin-key").value;
  if (!k) return;
  try {
    // 🔒 安全修复（LD12）：改走登录端点，服务端下发 httpOnly Cookie（JS 不可读），不再把密钥存 localStorage
    let r = await fetch("/api/admin/login", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({key: k})});
    if (!r.ok) throw new Error("密钥错误");
    let data = await r.json();
    localStorage.removeItem("admin_key");
    state.adminKey = "";
    state.adminLevel = data.level;
    document.querySelector("#login-form").style.display = "none";
    document.querySelector("#admin-panel").style.display = "block";
    showSuperSections(isSuper());
    loadRooms();
    loadGlobalBlacklist();
    if (isSuper()) {
      loadGlobalUsers();
      loadBannedList();
      loadIpBannedList();
      loadHistoryUsers();
      loadAdminKeyInfo();
      loadPointsSection();
      loadExpSection();
    }
    startAutoRefresh();
	    navigateTo(getCurrentRoute(), false);
  } catch (e) {
    document.querySelector("#login-error").style.display = "block";
  }
});

document.querySelector("#admin-key").addEventListener("keydown", e => {
  if (e.key === "Enter") document.querySelector("#login-btn").click();
});

// 登出
document.querySelector("#logout-btn").addEventListener("click", () => {
  stopAutoRefresh();
  localStorage.removeItem("admin_key");
  state.adminKey = "";
  document.querySelector("#admin-panel").style.display = "none";
  document.querySelector("#login-form").style.display = "block";
  document.querySelector("#admin-key").value = "";
  document.querySelector("#admin-key").focus();
});

// IP 封禁
document.querySelector("#ban-ip-btn").addEventListener("click", banIpByInput);
document.querySelector("#ban-ip-input").addEventListener("keydown", e => {
  if (e.key === "Enter") banIpByInput();
});

// 密钥管理
document.querySelector("#set-admin-key-btn").addEventListener("click", changeAdminKey);
document.querySelector("#reset-admin-key-btn").addEventListener("click", resetAdminKey);
document.querySelector("#new-admin-key-input").addEventListener("keydown", e => {
  if (e.key === "Enter") changeAdminKey();
});

// 颜色选择器实时预览
document.addEventListener('change', function(e) {
  let target = e.target;
  if (target.classList.contains('tag-color-select') || target.id === 'shop-tb-color') {
    let val = target.value;
    if (val && TAG_COLORS[val]) {
      target.style.background = TAG_COLORS[val];
      target.style.color = LIGHT_COLORS.has(val) ? '#333' : '#fff';
    } else {
      target.style.background = '';
      target.style.color = '';
    }
  }
});

// ======== 自动登录 ========
if (state.adminKey) {
  checkAuthAndLoad();
}
