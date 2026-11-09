# 2026-08-02 安全修复缓存笔记（compact 恢复用）

## 一、任务状态
- 已完成：5 路审计 agent → bugReport202682.txt（高危6+中危23+低危37）
- 用户指定修复：**H1-H3, H5-H6** + **M1-M3, M5-M7, M11-M15, M17** + **M18-M23**
- **不修**：H4, M4, M8, M9, M10, M16, 全部低危
- 用户强调：修完再三验证，绝不复现 v1.21 改权限导致前端 403 无法登录

## 二、已读文件（现状已理解）
已读：api/admin.mjs, api/admin/{points,shop,tasks,lottery,redeem,tags,users,key,rooms,mute,ip-ban,log}.mjs,
api/{points,preview,recall,rooms}.mjs, registry.mjs, registry/{points,redpacket,persistence,rooms,shop,tasks,lottery,redeem,bans,tags,adminKey,users,log,mute,blacklist,bot,emoji}.mjs,
utils.mjs, chatroom.mjs（全 2039 行）, client/chat/{websocket,search,ui,game-core}.js

**未读（修复前必须读）**：
- src/chatroom/media.mjs（M13 MIME 白名单）
- src/client/chat/renderers.js:658（M13 gh-card avatar）
- src/client/chat/menu.js、commands.js（M21 管理 key）
- src/client/chat/{game-action,game-arcade,game-board,game-cards,game-simple}.js（M22/M23）
- src/api/game.mjs、src/api/shop.mjs、src/api/tasks.mjs（M3 鉴权需要确认前端调用）
- src/client/chat/{shop,tasks}.js（M3 前端带 token）
- src/client/chat/channels.js（M18 相关）

## 三、关键架构事实（务必记住）
- 主站 https://chat.liuxiyu.cn，worker `cloudflare-workers-chat`
- 密钥：super=`9167c945079746dbfa6cd249df4ad64f102e9e34a366624539ee3ac7cfefa16e`，
  admin=`7a7be27563c45956c313005973b4902a15b7a1008c207c05`，DESTROY_KEY=`lxy130523`
- 部署：`npx wrangler deploy`；存档：`node scripts/archive-latest.mjs 1.26 <admin-key> <url>`
- **M15 核心架构**：api/admin.mjs 校验密钥（httpOnly cookie `admin_key` 或 URL `?key=`）→ 分发到子模块 →
  子模块 `registryStub.fetch("https://dummy-url/...")` **不带任何密钥** → registry 端点无鉴权。
  registry DO 有 `reg.env.ADMIN_KEY/ADMIN_SECRET_KEY`，可校验（points.mjs 的 adminAuthorized 模式）。
  修复需让子模块转发时带 auth（见下文 M15 方案）
- registry 管理端点清单（M15 目标）：
  /admin/shop/item/{add,toggle,delete}、/admin/task/{add,toggle,delete}、/admin/tasks/list、
  /lottery/admin/*、/redeem/{generate,add,delete,list}、/tag/{set,remove}、/admin-key/{set,reset}、
  /user-delete、/set-password、/ban、/unban、/ip-ban、/ip-unban、/kick-protect、/kick-unprotect、
  /global-blacklist/{add,remove}、/admin/mute、/admin/unmute、/admin/mute-list、/log/{add,list,clear}、
  /bot-commands?action={add,update,delete}（list/get 公开）、/emoji/{add,remove}（list 公开）
  **/room-destroy 不加守卫**（chatroom /destroy 命令内部调用它，且已有 DESTROY_KEY+admin API 双重校验）
- **chatroom DO 公开端点**（api/rooms.mjs PUBLIC_ROOM_ENDPOINTS）：websocket/messages/users/files/file-data/
  get-announcement/get-pinned/export/search（密码房需 requireRoomPassword）
- 语法校验：服务端 .mjs 用 `node --check`；前端 ES module 用 acorn（`node -e` acorn.parse）

## 四、修复方案（逐项）

