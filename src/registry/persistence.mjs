// RoomRegistry 持久化 — load / save 逻辑

export async function loadAll(storage) {
  let [roomsData, bannedData, bannedIpsData, tagsData, knownUsersData,
    userIpsData, gbData, akData, pointsData, regUsers, shopData, invData,
    tasksData, taskCompsData, taskClaimsData, rateLimitExemptData, lotteryPoolsData, botCommandsData, emojiData, redeemCodesData, kickProtectedData, mutesData, gameDailyWinData, redPacketsData, checkinByIpData, taskRewardPaidData, hacknetGamesData, seasonStateData, seasonProgressData, honorCoinsData, oauthStatesData, marketOrdersData, marketConfigData, userRelationsData, lpData] =
    await Promise.all([
      storage.get("rooms"),
      storage.get("banned"),
      storage.get("bannedIps"),
      storage.get("tags"),
      storage.get("knownUsers"),
      storage.get("userIps"),
      storage.get("globalBlacklist"),
      storage.get("adminKey"),
      storage.get("userPoints"),
      storage.get("registeredUsers"),
      storage.get("shopItems"),
      storage.get("userInventory"),
      storage.get("tasks"),
      storage.get("taskCompletions"),
      storage.get("taskClaims"),
      storage.get("rateLimitExempt"),
      storage.get("lotteryPools"),
      storage.get("botCommands"),
      storage.get("emoji"),
      storage.get("redeemCodes"),
      storage.get("kickProtected"),
      storage.get("mutes"),
      storage.get("gameDailyWin"),
      storage.get("redPackets"),
      storage.get("checkinByIp"),
      storage.get("taskRewardPaid"),
      storage.get("hacknetGames"),
      storage.get("seasonState"),
      storage.get("seasonProgress"),
      storage.get("honorCoins"),
      storage.get("oauthStates"),
      storage.get("marketOrders"),
      storage.get("marketConfig"),
      storage.get("userRelations"),
      storage.get("lpData"),
    ]);

  return {
    rooms: roomsData ? new Map(roomsData) : new Map(),
    banned: bannedData ? new Set(bannedData) : new Set(),
    bannedIps: bannedIpsData ? new Set(bannedIpsData) : new Set(),
    tags: tagsData ? new Map(tagsData) : new Map(),
    knownUsers: knownUsersData ? new Set(knownUsersData) : new Set(),
    userIps: userIpsData ? new Map(userIpsData) : new Map(),
    globalBlacklist: gbData ? new Set(gbData) : new Set(),
    adminKey: akData || null,
    userPoints: pointsData ? new Map(pointsData) : new Map(),
    registeredUsers: regUsers ? new Map(regUsers) : new Map(),
    shopItems: shopData ? new Map(shopData) : new Map(),
    userInventory: invData ? new Map(invData.map(([u, items]) => [u, new Map(items)])) : new Map(),
    tasks: tasksData ? new Map(tasksData) : new Map(),
    taskCompletions: taskCompsData ? new Map(taskCompsData.map(([u, ids]) => [u, new Set(ids)])) : new Map(),
    taskClaims: taskClaimsData ? new Map(taskClaimsData.map(([u, ids]) => [u, new Set(ids)])) : new Map(),
    rateLimitExempt: rateLimitExemptData ? new Set(rateLimitExemptData) : new Set(),
    lotteryPools: lotteryPoolsData ? new Map(lotteryPoolsData.map(([id, pool]) => { pool.prizes = new Map(pool.prizes); return [id, pool]; })) : new Map(),
    lotteryRecords: new Map(),
    botCommands: botCommandsData ? new Map(botCommandsData) : new Map(),
    emoji: emojiData ? new Map(emojiData) : new Map(),
    redeemCodes: redeemCodesData ? new Map(redeemCodesData) : new Map(),
    kickProtected: kickProtectedData ? new Set(kickProtectedData) : new Set(),
    mutes: mutesData ? new Map(mutesData) : new Map(),
    gameDailyWin: gameDailyWinData ? new Map(gameDailyWinData) : new Map(),
    redPackets: redPacketsData ? new Map(redPacketsData) : new Map(),
    checkinByIp: checkinByIpData ? new Map(checkinByIpData) : new Map(),
    taskRewardPaid: taskRewardPaidData ? new Map(taskRewardPaidData.map(([u, ids]) => [u, new Set(ids)])) : new Map(),
    hacknetGames: hacknetGamesData ? new Map(hacknetGamesData) : new Map(),
    seasonState: seasonStateData || null,
    seasonProgress: seasonProgressData || null,
    honorCoins: honorCoinsData ? new Map(honorCoinsData) : new Map(),
    oauthStates: oauthStatesData ? new Map(oauthStatesData) : new Map(),
    marketOrders: marketOrdersData ? marketOrdersData : [],
    marketConfig: marketConfigData || null,
    userRelations: userRelationsData ? new Map(userRelationsData.map(([n, rel]) => [n, {
      following: new Set(rel.following || []),
      friends: new Set(rel.friends || []),
      pendingOut: new Set(rel.pendingOut || []),
      pendingIn: new Set(rel.pendingIn || []),
      blocked: new Set(rel.blocked || [])
    }])) : new Map(),
    // 🧪 v1.49 LuckPerms 权限系统：{users: Map<name,{permissions:Map,groups:Set}>, groups: Map<gname,{permissions:Map,parents:Set}>}
    lp: lpData ? {
      users: new Map(lpData.users.map(([n, u]) => [n, {permissions: new Map(u.permissions || []), groups: new Set(u.groups || [])}])),
      groups: new Map(lpData.groups.map(([gn, g]) => [gn, {permissions: new Map(g.permissions || []), parents: new Set(g.parents || [])}]))
    } : {users: new Map(), groups: new Map()},
  };
}

