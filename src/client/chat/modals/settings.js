// v1.53 设置弹窗 — Vue3 重写（批0 范式弹窗）
// 本文件只是 UI 绑定层：背景/磨砂/色调/壁纸/主题的纯逻辑全部复用 settings.js 导出，
// 保证与旧 overlay 行为完全一致；弹窗壳由 modal-manager 提供，本文件只注入自身布局样式。
// 语言响应式：监听 window 'langchange' 事件（setLang 触发）刷新 labels，无需把整个 state 引入 Vue。
import * as Vue from '/static/chat/vendor/vue.js';
import { t, getLang, setLang, showInfo, showError } from '../state.js';
import { injectCss } from '../modal-manager.js';
import {
  applyBgTint, applyBgBlur, applyUiColor, resetUiColor,
  applyWallpaper, restoreRandomWallpaper, applyVideoWallpaper, cancelVideoWallpaper,
  applyTheme, applyCustomThemeVars,
  CUSTOM_DEFAULTS, loadCustomTheme, saveCustomTheme, removeCustomThemeVars,
} from '../settings.js';

injectCss('cm-style-settings', `
.cm-settings { display: flex; flex-direction: column; min-width: min(420px, 88vw); }
.cm-settings-content { padding: 20px; overflow-y: auto; }
.cm-item { margin-bottom: 18px; }
.cm-item-label { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 14px; font-weight: 600; margin-bottom: 10px; }
.cm-item-value { font-size: 13px; color: var(--primary); font-weight: 700; }
.cm-hint { font-size: 12px; color: var(--text-secondary); margin-top: 8px; line-height: 1.5; }
.cm-theme-picker { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.cm-range { width: 100%; height: 6px; -webkit-appearance: none; appearance: none; background: var(--border); border-radius: 3px; outline: none; cursor: pointer; }
.cm-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 50%; background: var(--primary); border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.2); cursor: pointer; }
.cm-range::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: var(--primary); border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.2); cursor: pointer; }
.cm-input-row { display: flex; gap: 8px; margin-bottom: 8px; }
.cm-input-row input { flex: 1; min-width: 0; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--input-ink); font-size: 13px; outline: none; font-family: inherit; }
.cm-input-row input:focus { border-color: var(--primary); }
.cm-input-row button { padding: 8px 14px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
.cm-input-row button:hover { background: var(--primary-dark); }
.cm-btn-secondary { padding: 8px 14px; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; }
.cm-btn-secondary:hover { border-color: var(--primary); color: var(--primary); }
.cm-btn-active { border-color: var(--primary) !important; color: var(--primary) !important; background: rgba(var(--primary-rgb), 0.1); }
.cm-btn-danger { padding: 6px 12px; background: none; color: #e74c3c; border: 1px solid #e74c3c; border-radius: 8px; font-size: 12px; cursor: pointer; font-family: inherit; }
.cm-btn-danger:hover { background: rgba(231,76,60,0.12); }
.cm-lang-row { display: flex; gap: 8px; margin-top: 6px; }
.cm-color-row { display: flex; align-items: center; gap: 10px; }
.cm-color-row input[type="color"] { width: 44px; height: 28px; padding: 0; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-2); cursor: pointer; }
.cm-color-hint { font-size: 12px; color: var(--text-secondary); }
.cm-settings .ct-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; }
.cm-settings .ct-row label { font-size: 13px; color: var(--text-secondary); }
.cm-settings .ct-row input[type="color"] { width: 44px; height: 28px; padding: 0; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-2); cursor: pointer; }
.cm-settings .ct-radius-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.cm-settings .ct-radius-row input[type="range"] { flex: 1; }
.cm-settings .ct-radius-val { min-width: 34px; text-align: right; color: var(--text-secondary); font-size: 13px; }
`);

const THEMES = [
  { key: 'classic', icon: '🎨', labelKey: 'themeClassic' },
  { key: 'liquid', icon: '💧', labelKey: 'themeLiquid' },
  { key: 'flat', icon: '📐', labelKey: 'themeFlat' },
  { key: 'neon', icon: '🌌', labelKey: 'themeNeon' },
  { key: 'hacknet', icon: '🖥️', labelKey: 'themeHacknet' },
  { key: 'custom', icon: '✏️', labelKey: 'themeCustom' },
];

