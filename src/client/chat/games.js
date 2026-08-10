// 🎮 小游戏系统入口 — 导入核心 + 各游戏组
// v1.53 批3 双轨：默认走 modal-manager 宿主容器（registerModalHost('games', mountInto)，
// 游戏原生渲染进 Vue 弹窗卡片 .cm-host）；localStorage.chatLegacyModals=1 回退旧 #game-overlay。
import { openGames as legacyOpenGames, closeGames as legacyCloseGames, switchGame, mountInto } from './game-core.js';
import './game-simple.js';
import './game-cards.js';
import './game-board.js';
import './game-action.js';
import './game-arcade.js';

export async function openGames() {
  if (localStorage.getItem("chatLegacyModals") === "1") { legacyOpenGames(); return; }
  const { registerModalHost, openModal } = await import('./modal-manager.js');
  registerModalHost('games', mountInto);
  openModal('games');
}

export function closeGames() {
  if (localStorage.getItem("chatLegacyModals") === "1") { legacyCloseGames(); return; }
  import('./modal-manager.js').then((m) => m.closeModal('games')).catch(() => legacyCloseGames());
}

export { switchGame };
