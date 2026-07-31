/**
 * CloudChat 主题切换系统
 * 支持经典主题和亚克力现代主题
 */

(function () {
  'use strict';

  // 主题配置
  const THEMES = {
    classic: {
      name: '经典主题',
      file: '/static/styles/all-styles.css',
      icon: '🎨',
      description: '经典简洁风格'
    },
    acrylic: {
      name: '亚克力主题',
      file: '/static/styles/acrylic-theme.css',
      icon: '✨',
      description: '现代毛玻璃风格'
    }
  };

  // 当前主题
  let currentTheme = 'classic';

  /**
   * 初始化主题系统
   */
  function initTheme() {
    // 从localStorage读取主题设置
    const savedTheme = localStorage.getItem('cloudchat-theme') || 'classic';

    // 应用随机背景图
    applyRandomBackground();

    // 创建主题切换按钮
    createThemeToggleButton();

    // 应用主题
    setTheme(savedTheme, false);

    console.log('[Theme] 系统初始化完成，当前主题:', savedTheme);
  }

  /**
   * 应用随机背景图
   */
  function applyRandomBackground() {
    const bgUrl = 'https://api.elaina.cat/random/pc?t=' + Date.now();
    document.documentElement.style.setProperty('--site-bg-image', 'url("' + bgUrl + '")');
  }

  /**
   * 创建主题切换按钮
   */
  function createThemeToggleButton() {
    // 检查是否已存在
    if (document.getElementById('theme-toggle-btn')) {
      return;
    }

    const btn = document.createElement('button');
    btn.id = 'theme-toggle-btn';
    btn.className = 'theme-toggle-btn';
    btn.title = '切换主题';
    btn.setAttribute('aria-label', '切换主题');

    // 设置图标
    btn.innerHTML = THEMES[currentTheme].icon;

    // 点击事件
    btn.addEventListener('click', toggleTheme);

    // 添加到页面
    document.body.appendChild(btn);

    console.log('[Theme] 主题切换按钮已创建');
  }

  /**
   * 切换主题
   */
  function toggleTheme() {
    const themeKeys = Object.keys(THEMES);
    const currentIndex = themeKeys.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % themeKeys.length;
    const nextTheme = themeKeys[nextIndex];

    setTheme(nextTheme, true);
  }

  /**
   * 设置主题
   * @param {string} themeName - 主题名称
   * @param {boolean} animate - 是否显示动画
   */
  function setTheme(themeName, animate = true) {
    if (!THEMES[themeName]) {
      console.warn('[Theme] 未知主题:', themeName);
      return;
    }

    const theme = THEMES[themeName];

    // 如果是相同主题，不重复加载
    if (currentTheme === themeName) {
      return;
    }

    console.log('[Theme] 切换到主题:', themeName);

    // 移除旧主题样式
    const oldLink = document.querySelector('link[data-theme]');
    if (oldLink) {
      oldLink.remove();
    }

    // 添加新主题样式
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = theme.file;
    link.setAttribute('data-theme', themeName);

    // 加载成功后更新状态
    link.onload = () => {
      currentTheme = themeName;

      // 保存到localStorage
      localStorage.setItem('cloudchat-theme', themeName);

      // 更新按钮图标
      const btn = document.getElementById('theme-toggle-btn');
      if (btn) {
        btn.innerHTML = theme.icon;
      }

      // 显示通知
      if (animate) {
        showThemeNotification(theme);
      }

      console.log('[Theme] 主题加载成功:', themeName);
    };

    // 加载失败处理
    link.onerror = () => {
      console.error('[Theme] 主题加载失败:', themeName);
      showErrorNotification('主题加载失败，请刷新页面重试');
    };

    document.head.appendChild(link);
  }

  /**
   * 显示主题切换通知
   * @param {Object} theme - 主题配置
   */
  function showThemeNotification(theme) {
    // 移除旧通知
    const oldNotif = document.querySelector('.theme-notification');
    if (oldNotif) {
      oldNotif.remove();
    }

    // 创建通知元素
    const notif = document.createElement('div');
    notif.className = 'theme-notification';
    notif.innerHTML = `
      <div class="theme-notif-icon">${theme.icon}</div>
      <div class="theme-notif-content">
        <div class="theme-notif-title">${theme.name}</div>
        <div class="theme-notif-desc">${theme.description}</div>
      </div>
    `;

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      .theme-notification {
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: rgba(28, 34, 54, 0.82);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 16px;
        padding: 16px 24px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        gap: 16px;
        z-index: 10000;
        animation: slideUpNotif 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .theme-notif-icon {
        font-size: 32px;
        background: var(--ff-grad, linear-gradient(135deg, #7aa2ff, #f472b6));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .theme-notif-content {
        flex: 1;
      }
      .theme-notif-title {
        font-size: 16px;
        font-weight: 700;
        color: #eef2ff;
        margin-bottom: 2px;
      }
      .theme-notif-desc {
        font-size: 13px;
        color: #9aa7c7;
      }
      @keyframes slideUpNotif {
        to {
          transform: translateX(-50%) translateY(0);
        }
      }
    `;
    document.head.appendChild(style);

    // 添加到页面
    document.body.appendChild(notif);

    // 3秒后移除
    setTimeout(() => {
      notif.style.animation = 'slideUpNotif 0.3s cubic-bezier(0.4, 0, 0.2, 1) reverse forwards';
      setTimeout(() => {
        notif.remove();
        style.remove();
      }, 300);
    }, 3000);
  }

  /**
   * 显示错误通知
   * @param {string} message - 错误消息
   */
  function showErrorNotification(message) {
    const notif = document.createElement('div');
    notif.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(245, 87, 108, 0.95);
      color: white;
      padding: 12px 20px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      z-index: 10001;
      animation: slideDown 0.3s ease-out;
      box-shadow: 0 4px 12px rgba(245, 87, 108, 0.3);
    `;
    notif.textContent = message;
    document.body.appendChild(notif);

    setTimeout(() => notif.remove(), 4000);
  }

  /**
   * 获取当前主题
   * @returns {string}
   */
  function getCurrentTheme() {
    return currentTheme;
  }

  /**
   * 获取所有可用主题
   * @returns {Object}
   */
  function getAvailableThemes() {
    return THEMES;
  }

  // 等待DOM加载完成
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
  } else {
    initTheme();
  }

  // 导出API
  window.ThemeSwitch = {
    setTheme,
    toggleTheme,
    getCurrentTheme,
    getAvailableThemes
  };

})();