export default {
  name: 'SettingsModal',
  setup() {
    // ---- 语言响应式 ----
    const langTick = Vue.ref(0);
    const lang = Vue.ref(getLang());
    window.addEventListener('langchange', () => { langTick.value++; lang.value = getLang(); });
    const labels = Vue.computed(() => {
      void langTick.value;
      return {
        settings: t('settings'), theme: t('theme'), themeHint: t('themeHint'),
        themeClassic: t('themeClassic'), themeLiquid: t('themeLiquid'), themeFlat: t('themeFlat'),
        themeNeon: t('themeNeon'), themeHacknet: t('themeHacknet'), themeCustom: t('themeCustom'),
        customTheme: t('customTheme'), language: t('language'),
        bgOpacity: t('bgOpacity'), bgBlur: t('bgBlur'), uiColor: t('uiColor'),
        restoreDefault: t('restoreDefault'), customWallpaper: t('customWallpaper'),
        videoWallpaper: t('videoWallpaper'), restoreRandom: t('restoreRandom'),
        cancelWallpaper: t('cancelWallpaper'), apply: t('apply'),
        uploadImage: t('uploadImage'), uploadVideo: t('uploadVideo'),
        wallpaperHint: t('wallpaperHint'), videoHint: t('videoHint'),
        ctReset: t('ctReset'), ctPrimary: t('ctPrimary'), ctText: t('ctText'),
        ctTextSecondary: t('ctTextSecondary'), ctBg: t('ctBg'), ctBorder: t('ctBorder'),
        ctRadius: t('ctRadius'), ctMsgSelf: t('ctMsgSelf'), ctMsgOther: t('ctMsgOther'),
      };
    });

    // ---- 状态 ----
    const currentTheme = Vue.ref(localStorage.getItem('chatTheme') || 'classic');
    const custom = Vue.ref(loadCustomTheme() || { ...CUSTOM_DEFAULTS });
    const tint = Vue.ref(100);
    const blur = Vue.ref(18);
    const uiColor = Vue.ref('#ffffff');
    const uiHasColor = Vue.ref(false);
    const wpUrl = Vue.ref('');
    const vdUrl = Vue.ref('');
    const hasWp = Vue.ref(false);
    const hasVd = Vue.ref(false);

    // ---- 初始化当前值（对齐 openSettings 旧逻辑）----
    function readFrostedColor() {
      const cs = getComputedStyle(document.body);
      const toHex = (v, d) => (isNaN(Number(v)) ? d : Number(v)).toString(16).padStart(2, '0');
      return '#' + toHex(cs.getPropertyValue('--frosted-r').trim(), 255)
               + toHex(cs.getPropertyValue('--frosted-g').trim(), 255)
               + toHex(cs.getPropertyValue('--frosted-b').trim(), 255);
    }
    const savedTint = localStorage.getItem('bgTint');
    tint.value = Math.round((savedTint === null ? 1 : parseFloat(savedTint)) * 100);
    const savedBlur = localStorage.getItem('bgBlur');
    blur.value = savedBlur === null ? 18 : Number(savedBlur);
    const savedColor = localStorage.getItem('uiColor');
    uiHasColor.value = !!savedColor;
    uiColor.value = savedColor || readFrostedColor();
    wpUrl.value = localStorage.getItem('customWallpaper') || '';
    hasWp.value = !!localStorage.getItem('customWallpaper');
    vdUrl.value = localStorage.getItem('customVideo') || '';
    hasVd.value = !!localStorage.getItem('customVideo');

    // ---- 背景透明度 / 磨砂 ----
    function onTint(e) {
      const v = applyBgTint(Number(e.target.value) / 100);
      tint.value = Math.round(v * 100);
      localStorage.setItem('bgTint', String(v));
    }
    function onBlur(e) {
      const v = applyBgBlur(Number(e.target.value));
      blur.value = v;
      localStorage.setItem('bgBlur', String(v));
    }
    // ---- 界面色调 ----
    function onUiColor(e) {
      applyUiColor(e.target.value);
      uiColor.value = e.target.value;
      uiHasColor.value = true;
    }
    function onUiColorReset() {
      resetUiColor();
      uiHasColor.value = false;
      uiColor.value = readFrostedColor();
      showInfo(t('已恢复默认色调'));
    }
    // ---- 主题 ----
    function selectTheme(key) {
      currentTheme.value = key;
      if (key === 'custom') saveCustomTheme(custom.value);
      applyTheme(key);
      if (key === 'custom') {
        const loaded = loadCustomTheme();
        if (loaded) custom.value = loaded;
      }
    }
    // ---- 自定义主题 ----
    function onCustom(k, e) {
      custom.value[k] = e.target.value;
      saveCustomTheme(custom.value);
      applyCustomThemeVars(custom.value);
    }
    function onCustomRadius(e) {
      custom.value.radius = Number(e.target.value);
      saveCustomTheme(custom.value);
      applyCustomThemeVars(custom.value);
    }
    function onCustomReset() {
      localStorage.removeItem('customTheme');
      removeCustomThemeVars();
      custom.value = { ...CUSTOM_DEFAULTS };
      applyTheme('classic');
      currentTheme.value = 'classic';
    }
    // ---- 语言 ----
    function chooseLang(l) { setLang(l); }
    // ---- 自定义壁纸 ----
    function applyWpUrl() {
      const url = wpUrl.value.trim();
      if (!url) { showError(t('请输入图片 URL')); return; }
      applyWallpaper(url);
      hasWp.value = true;
      showInfo(t('壁纸已应用'));
    }
    function onWpFile(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        applyWallpaper(reader.result);
        hasWp.value = true;
        showInfo(t('本地图片壁纸已应用'));
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
    function restoreWp() {
      restoreRandomWallpaper();
      hasWp.value = false;
    }
    // ---- 视频壁纸 ----
    function applyVdUrl() {
      const url = vdUrl.value.trim();
      if (!url) { showError(t('请输入视频 URL')); return; }
      applyVideoWallpaper(url);
      hasVd.value = true;
      showInfo(t('视频壁纸已应用'));
    }
    function onVdFile(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        applyVideoWallpaper(reader.result);
        hasVd.value = true;
        showInfo(t('本地视频壁纸已应用'));
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
    function cancelVd() {
      cancelVideoWallpaper();
      hasVd.value = false;
      showInfo(t('已取消视频壁纸'));
    }
    // 关闭：emit 'close' 由 modal-manager 监听（closeModal），组件不直接依赖 settings.js 的 closeSettings
    return {
      THEMES, labels, currentTheme, custom, tint, blur, uiColor, uiHasColor,
      wpUrl, vdUrl, hasWp, hasVd, lang,
      onTint, onBlur, onUiColor, onUiColorReset, selectTheme,
      onCustom, onCustomRadius, onCustomReset, chooseLang,
      applyWpUrl, onWpFile, restoreWp, applyVdUrl, onVdFile, cancelVd,
    };
  },
  template: `
  <div class="cm-settings">
    <div class="cm-header">
      <span>⚙️ {{ labels.settings }}</span>
      <button class="cm-close" @click="$emit('close')" title="关闭">&times;</button>
    </div>
    <div class="cm-settings-content">
      <!-- 主题选择（v1.38）-->
      <div class="cm-item">
        <div class="cm-item-label"><span>{{ labels.theme }}</span></div>
        <div class="cm-theme-picker">
          <button v-for="th in THEMES" :key="th.key" type="button" class="theme-card"
            :class="{ 'theme-card-active': currentTheme === th.key }" @click="selectTheme(th.key)">
            <span class="theme-card-icon">{{ th.icon }}</span>
            <span>{{ labels[th.labelKey] }}</span>
          </button>
        </div>
        <p class="cm-hint">{{ labels.themeHint }}</p>
      </div>
      <!-- 自定义主题 -->
      <div class="cm-item" v-show="currentTheme === 'custom'">
        <div class="cm-item-label">
          <span>✏️ {{ labels.customTheme }}</span>
          <button type="button" class="cm-btn-danger" @click="onCustomReset">{{ labels.ctReset }}</button>
        </div>
        <div class="ct-row"><label>{{ labels.ctPrimary }}</label><input type="color" :value="custom.primary" @input="onCustom('primary', $event)"></div>
        <div class="ct-row"><label>{{ labels.ctText }}</label><input type="color" :value="custom.text" @input="onCustom('text', $event)"></div>
        <div class="ct-row"><label>{{ labels.ctTextSecondary }}</label><input type="color" :value="custom.textSecondary" @input="onCustom('textSecondary', $event)"></div>
        <div class="ct-row"><label>{{ labels.ctBg }}</label><input type="color" :value="custom.bg" @input="onCustom('bg', $event)"></div>
        <div class="ct-row"><label>{{ labels.ctBorder }}</label><input type="color" :value="custom.border" @input="onCustom('border', $event)"></div>
        <div class="ct-radius-row"><label>{{ labels.ctRadius }}</label><input type="range" min="4" max="24" :value="custom.radius" @input="onCustomRadius($event)"><span class="ct-radius-val">{{ custom.radius }}px</span></div>
        <div class="ct-row"><label>{{ labels.ctMsgSelf }}</label><input type="color" :value="custom.msgSelf" @input="onCustom('msgSelf', $event)"></div>
        <div class="ct-row"><label>{{ labels.ctMsgOther }}</label><input type="color" :value="custom.msgOther" @input="onCustom('msgOther', $event)"></div>
      </div>
      <!-- 语言 -->
      <div class="cm-item">
        <div class="cm-item-label"><span>{{ labels.language }}</span></div>
        <div class="cm-lang-row">
          <button type="button" class="cm-btn-secondary" :class="{ 'cm-btn-active': lang === 'zh' }" @click="chooseLang('zh')">中文</button>
          <button type="button" class="cm-btn-secondary" :class="{ 'cm-btn-active': lang === 'en' }" @click="chooseLang('en')">English</button>
        </div>
      </div>
      <!-- 背景透明度 -->
      <div class="cm-item">
        <div class="cm-item-label"><span>{{ labels.bgOpacity }}</span><span class="cm-item-value">{{ tint }}%</span></div>
        <input type="range" class="cm-range" min="0" max="100" :value="tint" @input="onTint">
        <p class="cm-hint">调整聊天背景磨砂层的透明度，数值越低背景图越清晰。</p>
      </div>
      <!-- 磨砂程度 -->
      <div class="cm-item">
        <div class="cm-item-label"><span>{{ labels.bgBlur }}</span><span class="cm-item-value">{{ blur }}px</span></div>
        <input type="range" class="cm-range" min="0" max="30" :value="blur" @input="onBlur">
        <p class="cm-hint">调整磨砂玻璃模糊强度，数值越大越模糊。</p>
      </div>
      <!-- 界面色调 -->
      <div class="cm-item">
        <div class="cm-item-label">
          <span>{{ labels.uiColor }}</span>
          <button v-show="uiHasColor" type="button" class="cm-btn-danger" @click="onUiColorReset">{{ labels.restoreDefault }}</button>
        </div>
        <div class="cm-color-row">
          <input type="color" :value="uiColor" @input="onUiColor">
          <span class="cm-color-hint">点击选择磨砂层底色</span>
        </div>
        <p class="cm-hint">自定义输入框、用户列表、聊天区的磨砂颜色。</p>
      </div>
      <!-- 自定义壁纸 -->
      <div class="cm-item">
        <div class="cm-item-label">
          <span>{{ labels.customWallpaper }}</span>
          <button v-show="hasWp" type="button" class="cm-btn-danger" @click="restoreWp">{{ labels.restoreRandom }}</button>
        </div>
        <div class="cm-input-row">
          <input v-model="wpUrl" placeholder="输入图片 URL" type="url">
          <button @click="applyWpUrl">{{ labels.apply }}</button>
        </div>
        <button type="button" class="cm-btn-secondary" @click="$refs.wpFile && $refs.wpFile.click()">{{ labels.uploadImage }}</button>
        <input ref="wpFile" type="file" accept="image/*" style="display:none" @change="onWpFile">
        <p class="cm-hint">{{ labels.wallpaperHint }}</p>
      </div>
      <!-- 视频壁纸 -->
      <div class="cm-item">
        <div class="cm-item-label">
          <span>{{ labels.videoWallpaper }}</span>
          <button v-show="hasVd" type="button" class="cm-btn-danger" @click="cancelVd">{{ labels.cancelWallpaper }}</button>
        </div>
        <div class="cm-input-row">
          <input v-model="vdUrl" placeholder="输入视频 URL" type="url">
          <button @click="applyVdUrl">{{ labels.apply }}</button>
        </div>
        <button type="button" class="cm-btn-secondary" @click="$refs.vdFile && $refs.vdFile.click()">{{ labels.uploadVideo }}</button>
        <input ref="vdFile" type="file" accept="video/*" style="display:none" @change="onVdFile">
        <p class="cm-hint">{{ labels.videoHint }}</p>
      </div>
    </div>
  </div>`
};
