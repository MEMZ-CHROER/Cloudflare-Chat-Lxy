// 生成聊天室 favicon.ico（32x32，32bit BGRA）— 蓝底圆角方形 + 白色 C（与 icon.svg 风格一致）
// 用法: node scripts/gen-favicon.mjs  → 输出 src/favicon.ico 并打印 base64（供 favicon-data.js 内嵌）
import { writeFileSync } from "node:fs";

const S = 32;

// 圆角方形（背景）
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : (x > x1 - r ? x1 - r : x);
  const cy = y < y0 + r ? y0 + r : (y > y1 - r ? y1 - r : y);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// 字母 C：圆环（外径 8.5 内径 4.5）开口在右侧
function inC(x, y) {
  const dx = x - 16.5, dy = y - 16.5;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 4.5 || d > 8.5) return false;
  const ang = Math.atan2(dy, dx);
  if (ang > -0.55 && ang < 0.55) return false; // 右侧开口
  return true;
}

// 像素 bottom-up（ICO 行序从下到上），BGRA
const px = Buffer.alloc(S * S * 4);
for (let row = 0; row < S; row++) {
  const y = S - 1 - row;
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    if (inRoundRect(x, y, 1, 1, 30, 30, 7)) {
      r = 74; g = 108; b = 247; a = 255; // #4a6cf7
      if (inC(x, y)) { r = 255; g = 255; b = 255; a = 255; }
    }
    const idx = (row * S + x) * 4;
    px[idx] = b; px[idx + 1] = g; px[idx + 2] = r; px[idx + 3] = a;
  }
}

// AND mask：32bit 用 alpha 通道，全 0
const andMask = Buffer.alloc(Math.ceil((S * S) / 8));

// ICONDIR + ICONDIRENTRY
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);      // reserved
header.writeUInt16LE(1, 2);      // type = icon
header.writeUInt16LE(1, 4);      // count = 1
header[6] = S; header[7] = S;    // 32x32
header[8] = 0; header[9] = 0;    // palette / reserved
header.writeUInt16LE(1, 10);     // planes
header.writeUInt16LE(32, 12);    // bitcount
header.writeUInt32LE(40 + px.length + andMask.length, 14); // bytes in resource
header.writeUInt32LE(22, 18);    // offset

// BITMAPINFOHEADER
const bm = Buffer.alloc(40);
bm.writeUInt32LE(40, 0);           // biSize
bm.writeInt32LE(S, 4);             // biWidth
bm.writeInt32LE(S * 2, 8);         // biHeight（xor + and）
bm.writeUInt16LE(1, 12);           // biPlanes
bm.writeUInt16LE(32, 14);          // biBitCount
bm.writeUInt32LE(0, 16);           // biCompression = BI_RGB
bm.writeUInt32LE(px.length, 20);   // biSizeImage

const ico = Buffer.concat([header, bm, px, andMask]);
const icoPath = new URL("../src/favicon.ico", import.meta.url);
writeFileSync(icoPath, ico);
// 生成内嵌 base64 模块供 index.mjs 使用（Workers 无法读文件系统，只能 import 资源）
const b64 = ico.toString("base64");
// 注意：必须用 .mjs 后缀——主仓 package.json 无 type:module，.js 会被 esbuild 当 CJS，
// `export default "长base64"` 经 interop 后变成对象而非字符串，atob 会报 invalid base64
const jsPath = new URL("../src/favicon-data.mjs", import.meta.url);
writeFileSync(jsPath, "// 聊天室 favicon.ico（32x32，32bit BGRA）base64 —— 由 scripts/gen-favicon.mjs 自动生成，勿手改\n" +
  "export default " + JSON.stringify(b64) + ";\n");
console.log("favicon.ico 生成:", ico.length, "bytes -> src/favicon.ico + src/favicon-data.mjs");