export async function saveRooms(storage, data) { await storage.put("rooms", [...data]); }
export async function saveBanned(storage, data) { await storage.put("banned", [...data]); }
export async function saveBannedIps(storage, data) { await storage.put("bannedIps", [...data]); }
export async function saveTags(storage, data) { await storage.put("tags", [...data]); }
export async function saveKnownUsers(storage, data) { await storage.put("knownUsers", [...data]); }
export async function saveUserIps(storage, data) { await storage.put("userIps", [...data]); }
export async function saveGlobalBlacklist(storage, data) { await storage.put("globalBlacklist", [...data]); }
export async function saveAdminKey(storage, data) { await storage.put("adminKey", data); }
export async function savePoints(storage, data) { await storage.put("userPoints", [...data]); }
export async function saveRegisteredUsers(storage, data) { await storage.put("registeredUsers", [...data]); }
export async function saveShopItems(storage, data) { await storage.put("shopItems", [...data]); }
export async function saveBotCommands(storage, data) { await storage.put("botCommands", [...data]); }

export async function saveUserInventory(storage, data) {
  let serialized = [];
  for (let [username, items] of data) {
    serialized.push([username, [...items]]);
  }
  await storage.put("userInventory", serialized);
}

export async function saveTasks(storage, data) { await storage.put("tasks", [...data]); }

export async function saveTaskClaims(storage, data) {
  let serialized = [];
  for (let [username, ids] of data) {
    serialized.push([username, [...ids]]);
  }
  await storage.put("taskClaims", serialized);
}

export async function saveTaskCompletions(storage, data) {
  let serialized = [];
  for (let [username, ids] of data) {
    serialized.push([username, [...ids]]);
  }
  await storage.put("taskCompletions", serialized);
}

export async function saveLotteryPools(storage, data) {
  let serialized = [];
  for (let [poolId, pool] of data) {
    serialized.push([poolId, {name: pool.name, description: pool.description, cost: pool.cost, enabled: pool.enabled, prizes: [...pool.prizes]}]);
  }
  await storage.put("lotteryPools", serialized);
}

export async function saveLotteryRecords(storage, data) {
  let serialized = [];
  for (let [poolId, records] of data) {
    serialized.push([poolId, [...records]]);
  }
  await storage.put("lotteryRecords", serialized);
}

export async function saveEmoji(storage, data) {
  await storage.put("emoji", [...data]);
}

export async function saveRedeemCodes(storage, data) {
  await storage.put("redeemCodes", [...data]);
}

export async function saveKickProtected(storage, data) {
  await storage.put("kickProtected", [...data]);
}

export async function saveMutes(storage, data) {
  await storage.put("mutes", [...data]);
}

export async function saveGameDailyWin(storage, data) {
  await storage.put("gameDailyWin", [...data]);
}

export async function saveRedPackets(storage, data) {
  await storage.put("redPackets", [...data]);
}

export async function saveCheckinByIp(storage, data) {
  await storage.put("checkinByIp", [...data]);
}

export async function saveTaskRewardPaid(storage, data) {
  let serialized = [];
  for (let [username, ids] of data) {
    serialized.push([username, [...ids]]);
  }
  await storage.put("taskRewardPaid", serialized);
}

// 🎮 v1.43 Hacknet 对战小游戏：局状态 Map<gameId, game>（全纯对象/数组，无 Map/Set 嵌套，可 JSON 序列化）
export async function saveHacknetGames(storage, data) {
  await storage.put("hacknetGames", [...data]);
}

// 🏆 v1.45 赛季系统：赛季状态（单对象）、赛季进度（{baselines:[[name,{msg,checkin,game,achieve}]], points:[[name,"积分"]]}）、荣誉币 Map<name,string>
export async function saveSeasonState(storage, data) {
  await storage.put("seasonState", data);
}

export async function saveSeasonProgress(storage, data) {
  await storage.put("seasonProgress", data);
}

export async function saveHonorCoins(storage, data) {
  await storage.put("honorCoins", [...data]);
}

// 🔐 v1.46 OAuth state 生命周期持久化：Map<state,{provider,redirectUri,preAuthName,createdAt}>
export async function saveOauthStates(storage, data) {
  await storage.put("oauthStates", [...data]);
}

// 💱 v1.47 交易市场持久化：挂单数组 + 市场配置单对象
export async function saveMarketOrders(storage, data) { await storage.put("marketOrders", data); }
export async function saveMarketConfig(storage, data) { await storage.put("marketConfig", data); }

// 👥 v1.48 关系链持久化：Map<name,{following,friends,pendingOut,pendingIn,blocked} 均 Set>
export async function saveUserRelations(storage, data) {
  let serialized = [];
  for (let [name, rel] of data) {
    serialized.push([name, {
      following: [...(rel.following || [])],
      friends: [...(rel.friends || [])],
      pendingOut: [...(rel.pendingOut || [])],
      pendingIn: [...(rel.pendingIn || [])],
      blocked: [...(rel.blocked || [])]
    }]);
  }
  await storage.put("userRelations", serialized);
}

// 🧪 v1.49 LuckPerms 权限系统持久化：{users, groups} 均 Map（内嵌 Map/Set 序列化）
export async function saveLp(storage, data) {
  let serialized = {
    users: [],
    groups: []
  };
  for (let [name, u] of data.users) {
    serialized.users.push([name, {permissions: [...(u.permissions || [])], groups: [...(u.groups || [])]}]);
  }
  for (let [gname, g] of data.groups) {
    serialized.groups.push([gname, {permissions: [...(g.permissions || [])], parents: [...(g.parents || [])]}]);
  }
  await storage.put("lpData", serialized);
}
