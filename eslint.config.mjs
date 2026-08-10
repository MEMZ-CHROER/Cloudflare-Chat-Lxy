// v1.57 工具链：ESLint 温和配置（flat config）
// 原则：只开「语法/真 bug」类高价值规则（no-undef/no-redeclare/eqeqeq 等），风格类全部关闭交给 prettier。
// no-unused-vars 设 warn + ^_ 豁免历史遗留未用变量，不一次性清理。
// ignores：旧版独立大 bundle + vendor（vue.js）+ renderers.js（NUL 已清后可移除该行）。
import globals from 'globals';

export default [
  {
    ignores: [
      '**/node_modules/**',
      'src/chat.js',
      'src/admin.js',
      'src/client/admin/vendor/**',
      'src/client/chat/vendor/**',
    ],
  },
  {
    files: ['src/**/*.mjs', 'src/client/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.worker,  // fetch/Response/Request/URL/atob/btoa/crypto/console/setTimeout...
        ...globals.browser, // window/document/alert/confirm/prompt/Image/Audio/MediaRecorder/getComputedStyle/IntersectionObserver...
        // CDN 引入的第三方全局
        katex: 'readonly', hljs: 'readonly',
        // Cloudflare Workers 特有（browser/worker 未覆盖）
        caches: 'readonly', WebSocketPair: 'readonly', DurableObjectState: 'readonly',
        HTMLRewriter: 'readonly', crypto: 'readonly',
        // main.js 向 window 注册的全局入口（其他模块直接调用，无 import）
        openShop: 'readonly', closeShop: 'readonly', openLottery: 'readonly', closeLottery: 'readonly',
        openTasks: 'readonly', closeTasks: 'readonly', openGames: 'readonly', closeGames: 'readonly',
        openSeason: 'readonly', closeSeason: 'readonly', openMarket: 'readonly', closeMarket: 'readonly',
        closeRelations: 'readonly', toggleSearch: 'readonly', closeDM: 'readonly', sendDM: 'readonly',
        hideProfile: 'readonly', exportChatLog: 'readonly', openSettings: 'readonly', closeSettings: 'readonly',
        openMusic: 'readonly', closeMusic: 'readonly', showUserMenu: 'readonly', openKb: 'readonly',
      },
    },
    rules: {
      // —— 真 bug 类（error）——
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-cond-assign': ['error', 'except-parens'],
      'no-constant-condition': ['error', { checkLoops: 'allExceptWhileTrue' }],
      'no-dupe-keys': 'error',
      'no-dupe-class-members': 'error',
      'no-import-assign': 'error',
      'no-obj-calls': 'error',
      'no-func-assign': 'error',
      'no-unsafe-finally': 'error',
      'no-unsafe-negation': 'error',
      'no-implied-eval': 'error',
      'no-new-native-nonconstructor': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      // eqeqeq 关闭：现有代码大量 == 判断（含 null 比较），风格交由 prettier/后续渐进，避免 200+ 噪音
      'eqeqeq': 'off',
      // —— 未使用/空块（warn，逐步清理）——
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'warn',
      // —— 风格类一律关闭，交给 prettier ——
      'indent': 'off', 'quotes': 'off', 'semi': 'off',
      'comma-dangle': 'off', 'max-len': 'off',
      'space-before-function-paren': 'off', 'no-multiple-empty-lines': 'off',
    },
  },
];
