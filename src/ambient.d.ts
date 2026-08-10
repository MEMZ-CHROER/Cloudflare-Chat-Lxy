// v1.57 工具链：ambient 声明（CF Workers 特有全局 + wrangler Data 模块 import）
// 注意：不与 src/types.js 同基名（types.d.ts 会拦截 types.js 的 JSDoc 类型解析）

// CF Workers 特有全局（DOM lib 缺失）
declare var WebSocketPair: any;
declare var caches: any;
declare var HTMLRewriter: any;
declare var DurableObjectState: any;

// CDN 引入的第三方全局（chat.html script 注入）
declare var katex: any;
declare var hljs: any;

// Response 的 CF 扩展 webSocket 属性（WS Upgrade 响应）
interface ResponseInit { webSocket?: any; }

// wrangler 把 *.html/*.css/*.svg 作为 Data 模块（字符串 import）
declare module "*.html" { const s: string; export default s; }
declare module "*.css" { const s: string; export default s; }
declare module "*.svg" { const s: string; export default s; }
