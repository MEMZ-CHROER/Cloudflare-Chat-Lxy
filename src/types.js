// v1.57 JSDoc 类型契约（单点定义 + 跨模块复用）
// 本文件只有 @typedef 注释 + 空导出，不产生运行时代码。
// 其他文件通过 `@typedef {import("../types.js").ChatMessage} ChatMessage` 引用。
// 关键区分：
//   WsSession  = ChatRoom 内存中的 WS 会话（sessions Map 的 value，含 blockedMessages/connId）
//   SessionEntry = registry 持久化用户 sessions 数组的一项（findSession 返回，token 会话）
//   ChatMessage = 广播 + storage 落库同构的消息对象
//   User = registry.registeredUsers Map 的 value

/** @typedef {{ token:string, expiry:number, createdAt:number, lastActive:number, device?:string, ip?:string }} SessionEntry */
/** @typedef {{ name:string, type:"text"|"announcement" }} Channel */
/** @typedef {{ id:string, label:string, tier:number, features:{ badge:boolean, vipColor:string|null, uploadImgMB:number, uploadFileMB:number, kickProtect:boolean, maxMsgLen:number } }} VipInfo */

/**
 * WS 连接会话（ChatRoom 内存态，非持久化；sessions Map<WebSocket, WsSession>）
 * @typedef {{ name?:string, token?:string, authenticated?:boolean, ip?:string,
 *   connId:number, channel:string, blockedMessages:string[],
 *   tag?:string, tagColor?:string, tagBorder?:string, vip?:VipInfo,
 *   avatar?:string, bio?:string, quit?:boolean }} WsSession
 */

/**
 * 持久化用户（registry.registeredUsers Map<string, User> 的 value）
 * @typedef {{ passwordHash:string, salt?:string,
 *   token?:string|null, tokenExpiry?:number|null, sessions?:SessionEntry[],
 *   tokenCreatedAt?:number, tokenLastActive?:number, tokenDevice?:string, tokenIp?:string,
 *   avatar?:string, bio?:string, anonCoupons?:number, exp?:number,
 *   achievements?:string[],
 *   stats?:{ msgCount:number, checkinCount:number, gameWins:number, shopCount:number },
 *   registeredAt:number, oauthOnly?:boolean, loginFails?:number, lockedUntil?:number|null }} User
 */

/**
 * 聊天消息（WS 广播 + storage 落库同构；storage key = new Date(timestamp).toISOString()）
 * @typedef {{ id?:number, type?:string, name:string, message?:string,
 *   data?:string, fileName?:string, fileType?:string, fileSize?:number, duration?:number,
 *   timestamp:number, channel:string,
 *   tag?:string, tagColor?:string, tagBorder?:string,
 *   avatar?:string, vip?:VipInfo, reply?:object, atAll?:boolean, anon?:boolean,
 *   roomwide?:boolean, webhook?:boolean, level?:number,
 *   _anonOwner?:string, fid?:string, fileBucket?:boolean }} ChatMessage
 */

/**
 * 知识库文档（chatroom/doc.mjs metaOf：元数据态无 content，get/create/update 返回全量态）
 * @typedef {{ id:string, title:string, tags:string[],
 *   createdBy:string, createdAt:number, updatedAt:number, updatedBy:string,
 *   content?:string }} Doc
 */

/**
 * WS 入站命令（chatroom.mjs webSocketMessage 分发 + 前端 websocket.js 消费同构）
 * @typedef {{ type?:string, action?:string, reqId?:string,
 *   name?:string, token?:string, message?:string, channel?:string,
 *   id?:string|number, timestamp?:string|number,
 *   [key:string]: any }} WsCommandData
 */

/**
 * Worker 环境（wrangler.toml vars + DO bindings）
 * @typedef {{ rooms: DurableObjectNamespace, registry: DurableObjectNamespace,
 *   archive: DurableObjectNamespace, filebucket: DurableObjectNamespace,
 *   ADMIN_SECRET_KEY?:string, ADMIN_KEY?:string, DESTROY_KEY?:string,
 *   AI_BASE_URL?:string, AI_MODEL?:string, AI_SYSTEM_PROMPT?:string, AI_API_KEY?:string,
 *   CF_ACCOUNT_ID?:string, CF_SCRIPT_NAME?:string, CF_API_TOKEN?:string,
 *   GITHUB_TOKEN?:string, GITHUB_CLIENT_ID?:string, GITHUB_CLIENT_SECRET?:string,
 *   OAUTH_MOCK?:string }} Env
 */

export {};
