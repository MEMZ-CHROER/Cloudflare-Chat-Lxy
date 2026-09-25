#!/usr/bin/env node
/**
 * v2 smoke test — verifies v2 worker can deploy and basic structure is valid.
 * Run: node scripts/v2-smoke-test.mjs [worker-name] [domain]
 */

const workerName = process.argv[2] || "cloudflare-workers-chat-v2";
const domain = process.argv[3] || "chatnew.dslirc.indevs.in";

console.log("=== v2 Smoke Test ===");
console.log(`Worker: ${workerName}`);
console.log(`Domain: ${domain}`);
console.log("");

// Test 1: Check if v2 files exist
const fs = await import("fs");
const path = await import("path");

const v2Files = [
  "src/v2/index.mjs",
  "src/v2/chatroom.override.mjs",
  "src/v2/utils.override.mjs",
  "src/v2/client/store/store.js",
  "src/v2/client/app.js",
  "src/v2/client/modules/auto-discover.js",
  "src/v2/client/views/chat-shell.js",
  "src/v2/client/views/v2-chat.html",
  "src/v2/http.mjs",
  "src/core/chatroom.mjs",
  "src/core/utils.mjs",
  "src/core/registry.mjs",
  "wrangler.v2.toml",
];

console.log("Test 1: File existence");
let allExist = true;
for (const f of v2Files) {
  const exists = fs.existsSync(f);
  console.log(`  ${exists ? "✓" : "✗"} ${f}`);
  if (!exists) allExist = false;
}
if (!allExist) {
  console.error("\n❌ FAIL: Missing v2 files");
  process.exit(1);
}
console.log("  PASS: All v2 files present\n");

// Test 2: Check wrangler.v2.toml has correct entrypoint
console.log("Test 2: wrangler.v2.toml configuration");
const wranglerV2 = fs.readFileSync("wrangler.v2.toml", "utf8");
const hasEntrypoint = wranglerV2.includes('main = "src/v2/index.mjs"');
const hasRoute = wranglerV2.includes("chatnew.dslirc.indevs.in");
console.log(`  ${hasEntrypoint ? "✓" : "✗"} Entrypoint: src/v2/index.mjs`);
console.log(`  ${hasRoute ? "✓" : "✗"} Route: chatnew.dslirc.indevs.in`);
if (!hasEntrypoint || !hasRoute) {
  console.error("\n❌ FAIL: wrangler.v2.toml misconfigured");
  process.exit(1);
}
console.log("  PASS\n");

// Test 3: Verify override pattern
console.log("Test 3: Override pattern validation");
const overrideContent = fs.readFileSync("src/v2/chatroom.override.mjs", "utf8");
const extendsCore = overrideContent.includes("extends CoreChatRoom");
const reExports = overrideContent.includes("export {") && overrideContent.includes("../core/chatroom.mjs");
console.log(`  ${extendsCore ? "✓" : "✗"} ChatRoom extends core`);
console.log(`  ${reExports ? "✓" : "✗"} Re-exports from core`);
if (!extendsCore || !reExports) {
  console.error("\n❌ FAIL: Override pattern incorrect");
  process.exit(1);
}
console.log("  PASS\n");

// Test 4: Store has required methods
console.log("Test 4: Store API validation");
const storeContent = fs.readFileSync("src/v2/client/store/store.js", "utf8");
const hasSubscribe = storeContent.includes("export function subscribe");
const hasSet = storeContent.includes("export function set");
const hasPatch = storeContent.includes("export function patch");
const hasGetState = storeContent.includes("export const getState");
console.log(`  ${hasSubscribe ? "✓" : "✗"} subscribe()`);
console.log(`  ${hasSet ? "✓" : "✗"} set()`);
console.log(`  ${hasPatch ? "✓" : "✗"} patch()`);
console.log(`  ${hasGetState ? "✓" : "✗"} getState()`);
if (!hasSubscribe || !hasSet || !hasPatch || !hasGetState) {
  console.error("\n❌ FAIL: Store missing required methods");
  process.exit(1);
}
console.log("  PASS\n");

