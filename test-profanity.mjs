// 🧪 v1.60 敏感词回归测试：
//   - 基础词根精确匹配（fuck/shit/sb/cnm/傻逼/草泥马 等）拦截
//   - leetspeak 变体（sh1t/f0ck/f*ck/wunw 等）已移除，不再拦截（命令兼容优先）
//   - 纯数字 "58" 组合放行
//   - 正常英文/中文不误伤
// 用法：node test-profanity.mjs
import { containsProfanityImpl } from "./src/chatroom/permissions.mjs";

const cases = [
  // ===== 纯数字 58 回归：必须全部放行 =====
  ["msg-58", false, "纯数字 58 组合放行"],
  ["m-58", false, "同上"],
  ["58", false, "纯 58 放行"],
  ["msg-57", false, "57 正常"],
  ["msg-59", false, "59 正常"],
  ["msg-60", false, "60 正常"],
  ["我今年58岁", false, "中文里带 58 放行"],

  // ===== leetspeak 变体现已移除拦截（命令兼容优先）=====
  ["sh1t", false, "sh1t 放行（leetspeak已移除）"],
  ["5h1t", false, "5h1t 放行（leetspeak已移除）"],
  ["5h17", false, "5h17 放行（leetspeak已移除）"],
  ["5h2t", false, "5h2t 放行（leetspeak已移除）"],
  ["sh17", false, "sh17 放行（leetspeak已移除）"],

  // ===== leetspeak 变体现已移除拦截 =====
  ["f0ck", false, "f0ck 放行（leetspeak已移除）"],
  ["f*ck", false, "f*ck 放行（leetspeak已移除）"],
  ["f--ck", false, "f--ck 放行（leetspeak已移除）"],
  ["F*Ck", false, "F*Ck 放行（leetspeak已移除）"],
  ["f  uck", true, "f  空格 uck 拦（基础空格过滤仍有效）"],
  ["f u c k", true, "f u c k 拦（基础空格过滤仍有效）"],
  ["fμck", true, "fμck 拦（希腊字母μ→u归一化保留）"],

  // ===== 用户给的绕过词 ③：wunw 同形旋转 =====
  ["wcnm", true, "wcnm 拦（词根本体）"],
  ["wunw", false, "wunw 放行（leetspeak已移除）"],

  // ===== 常规中文脏词：必须拦 =====
  ["sb", true, "sb 拦"],
  ["傻逼", true, "傻逼 拦"],
  ["草泥马", true, "草泥马 拦"],
  ["cnm", true, "cnm 拦"],
  ["qnmlgb", true, "qnmlgb 拦"],
  ["wqnmlgb", true, "wqnmlgb 拦"],

  // ===== 边界：拼音缩写独立成词才拦，嵌入正常词放行 =====
  ["is by", false, "is by 放行（防 isby 含 sb 跨词误伤）"],
  ["usb", false, "usb 放行（sb 嵌入正常词）"],
  ["isby", false, "isby 放行（连续但非独立成词）"],
  ["abc", false, "abc 放行"],
  ["abs", false, "abs 放行"],
  ["这sb", true, "这sb 拦（独立 sb 中文边界）"],
  ["sb?", true, "sb? 拦"],
  ["wcnm 你", true, "wcnm 你 拦"],
  ["fucking", true, "fucking 拦（英文词根容忍派生）"],
  ["shits", true, "shits 拦"],

  // ===== 防误伤：命令/中文组合必须放行（\W 误把中文当标点顶替字母）=====
  ["/w 游客9933 你好", false, "命令中文用户名不误伤（原 \"游\" 被当标点→nmb 命中）"],
  ["游客9933", false, "中文+数字组合不误伤"],
  ["你好 游客9933", false, "中文文本不误伤"],
  ["/lp user 游客9933 permissions set chat.admin.kickUser true", false, "LP命令中文用户名不误伤"],
  ["这个项目游客9933", false, "中文句子含数字不误伤"],

  // ===== 防误伤：正常文本必须放行 =====
  ["hello", false, "hello 放行"],
  ["the best", false, "the best 放行"],
  ["the best-", false, "the best- 放行（防 s- 误伤）"],
  ["this is a test", false, "this is a test 放行"],
  ["shot", false, "shot 放行（s-h-o-t 不是 sh1t）"],
  ["shut", false, "shut 放行"],
  ["she", false, "she 放行"],
  ["as she", false, "as she 放行（防 asshole 误伤）"],
  ["c n m", true, "c n m 拦（cnm 拆分躲写，该拦）"],
  ["window", false, "window 放行"],
  ["sunshine", false, "sunshine 放行"],
  ["sea", false, "sea 放行"],
  ["school", false, "school 放行"],
  ["food", false, "food 放行"],
  ["bitch", true, "bitch 拦"],
  ["这个项目 58 项", false, "正常中文+58 放行"],
];

let pass = 0, fail = 0;
const fails = [];
for (const [text, expected, label] of cases) {
  const got = containsProfanityImpl(text);
  if (got === expected) {
    pass++;
    console.log("✅", label, JSON.stringify(text), "→", got);
  } else {
    fail++;
    fails.push([text, expected, got, label]);
    console.log("❌", label, JSON.stringify(text), "→", got, "期望", expected);
  }
}
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
