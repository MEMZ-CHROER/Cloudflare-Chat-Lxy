// RoomRegistry 持久化 — load / save 逻辑

export async function loadAll(storage) {
  let [roomsData, bannedData, bannedIpsData, tagsData, knownUsersData,
    userIpsData, gbData, akData, pointsData, regUsers, shopData, invData,
    tasksData, taskCompsData, taskClaimsData, rateLimitExemptData, lotteryPoolsData, botCommandsData, emojiData, redeemCodesData, kickProtectedData, mutesData, gameDailyWinData, redPacketsData] =
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