### H1 管理员 CSRF（api/admin.mjs:75）
- 现状：Set-Cookie `admin_key=...; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
- 修复：改 `SameSite=Strict` + 加 `Secure`。管理面板同源 fetch 不受影响，跨站 GET 导航不再带 cookie。
- 风险：低。同站管理操作全部依赖同源请求，Strict 不影响。

### H2 SSRF IPv4-mapped 十六进制（api/preview.mjs:21-35 isPrivateHost）
- 现状：`h.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)` 只认点分十进制；URL 规范化后是 `::ffff:7f00:1`
- 修复：追加匹配 `::ffff:` 后的 1-8 位 hex：`let m6 = h.match(/::ffff:([0-9a-f]{1,8})$/i)`；
  `let ipv4 = parseInt(m6[1],16)` → `isPrivateIPv4([(ipv4>>>24)&255,(ipv4>>>16)&255,(ipv4>>>8)&255,ipv4&255].join("."))`
- dnsResolvesToPrivate（:53-69）复用 isPrivateHost，自动生效。

### H3 清空不彻底（chatroom.mjs:514-531 clearAllMessages）
- 现状：只删 `parsed.type ∈ [message,image,file,reply,zifu]`；**文本消息无 type 字段**（data={name,message,channel} at :1421）
- 修复：删除条件改为"有数字 timestamp + (有 message 字段 或 type∈消息类)"，且不误删系统 key
  （channels/blacklist/announcement/__destroyed__/pinnedMessage/scheduledMessages/polls/relays/
  highlights/reactions/at-mentions/ghcache:*/aictx:* 等——它们都无数字 timestamp 或类型非消息）。
  建议：`if (parsed && typeof parsed.timestamp === "number" && (typeof parsed.message === "string" ||
  ["image","file","zifu","voice","gh-card","reply","text","recalled","deleted"].includes(parsed.type))) msgKeys.push(key);`
- 覆盖：/clear-messages、/do-clear、/do-destroy、/destroy 全走此函数，一并修复。

### H5 游戏赔率 +EV（registry/points.mjs:206-208）
- 现状：`won=Math.random()<0.45; prize=won?Math.min(wager*(1+Math.random()*24),10000):0`
- 修复（负期望）：`prize = won ? Math.floor(wager * (1 + Math.random())) : 0`（1~2 倍，期望 0.675×wager，净亏 0.325×wager）。保留日上限 10000。封顶保留。

### H6 防刷上限持久化（registry.mjs:55-57 + persistence.mjs + points.mjs）
- 现状：gameDailyWin/gameLastWin/gameBets 内存态不落盘，DO 重启清零
- 修复：persistence.mjs 加 `saveGameDailyWin`（storage key "gameDailyWin"）；registry.mjs load() 加载 +
  加 `saveGameDailyWin()` 方法；points.mjs /game/bet 结算后 `await reg.saveGameDailyWin()`。

### M1 普通 admin 铸币（api/admin.mjs:99 adminAllowedPaths）
- 现状：adminAllowedPaths 含 `"points"`，普通 admin 可 set/add/batch 任意 name+amount
- 修复：从 adminAllowedPaths **移除 `"points"`** → 积分管理仅 super（permission==="super" 不受该数组限制）。
- ⚠️ 回归风险：admin 前端若显示积分操作，普通 admin 会 403。需检查 admin 前端是否按 level 分级显示。
  暂定：移除后需在 admin 前端做 super-only 隐藏（见未读项）。

### M2 转账负金额（api/points.mjs:15-36）
- 注意：registry points.mjs:97 **已有** `if (amount<=0n) return 400`，负转账实际被 registry 兜底。
- 修复（纵深）：api/points.mjs transfer 加 `if (!/^[1-9]\d*$/.test(amount)) return 400`。

### M3 公开 IDOR 泄露财务（api/points.mjs ledger + shop/tasks）
- 修复范围：**/api/points/ledger 必须鉴权**（资金流水）。方案：api/points.mjs ledger 加 token 参数，
  校验 `tokenValid(regUser)` 且 name 匹配（调 registry user-check-auth，参考 transfer 分支）。
  前端 commands.js `/ledger` 命令需带 token（需读 commands.js 确认）。
- inventory/completions/claims（背包/任务进度，低敏）：因改动需同步 shop.js/tasks.js，**本批暂缓**，
  报告中标注。若用户要求再修。

### M5 recall 不校验房间密码（api/recall.mjs）
- 修复：复制 rooms.mjs:4-21 `requireRoomPassword(env,name,request)` 逻辑到 recall.mjs，
  在 token 校验后、调 roomObj 前检查。无密码房直接放行（hasPassword=false → true）。

### M6 DNS rebinding（api/preview.mjs:53-69）
- 本质难根治（Workers fetch 不可固定 IP）。缓解：保持每跳 fetchSafe 前 dnsResolvesToPrivate 复查
  （已存在），H2 修好后私网 IP 全拦。标注为"缓解"，不新增代码（或加注释说明局限）。

### M7 登录爆破（api/admin.mjs login）
- 修复：模块级内存 Map `loginAttempts`（IP→{count,resetTs}）。同 IP 10 分钟内失败 ≥20 次 → 429。
  成功登录清计数。局限：worker 多实例不共享，缓解为主。

### M11 export/search 跨频道（chatroom.mjs:279-310, 312-342）
- 修复：/export 和 /search 的 channel 为空时**默认只导/搜 general**（`let channel = url.searchParams.get("channel") || "general";`）。
- 前端 exportChatLog（ui.js:106-124）需补 `&channel=`（读 state.currentChannel）。search 前端已带 channel，OK。

### M12 blockedMessages 无限累积 + 限频 Map（chatroom.mjs:1904-1906,1946-1948）
- 修复：broadcast/broadcastToChannel 的 else 分支（未命名会话）`if (session.blockedMessages.length < 200) push`。
- 限频 Map 防膨胀：在 chatroom.mjs / manage.mjs / media.mjs 所有 `xx.set(name, ts)` 处加
  `if (map.size > 10000) map.clear();`（或统一封装）。至少改 broadcast 两处（最高频）。

### M13 XSS 纵深 + MIME 缺口
- 修复 A：media.mjs 文件 MIME 白名单补黑：`data:image/svg`、`data:application/xhtml+xml`、
  `data:application/svg+xml`、`data:text/html` 全拦（需读 media.mjs 确认现有校验位置）。
- 修复 B：renderers.js:658 gh-card `data.avatar`/`ownerAvatar` 改 `escapeHtml(...)`（需读该行确认）。

### M14 红包持久化
- persistence.mjs：loadAll 加 `storage.get("redPackets")` → `redPackets: redPacketsData ? new Map(redPacketsData) : new Map()`；
  加 `saveRedPackets(storage,data){await storage.put("redPackets",[...data])}`。
- registry.mjs：import saveRedPackets；load() 加 `if (data.redPackets) this.redPackets = data.redPackets;`；
  加 `saveRedPackets()` 方法。
- redpacket.mjs：create 后 `await reg.saveRedPackets()`；grab 后 `await reg.saveRedPackets()`。

### M15 registry 管理端点鉴权（最大工程）
- **方案**：
  1. utils.mjs 加 `export function extractAdminKey(request, url){ let k=(url&&url.searchParams)?(url.searchParams.get("key")||""):""; if(!k){let m=(request.headers.get("Cookie")||"").match(/(?:^|;\s*)admin_key=([^;]+)/); if(m){try{k=decodeURIComponent(m[1]);}catch(_){k=m[1];}}} return k; }`
  2. registry.mjs fetch() 顶部加统一守卫（复用 points.mjs 的 adminAuthorized 逻辑，auth 从 `?auth=` 或 `X-Admin-Key` header 读），
     管理路径前缀数组：`/admin/shop/`,`/admin/task`,`/admin/tasks/list`,`/lottery/admin/`,`/redeem/generate`,
     `/redeem/add`,`/redeem/delete`,`/redeem/list`,`/tag/set`,`/tag/remove`,`/admin-key/set`,`/admin-key/reset`,
     `/user-delete`,`/set-password`,`/ban`,`/unban`,`/ip-ban`,`/ip-unban`,`/kick-protect`,`/kick-unprotect`,
     `/global-blacklist/add`,`/global-blacklist/remove`,`/admin/mute`,`/admin/unmute`,`/admin/mute-list`,
     `/log/list`,`/log/clear`。命中且无有效 auth → 403。
  3. **/log/add 也守卫**：logAdminAction（api/admin.mjs:31-41）调用时带 auth。
  4. **/room-destroy 不守卫**（chatroom /destroy 内部调用）。
  5. **/bot-commands 的 add/update/delete 与 /emoji/add|remove**：在各自 handler 内按 action 守卫（list/get 公开）。
  6. 全部 api/admin 子模块转发时附加 `&auth=`+encodeURIComponent(extractAdminKey(request,url))：
     shop/tasks/lottery/redeem/tags/users/key/rooms(room-password)/mute/ip-ban/log/bot/emoji/messages(黑名单?)
  - ⚠️ 回归风险最高！每改一个子模块必须验证对应 admin 功能仍可用。部署后逐一冒烟 admin 操作。

### M17 toBigInt 指数 DoS
- 修复：所有 toBigInt 副本（points/shop/tasks/lottery/redeem/redpacket）的 exp 解析后加
  `if (e > 100000) return 0n;`。API 层 transfer 加 amount 正则校验（见 M2）。

### M18 跨频道 lastSeenTimestamp（client/chat/websocket.js:543-573 else 分支）
- 修复：else 分支把频道路由检查**提前**到 timestamp 检查之前：
  ```
  let txtCh = data.channel || "general";
  if (txtCh !== state.currentChannel) { pushToChannelCache(txtCh, data); bumpChannelUnread(txtCh); return; }
  if (data.timestamp > state.lastSeenTimestamp) { ...原有渲染... }
  ```
- image/file/voice/gh-card 分支已有频道守卫在前（:265/:276/:288/:299），无需改。

### M19 搜索跳转覆盖（client/chat/search.js:109-136 jumpToResult）
- 修复：不直接覆盖。改为：进入历史定位前保存 `state._savedView = {html: state.chatlog.innerHTML, lastSeen: state.lastSeenTimestamp}`，
  加载历史后插入一个"⬅ 返回实时"浮层按钮，点击恢复保存的视图（恢复 html + lastSeenTimestamp + resetMsgDate + refreshReplyCounts）。
- 或用简单方案：若目标不在 DOM，仅 fetch 校验存在并提示"消息较早，已为你加载定位视图"，加返回按钮。

### M20 搜索防抖（client/chat/search.js doSearch + serverSearch）
- 修复：doSearch 加 debounce（300ms setTimeout）；serverSearch 加请求序号 `let _seq=0;` 内 `const my=_seq=++_seq;`
  响应时 `if(my!==_seq) return;` 丢弃过期响应。

### M21 管理 key 空串（menu.js/commands.js/ui.js 需先读）
- 修复：新增共享 helper（放 ui.js 或 state.js）：`getAdminKey(){ return localStorage.getItem("admin_key")||""; }`
  所有 `let k=""`/`let adminKey=""` 处改用 getAdminKey()。逻辑：cookie 登录 → 服务端读 cookie 兜底；
  旧 localStorage 登录 → URL 带 key。两兼容。
- ⚠️ 需先读 menu.js、commands.js 确认所有管理 fetch 位置（v1.26 记忆：menu.js 62/91/100/141/152、
  commands.js 35/49/65/77/198/212/222）。

### M22 游戏计时器清理（game-core.js + 各游戏模块）
- 方案：gs 加 `_cleanup` 约定。switchGame(game) 与 closeGames() 开头调
  `if (gs._cleanup){ try{gs._cleanup();}catch(e){} gs._cleanup=null; }`
  各游戏模块在启动计时器处设置 `gs._cleanup = () => { clearInterval(...); cancelAnimationFrame(...); }`。
- ⚠️ 需先读 game-action/arcade/board/cards/simple 确认各游戏计时器变量名。

### M23 双击下注（各游戏 xxxStart）
- 通用修复：`if (gs.X.betPlaced) return; gs.X.betPlaced = true;`（await 前置位），
  `let res = await gameApi("bet"); if (res.error) gs.X.betPlaced = false;`
- ⚠️ 需先读各游戏 Start 函数确认现有顺序（审计说扫雷/记忆翻牌/2048 已先置位，其余 12 处要改）。

## 五、修复顺序建议（每批后 node --check / acorn 校验）
1. 批A 服务端经济：H5, H6, M2, M14, M17（registry/points/persistence/redpacket）
2. 批B 服务端核心：H3, M11, M12, M13, H2, M6（chatroom/preview/media）
3. 批C 权限类：H1, M1, M3, M5, M7, M15（admin 全套——最需谨慎）
4. 批D 前端：M18, M19, M20, M21, M22, M23
5. 全量语法校验（node --check 服务端 + acorn 前端）
6. 部署 + 冒烟实测（见下）

## 六、冒烟实测清单（部署后逐项）
1. 用户注册/登录/WS 连接/发文本消息 ✅ 必须通过（防 403 回归）
2. 管理端登录（/api/admin/login 种 cookie）→ 各 admin 操作（tag/ban/mute/kick/points/shop/tasks/lottery/redeem）
3. 积分转账正常 + 负数被拒 + 大指数被拒
4. 游戏下注：正常扣分/发奖，无重复扣费（双击按钮）
5. 红包：创建→抢→**部署重启后红包仍在**（验证 M14）
6. 清空聊天记录：文本消息确实被删（刷新不复活）验证 H3
7. 密码房：recall 需密码验证 M5
8. /ledger 需 token；无 token 403
9. 搜索跳转：返回实时按钮；防抖生效
10. 管理面板：普通 admin 看积分操作应隐藏/403（M1）

## 七、changelog 记忆要求
- 修复完成后：两仓库同步（Cloudflare-Dsl-Chat 也要改）→ 部署主站 → 主站存档 → changelog.html v1.27 →
  提交两仓。Dsl 站部署由用户提 PR。
- 会话结束把本任务进展写入 memory（如 bugfix-progress）。

## 八、当前任务清单（恢复用）
#21 读取涉及文件（in_progress，还差 media/renderers/menu/commands/game 模块/shop/tasks 前端）
#22 修复高危 H1-H3,H5-H6
#23 修复中危 M1-M3,M5-M7,M11-M15,M17
#24 修复前端 M18-M23
#25 语法校验+权限一致性
#26 部署+冒烟实测
