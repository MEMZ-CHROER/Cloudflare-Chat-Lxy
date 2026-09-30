export default `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>CloudChat v2</title>
  <link rel="stylesheet" href="/static/style.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" crossorigin="anonymous">
</head>
<body>
  <video id="video-wallpaper" autoplay muted loop playsinline style="display:none"></video>
  <!-- Auth Form -->
  <div id="v2-auth-form" style="display:none">
    <div class="name-card">
      <h1>CloudChat v2</h1>
      <div class="auth-tabs">
        <button class="auth-tab active" data-tab="login">登录</button>
        <button class="auth-tab" data-tab="register">注册</button>
      </div>
      <div id="v2-auth-login">
        <input id="v2-login-name" class="auth-input" placeholder="用户名" maxlength="32">
        <input id="v2-login-pass" type="password" class="auth-input" placeholder="密码">
        <button id="v2-login-btn" class="auth-btn" type="button">登录</button>
        <div id="v2-login-error" class="auth-error"></div>
        <button type="button" id="v2-skip-auth" class="auth-skip">跳过，以游客身份进入</button>
      </div>
      <div id="v2-auth-register" style="display:none">
        <input id="v2-reg-name" class="auth-input" placeholder="用户名" maxlength="32">
        <input id="v2-reg-pass" type="password" class="auth-input" placeholder="密码（至少6位）">
        <button id="v2-reg-btn" class="auth-btn" type="button">注册</button>
        <div id="v2-reg-error" class="auth-error"></div>
      </div>
      <div style="text-align:center;margin-top:10px;font-size:12px;color:#888">
        <select id="v2-lang-select" style="padding:2px 6px;font-size:12px;border-radius:4px;border:1px solid #ccc">
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </div>
    </div>
  </div>
  <!-- Room List -->
  <div id="v2-room-list" style="display:none">
    <div class="room-form-inner">
      <h2>加入聊天</h2>
      <div class="room-input-row">
        <input id="v2-room-name" placeholder="输入房间名称" maxlength="32">
        <button id="v2-join-room">进入</button>
      </div>
      <div class="or-divider"><span>或者</span></div>
      <button id="v2-create-room">+ 创建私人房间</button>
      <div id="v2-room-list-header">已有房间</div>
      <div id="v2-room-list-items">
        <div id="v2-room-list-loading">加载中...</div>
      </div>
    </div>
  </div>
  <!-- Chat Room -->
  <form id="chatroom" action="/fake-form-action" style="display:none">
    <div id="v2-announcement-banner" style="display:none;padding:8px 16px;margin:0 8px 8px;background:linear-gradient(135deg,#fff3cd,#ffe0b2);border-radius:8px;font-size:13px;color:#856404;align-items:center;gap:8px;flex-shrink:0;">
      <span style="font-size:16px;">📢</span>
      <span id="v2-announcement-text" style="flex:1;"></span>
      <span id="v2-announcement-dismiss" style="cursor:pointer;font-size:18px;color:#856404;padding:0 4px;line-height:1;" title="关闭">&times;</span>
    </div>
    <div id="v2-welcome-banner" style="display:none;overflow:hidden;flex-shrink:0;margin:0 8px 6px;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600;color:var(--text);align-items:center;justify-content:flex-end;height:36px;box-sizing:border-box;box-shadow:0 1px 4px rgba(0,0,0,0.06);position:relative;z-index:5;background:var(--surface);">
      <span class="welcome-banner-text" style="white-space:nowrap;display:inline-block;"></span>
    </div>
    <div id="v2-level-banner"></div>
    <!-- Channel bar -->
    <div id="channel-bar"></div>
    <!-- Chat log -->
    <div id="chatlog">
      <div id="spacer"></div>
    </div>
    <!-- Roster -->
    <div id="roster">
      <div id="roster-header"><span>在线用户</span><span class="roster-count" id="roster-count">0</span></div>
    </div>
    <div id="roster-backdrop"></div>
    <div id="reconnect-banner">⚠ 连接已断开，正在尝试重新连接...</div>
    <div id="roster-toggle">&#128101;</div>
    <div id="typing-indicator"></div>
    <div id="reply-bar"></div>
    <button id="scroll-bottom-btn" type="button" title="滚动到底部">↓</button>
    <textarea id="chat-input" rows="1" placeholder="输入消息...（Shift+Enter 换行）" spellcheck="false"></textarea>
    <div id="md-toolbar" style="display:none;position:fixed;bottom:52px;left:12px;gap:4px;padding:4px;background:var(--surface);border:1px solid var(--border);border-radius:8px;z-index:25;align-items:center;">
      <span class="md-btn" data-wrap="**" style="cursor:pointer;padding:2px 6px;border-radius:4px;font-size:13px;font-weight:600;" title="加粗">B</span>
      <span class="md-btn" data-wrap="*" style="cursor:pointer;padding:2px 6px;border-radius:4px;font-size:13px;font-style:italic;" title="斜体"><em>I</em></span>
      <span class="md-btn" data-wrap="\\\`" style="cursor:pointer;padding:2px 6px;border-radius:4px;font-size:12px;font-family:monospace;" title="行内代码">&lt;/&gt;</span>
      <span class="md-btn" data-wrap="\\\`\\\`\\\`\\n" data-suffix="\\n\\\`\\\`\\\`" style="cursor:pointer;padding:2px 6px;border-radius:4px;font-size:11px;font-family:monospace;" title="代码块">{ }</span>
      <span class="md-btn" data-wrap="[" data-suffix="](url)" style="cursor:pointer;padding:2px 6px;border-radius:4px;font-size:12px;" title="链接">🔗</span>
    </div>
    <button id="emoji-btn" type="button">😊</button>
    <button id="more-toggle-btn" type="button" title="更多工具">➕</button>
    <div id="emoji-panel"></div>
    <div id="input-toolbar-expanded">
      <button class="tb-btn" id="files-btn" type="button" title="附件管理">🗂️</button>
      <button class="tb-btn" id="schedule-btn" type="button" title="定时消息">⏰</button>
      <button class="tb-btn" id="kw-btn" type="button" title="关键词提醒">🔔</button>
      <button class="tb-btn" id="poll-btn" type="button" title="创建投票">📊</button>
      <button class="tb-btn" id="md-toggle-btn" type="button" title="Markdown 工具栏">T</button>
    </div>
    <div id="mention-dropdown"></div>
    <button id="voice-btn" type="button" title="语音消息">🎤</button>
    <button id="image-btn" type="button">图片</button>
    <input type="file" id="image-picker" accept="image/*" style="display:none">
    <button id="file-btn" type="button">📎 文件</button>
    <input type="file" id="file-picker" style="display:none">
    <div id="upload-progress" style="display:none;position:fixed;bottom:60px;left:12px;right:12px;height:4px;background:#e0e0e0;border-radius:2px;overflow:hidden;z-index:20;">
      <div id="upload-progress-bar" style="height:100%;width:0%;background:var(--primary);border-radius:2px;transition:width 0.2s;"></div>
    </div>
  </form>
  <!-- User Menu -->
  <div id="user-menu">
    <div class="user-menu-header" id="user-menu-name">用户</div>
    <div class="user-menu-item" data-action="at">@ 提及</div>
    <div class="user-menu-item" data-action="dm">💬 私信</div>
    <div class="user-menu-item danger" data-action="kick">👢 踢出</div>
    <div class="user-menu-item danger" data-action="mute">🔇 禁言</div>
    <div class="user-menu-item danger" data-action="ban">🚫 封禁</div>
    <div class="user-menu-item danger" data-action="banip">🔨 封禁IP</div>
    <div class="user-menu-item" data-action="batch-kick">👢 批量踢出</div>
    <div class="user-menu-item" data-action="note">📝 备注</div>
    <div class="user-menu-item" data-action="pay">💰 转账积分</div>
    <div class="user-menu-item" data-action="tag">🏷️ 修改标签</div>
    <div class="user-menu-item" data-action="block">🚫 屏蔽</div>
    <div class="user-menu-item" data-action="unblock" style="display:none">✅ 取消屏蔽</div>
    <div class="user-menu-item" data-action="profile" style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px;">👤 用户主页</div>
  </div>
  <!-- Profile Modal -->
  <div id="profile-modal" style="display:none">
    <div id="profile-backdrop" onclick="hideProfile()"></div>
    <div id="profile-box">
      <div id="profile-close" onclick="hideProfile()">&times;</div>
      <div id="profile-content">加载中...</div>
    </div>
  </div>
  <!-- DM Panel -->
  <div id="dm-panel">
    <div id="dm-header">
      <span id="dm-username">私信</span>
      <span id="dm-close" onclick="closeDM()">&times;</span>
    </div>
    <div id="dm-log">
      <div class="dm-system">选择用户后开始私信</div>
    </div>
    <div id="dm-input-area">
      <input id="dm-input" placeholder="输入消息...">
      <button id="dm-send" type="button" onclick="sendDM()">发送</button>
    </div>
  </div>
  <!-- Favorites Panel -->
  <div id="favorites-panel">
    <div id="fav-header">
      <span>⭐ 收藏的消息</span>
      <span id="fav-close">&times;</span>
    </div>
    <div class="fav-list"></div>
  </div>
  <!-- Lightbox -->
  <div id="lightbox">
    <span class="lb-close">&times;</span>
    <span id="gallery-prev" style="display:none;position:fixed;left:20px;top:50%;transform:translateY(-50%);font-size:48px;color:#fff;cursor:pointer;user-select:none;z-index:1001;opacity:0.7;text-shadow:0 2px 8px rgba(0,0,0,0.5);">&lsaquo;</span>
    <span id="gallery-next" style="display:none;position:fixed;right:20px;top:50%;transform:translateY(-50%);font-size:48px;color:#fff;cursor:pointer;user-select:none;z-index:1001;opacity:0.7;text-shadow:0 2px 8px rgba(0,0,0,0.5);">&rsaquo;</span>
    <img id="lightbox-img" src="" alt="">
  </div>
  <!-- Floating Action Buttons -->
  <div id="chat-nav">
    <div id="sound-toggle" class="floating-btn" title="提示音">🔊</div>
    <div id="dark-toggle" class="floating-btn" title="暗色模式">🌙</div>
    <div id="search-toggle" class="floating-btn" title="搜索消息">🔍</div>
    <div id="settings-toggle" class="floating-btn" title="设置">⚙️</div>
    <div id="music-toggle" class="floating-btn" title="音乐播放器">🎵</div>
    <div id="more-menu-btn" class="floating-btn" title="更多">···</div>
    <div id="more-menu-backdrop"></div>
    <div id="more-menu-panel">
      <div class="more-menu-item" data-action="achievements"><span class="mm-icon">🏅</span><span class="mm-label">我的成就</span></div>
      <div class="more-menu-item" data-action="favorites"><span class="mm-icon">⭐</span><span class="mm-label">收藏的消息</span></div>
      <div class="more-menu-item" data-action="highlights"><span class="mm-icon">🏆</span><span class="mm-label">精华消息</span></div>
      <div class="more-menu-item" data-action="room-info"><span class="mm-icon">ℹ️</span><span class="mm-label">房间信息</span></div>
      <div class="more-menu-item" data-action="scheduler"><span class="mm-icon">⏰</span><span class="mm-label">定时消息</span></div>
      <div class="more-menu-item" data-action="changelog"><span class="mm-icon">📋</span><span class="mm-label">更新日志</span></div>
      <div class="more-menu-item" data-action="archive"><span class="mm-icon">📦</span><span class="mm-label">版本存档</span></div>
      <div class="more-menu-item" data-action="export"><span class="mm-icon">📥</span><span class="mm-label">导出聊天</span></div>
    </div>
    <!-- Mobile bottom bar -->
    <div id="mobile-bottom-bar">
      <button class="mbb-btn" id="mbb-sound" title="提示音">🔊</button>
      <button class="mbb-btn" id="mbb-dark" title="暗色模式">🌙</button>
      <button class="mbb-btn" id="mbb-search" title="搜索">🔍</button>
      <button class="mbb-btn" id="mbb-more" title="更多">···</button>
    </div>
  </div>
  <!-- Search Bar -->
  <div id="search-bar">
    <input id="search-input" placeholder="搜索消息..." autocomplete="off">
    <span id="search-count"></span>
    <button id="search-prev" type="button" title="上一个">▲</button>
    <button id="search-next" type="button" title="下一个">▼</button>
    <button id="search-close" type="button" title="关闭">&times;</button>
  </div>
  <!-- Settings Overlay -->
  <div id="settings-overlay" style="display:none">
    <div class="settings-card">
      <div class="settings-header">
        <span>⚙️ 设置</span>
        <button class="settings-close" onclick="closeSettings()">&times;</button>
      </div>
      <div class="settings-content">
        <div class="settings-item">
          <div class="settings-label"><span>🎨 主题</span></div>
          <div id="theme-picker">
            <button type="button" class="theme-card" data-theme="classic"><span class="theme-card-icon">🎨</span><span>经典</span></button>
            <button type="button" class="theme-card" data-theme="liquid"><span class="theme-card-icon">💧</span><span>液态玻璃</span></button>
            <button type="button" class="theme-card" data-theme="flat"><span class="theme-card-icon">📐</span><span>扁平化</span></button>
            <button type="button" class="theme-card" data-theme="neon"><span class="theme-card-icon">🌌</span><span>深空霓虹</span></button>
            <button type="button" class="theme-card" data-theme="hacknet"><span class="theme-card-icon">🖥️</span><span>Hacknet</span></button>
          </div>
        </div>
        <div class="settings-item">
          <div class="settings-label"><span>语言</span></div>
          <div style="display:flex;gap:8px;margin-top:6px">
            <button id="lang-zh" type="button" class="settings-btn-secondary">中文</button>
            <button id="lang-en" type="button" class="settings-btn-secondary">English</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!-- Music Overlay -->
  <div id="music-overlay" style="display:none">
    <div class="music-card">
      <div class="music-header">
        <span>🎵 音乐播放器</span>
        <button class="music-close" onclick="closeMusic()">&times;</button>
      </div>
      <div class="music-search-bar">
        <input id="music-search-input" placeholder="搜索歌曲或歌手..." autocomplete="off">
        <button id="music-search-btn" type="button">搜索</button>
      </div>
      <div class="music-results" id="music-results">
        <div class="music-empty">输入歌曲名开始搜索</div>
      </div>
      <div class="music-player" id="music-player" style="display:none">
        <div class="music-player-info">
          <img id="music-cover" src="" alt="" onerror="this.style.visibility='hidden'">
          <div class="music-player-text">
            <div id="music-now-name">未播放</div>
            <div id="music-now-artist"></div>
          </div>
        </div>
        <div class="music-progress">
          <span id="music-time-current">0:00</span>
          <input type="range" id="music-progress-bar" min="0" max="100" value="0" step="0.1">
          <span id="music-time-total">0:00</span>
        </div>
        <div class="music-controls">
          <button id="music-prev" type="button" title="上一首">⏮</button>
          <button id="music-play" type="button" title="播放/暂停">▶</button>
          <button id="music-next" type="button" title="下一首">⏭</button>
        </div>
      </div>
    </div>
  </div>
  <!-- Modal mount point for Vue3 overlays -->
  <div id="chat-modals"></div>
  <script type="module">
    import { initV2App } from '/static/app.js';
    import { openSettings } from '/static/modules/settings.override.js';
    import { closeSettings } from '/static/modules/settings.override.js';
    import { toggleSearch, doSearch, searchPrev, searchNext } from '/static/modules/search.override.js';
    import { toggleEmojiPanel } from '/static/modules/emoji-panel.override.js';
    import { openRoomInfo } from '/static/modules/roominfo.override.js';
    import { openDM, closeDM } from '/static/modules/dm.override.js';
    import { renderAchievementsPanel } from '/static/modules/achievements.override.js';
    import { initKeyboardShortcuts } from '/static/modules/keyboard.override.js';
    import { initNav } from '/static/modules/nav.override.js';
    import { initMusic, closeMusic } from '/static/modules/music.override.js';
    import { hideProfile } from '/static/modules/profile.override.js';
    import { exportChatLog } from '/static/modules/ui.override.js';
    window.__v2_openSettings = openSettings;
    window.__v2_closeSettings = closeSettings;
    window.__v2_toggleSearch = toggleSearch;
    window.__v2_doSearch = doSearch;
    window.__v2_searchPrev = searchPrev;
    window.__v2_searchNext = searchNext;
    window.__v2_toggleEmoji = toggleEmojiPanel;
    window.__v2_openRoomInfo = openRoomInfo;
    window.__v2_openDM = openDM;
    window.__v2_closeDM = closeDM;
    window.__v2_renderAchievements = renderAchievementsPanel;
    window.__v2_initKeyboardShortcuts = initKeyboardShortcuts;
    window.__v2_initNav = initNav;
    window.__v2_initMusic = initMusic;
    window.__v2_closeMusic = closeMusic;
    window.__v2_hideProfile = hideProfile;
    window.__v2_exportChatLog = exportChatLog;
    initV2App();
  </script>
</body>
</html>`;