// Test 5: V2 envelope utilities exist
console.log("Test 5: V2 envelope utilities");
const utilsContent = fs.readFileSync("src/v2/utils.override.mjs", "utf8");
const hasEnvelope = utilsContent.includes("v2Envelope");
const hasParse = utilsContent.includes("parseV2Envelope");
console.log(`  ${hasEnvelope ? "✓" : "✗"} v2Envelope()`);
console.log(`  ${hasParse ? "✓" : "✗"} parseV2Envelope()`);
if (!hasEnvelope || !hasParse) {
  console.error("\n❌ FAIL: V2 envelope utilities missing");
  process.exit(1);
}
console.log("  PASS\n");

// Test 6: Client app initializes correctly
console.log("Test 6: Client app structure");
const appContent = fs.readFileSync("src/v2/client/app.js", "utf8");
const hasInit = appContent.includes("export function initV2Client");
const hasWSConnect = appContent.includes("connectWebSocket");
const hasEnvelopeParse = appContent.includes("parseV2Envelope");
console.log(`  ${hasInit ? "✓" : "✗"} initV2Client()`);
console.log(`  ${hasWSConnect ? "✓" : "✗"} connectWebSocket()`);
console.log(`  ${hasEnvelopeParse ? "✓" : "✗"} parseV2Envelope()`);
if (!hasInit || !hasWSConnect || !hasEnvelopeParse) {
  console.error("\n❌ FAIL: Client app missing required functions");
  process.exit(1);
}
console.log("  PASS\n");

// Test 7: HTML view exists and references correct modules
console.log("Test 7: V2 HTML view");
const htmlContent = fs.readFileSync("src/v2/client/views/v2-chat.html", "utf8");
const hasModuleScript = htmlContent.includes('type="module"');
const importsApp = htmlContent.includes("app.js");
const importsShell = htmlContent.includes("chat-shell.js");
console.log(`  ${hasModuleScript ? "✓" : "✗"} ES module script`);
console.log(`  ${importsApp ? "✓" : "✗"} Imports app.js`);
console.log(`  ${importsShell ? "✓" : "✗"} Imports chat-shell.js`);
if (!hasModuleScript || !importsApp || !importsShell) {
  console.error("\n❌ FAIL: V2 HTML view incorrect");
  process.exit(1);
}
console.log("  PASS\n");

// Test 8: HTTP handler routes v2 paths correctly
console.log("Test 8: V2 HTTP handler");
const httpContent = fs.readFileSync("src/v2/http.mjs", "utf8");
const routesV2 = httpContent.includes('url.pathname === "/v2"');
const fallsThrough = httpContent.includes("coreHandleHttp");
const servesStatic = httpContent.includes("/v2/static/");
console.log(`  ${routesV2 ? "✓" : "✗"} Routes /v2 path`);
console.log(`  ${fallsThrough ? "✓" : "✗"} Falls through to core`);
console.log(`  ${servesStatic ? "✓" : "✗"} Serves /v2/static/ assets`);
if (!routesV2 || !fallsThrough || !servesStatic) {
  console.error("\n❌ FAIL: V2 HTTP handler incorrect");
  process.exit(1);
}
console.log("  PASS\n");

console.log("=== All smoke tests PASSED ===");
console.log("");
console.log("Next steps:");
console.log("1. Deploy v2 worker: wrangler deploy --config wrangler.v2.toml");
console.log("2. Verify DNS: chatnew.dslirc.indevs.in points to worker");
console.log("3. Test: open https://chatnew.dslirc.indevs.in/v2 in browser");
console.log("4. Verify WS connection and message flow");
console.log("5. Run v1 smoke test to confirm no regression: node scripts/v158-offline-live.mjs");
