// 欢迎横幅 - 高亮用户进入时滚动显示欢迎信息
import { state } from './state.js';

console.log('[banner] module loaded');

const COLOR_TITLE_MAP = {
  red: '管理员',
  'red+gold': '金边红大佬',
  cyan: '副管理员',
  teal: '副管理员',
  gold: '金标大佬',
};

const TARGET_COLORS = new Set(['red', 'cyan', 'teal', 'gold']);

let bannerTimer = null;

export function showWelcomeBanner(username, tagColor, tagBorder) {
  try {
    if (!TARGET_COLORS.has(tagColor)) { console.log('[banner] skipped: color not target', tagColor); return; }

    let key = tagBorder ? tagColor + '+' + tagBorder : tagColor;
    let title = COLOR_TITLE_MAP[key] || COLOR_TITLE_MAP[tagColor] || '用户';
    let roomName = state.roomname || '未知';
    let text = '欢迎 ' + title + ' ' + username + ' 来到 ' + roomName + ' 聊天室！';

    let container = document.getElementById('welcome-banner');
    if (!container) { console.log('[banner] ERROR: #welcome-banner not found in DOM'); return; }

    console.log('[banner] container found, showing banner');
    if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
    container.style.display = 'flex';

    let textEl = container.querySelector('.welcome-banner-text');
    if (!textEl) { console.log('[banner] ERROR: .welcome-banner-text not found'); return; }
    console.log('[banner] setting text:', text);
    textEl.textContent = text;

    let colorMap = { red: '#e74c3c', 'red+gold': '#e74c3c', cyan: '#00bcd4', teal: '#009688', gold: '#ffd700' };
    let accentColor = colorMap[key] || colorMap[tagColor] || '#ffd700';
    container.style.borderLeft = '4px solid ' + accentColor;
    container.style.background = 'linear-gradient(135deg, ' + accentColor + '22, ' + accentColor + '11)';

    textEl.style.animation = 'none';
    void textEl.offsetWidth;
    textEl.style.animation = 'welcomeMarquee 10s linear forwards';

    let isMobile = window.innerWidth <= 768;
    let offset = isMobile ? '0px' : '-260px';
    container.style.setProperty('--marquee-offset', offset);
    console.log('[banner] animation applied, offset:', offset);
    bannerTimer = setTimeout(() => {
      container.style.display = 'none';
      bannerTimer = null;
    }, 11000);
  } catch (e) {
    console.log('[banner] EXCEPTION:', e.message, e.stack);
  }
}
