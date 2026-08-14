// 🧪 v1.60 敏感词 leetspeak 误伤回归测试：纯数字 "58" 放行，真实 leetspeak/中文脏词仍拦
// 用法：node test-profanity.mjs
import assert from "node:assert";
import { containsProfanityImpl } from "./src/chatroom/permissions.mjs";

const cases = [
  // [内容, 期望是否命中, 说明]
  ["msg-58", false, "纯数字 58 组合放行（原误伤：5→s 8→b 命中 sb）"],
  ["m-58", false, "同上"],
  ["58", false, "纯 58 放行"],
  ["msg-57", false, "57 正常"],
  ["msg-59", false, "59 正常"],
  ["msg-60", false, "60 正常"],
  ["我今年58岁", false, "中文里带 58 放行"],
  ["sh1t", true, "sh1t 仍拦"],
  ["f0ck", true, "f0ck 仍拦"],
  ["sb", true, "sb 仍拦"],
  ["5b", true, "5b 仍拦（含字母）"],
  ["s8", true, "s8 仍拦（含字母）"],
  ["傻逼", true, "中文脏词仍拦"],
  ["草泥马", true, "草泥马仍拦"],
  ["cnm", true, "cnm 仍拦"],
  ["hello", false, "正常放行"],
];

let pass = 0, fail = 0;
for (const [text, expected, label] of cases) {
  const got = containsProfanityImpl(text);
  if (got === expected) {
    pass++;
    console.log("✅", label, JSON.stringify(text), "→", got);
  } else {
    fail++;
    console.log("❌", label, JSON.stringify(text), "→", got, "期望", expected);
  }
}
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
