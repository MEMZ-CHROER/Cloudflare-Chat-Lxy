import { tokenValid } from "../utils.mjs";

// 👥 v1.48 关系链（registry 层）
// 关注（单向）/ 好友（双方镜像冗余，双写原子）/ 拉黑（单向，只挡对方→我）。
// 存储：reg.userRelations = Map<name,{following:Set, friends:Set, pendingOut:Set, pendingIn:Set, blocked:Set}>。
// 安全要点：
//   · 用户端点均需 tokenValid（registry 层纵深防御，防冒名操作）
//   · F2 并发防护：所有校验+内存变更在首个 await（request.json()）之后、saveUserRelations 之前同步完成，块内无多余 await
//   · /rel/blocked 与 /rel/at-filter 为 chatroom 内部无鉴权端点（不暴露 HTTP，仅 stub.fetch 直连）
//   · L1 脱敏：整体 try/catch，异常只回 500"关系链服务暂时不可用"，不泄露内部错误

function jsonRes(obj, status = 200) {
  return new Response(JSON.stringify(obj), {status, headers: {"Content-Type": "application/json"}});
}

// 惰性写路径 helper：写关系时不存在则建空记录
function getRel(reg, name) {
  let rel = reg.userRelations.get(name);
  if (!rel) {
    rel = {following: new Set(), friends: new Set(), pendingOut: new Set(), pendingIn: new Set(), blocked: new Set()};
    reg.userRelations.set(name, rel);
  }
  return rel;
}

// 读路径 helper：只读，不建记录
function getRelRead(reg, name) {
  return reg.userRelations.get(name) || null;
}

export async function handleRelations(reg, request, url) {
  try {
    switch (url.pathname) {
      // ---------- 用户端点（token 鉴权） ----------

      case "/rel/follow": {
        if (request.method !== "POST") return jsonRes({error: "请使用POST"}, 405);
        const body = await request.json();
        let name = body.name, token = body.token, target = body.target;
        if (!name) return jsonRes({error: "请提供用户名"}, 400);
        if (!tokenValid(reg.registeredUsers.get(name), token)) return jsonRes({error: "请先登录"}, 403);
        if (!target) return jsonRes({error: "请提供目标用户"}, 400);
        if (target === name) return jsonRes({error: "不能对自己操作"}, 400);
        if (!reg.registeredUsers.has(target)) return jsonRes({error: "用户不存在"}, 404);
        let rel = getRel(reg, name);
        let targetRel = getRel(reg, target);
        if (rel.blocked.has(target)) return jsonRes({error: "对方已被你拉黑"}, 400);
        rel.following.add(target);
        await reg.saveUserRelations();
        return jsonRes({ok: true, following: true});
      }

      case "/rel/unfollow": {
        if (request.method !== "POST") return jsonRes({error: "请使用POST"}, 405);
        const body = await request.json();
        let name = body.name, token = body.token, target = body.target;
        if (!name) return jsonRes({error: "请提供用户名"}, 400);
        if (!tokenValid(reg.registeredUsers.get(name), token)) return jsonRes({error: "请先登录"}, 403);
        if (!target) return jsonRes({error: "请提供目标用户"}, 400);
        if (target === name) return jsonRes({error: "不能对自己操作"}, 400);
        if (!reg.registeredUsers.has(target)) return jsonRes({error: "用户不存在"}, 404);
        let rel = getRel(reg, name);
        let targetRel = getRel(reg, target);
        rel.following.delete(target);
        await reg.saveUserRelations();
        return jsonRes({ok: true, following: false});
      }

      case "/rel/request": {
        if (request.method !== "POST") return jsonRes({error: "请使用POST"}, 405);
        const body = await request.json();
        let name = body.name, token = body.token, target = body.target;
        if (!name) return jsonRes({error: "请提供用户名"}, 400);
        if (!tokenValid(reg.registeredUsers.get(name), token)) return jsonRes({error: "请先登录"}, 403);
        if (!target) return jsonRes({error: "请提供目标用户"}, 400);
        if (target === name) return jsonRes({error: "不能对自己操作"}, 400);
        if (!reg.registeredUsers.has(target)) return jsonRes({error: "用户不存在"}, 404);
        let rel = getRel(reg, name);
        let targetRel = getRel(reg, target);
        if (targetRel.blocked.has(name)) return jsonRes({error: "对方已拉黑你，无法发送申请"}, 400);
        if (rel.friends.has(target)) return jsonRes({error: "你们已经是好友"}, 400);
        if (rel.pendingOut.has(target)) return jsonRes({error: "已发送过好友申请"}, 400);
        rel.pendingOut.add(target);
        targetRel.pendingIn.add(name);
        await reg.saveUserRelations();
        return jsonRes({ok: true, pending: true});
      }

      case "/rel/respond": {
        if (request.method !== "POST") return jsonRes({error: "请使用POST"}, 405);
        const body = await request.json();
        let name = body.name, token = body.token, target = body.target;
        let action = body.action;
        if (!name) return jsonRes({error: "请提供用户名"}, 400);
        if (!tokenValid(reg.registeredUsers.get(name), token)) return jsonRes({error: "请先登录"}, 403);
        if (!target) return jsonRes({error: "请提供目标用户"}, 400);
        if (target === name) return jsonRes({error: "不能对自己操作"}, 400);
        if (!reg.registeredUsers.has(target)) return jsonRes({error: "用户不存在"}, 404);
        let rel = getRel(reg, name);
        let targetRel = getRel(reg, target);
        if (!rel.pendingIn.has(target)) return jsonRes({error: "没有来自该用户的好友申请"}, 400);
        // action 仅接受 accept|reject，其余视为参数错误
        if (action !== "accept" && action !== "reject") return jsonRes({error: "无效的操作类型"}, 400);
        if (action === "accept") {
          rel.friends.add(target);
          targetRel.friends.add(name);
        }
        // 无论 accept/reject 都双向清理 pending（拒绝后申请即失效，防重复 respond/无限 accept）
        rel.pendingIn.delete(target);
        targetRel.pendingOut.delete(name);
        await reg.saveUserRelations();
        return jsonRes({ok: true, friends: action === "accept"});
      }

      case "/rel/unfriend": {
        if (request.method !== "POST") return jsonRes({error: "请使用POST"}, 405);
        const body = await request.json();
        let name = body.name, token = body.token, target = body.target;
        if (!name) return jsonRes({error: "请提供用户名"}, 400);
        if (!tokenValid(reg.registeredUsers.get(name), token)) return jsonRes({error: "请先登录"}, 403);
        if (!target) return jsonRes({error: "请提供目标用户"}, 400);
        if (target === name) return jsonRes({error: "不能对自己操作"}, 400);
        if (!reg.registeredUsers.has(target)) return jsonRes({error: "用户不存在"}, 404);
        let rel = getRel(reg, name);
        let targetRel = getRel(reg, target);
        rel.friends.delete(target);
        targetRel.friends.delete(name);
        await reg.saveUserRelations();
        return jsonRes({ok: true});
      }

      case "/rel/block": {
        if (request.method !== "POST") return jsonRes({error: "请使用POST"}, 405);
        const body = await request.json();
        let name = body.name, token = body.token, target = body.target;
        if (!name) return jsonRes({error: "请提供用户名"}, 400);
        if (!tokenValid(reg.registeredUsers.get(name), token)) return jsonRes({error: "请先登录"}, 403);
        if (!target) return jsonRes({error: "请提供目标用户"}, 400);
        if (target === name) return jsonRes({error: "不能对自己操作"}, 400);
        if (!reg.registeredUsers.has(target)) return jsonRes({error: "用户不存在"}, 404);
        let rel = getRel(reg, name);
        let targetRel = getRel(reg, target);
        rel.blocked.add(target);
        // 自动切断：双向好友 + 双向 pending + 取消关注对方（不删 targetRel.following，保留对方关注我）
        rel.friends.delete(target);
        targetRel.friends.delete(name);
        rel.pendingOut.delete(target);
        targetRel.pendingIn.delete(name);
        rel.pendingIn.delete(target);
        targetRel.pendingOut.delete(name);
        rel.following.delete(target);
        await reg.saveUserRelations();
        return jsonRes({ok: true, blocked: true});
      }

      case "/rel/unblock": {
        if (request.method !== "POST") return jsonRes({error: "请使用POST"}, 405);
        const body = await request.json();
        let name = body.name, token = body.token, target = body.target;
        if (!name) return jsonRes({error: "请提供用户名"}, 400);
        if (!tokenValid(reg.registeredUsers.get(name), token)) return jsonRes({error: "请先登录"}, 403);
        if (!target) return jsonRes({error: "请提供目标用户"}, 400);
        if (target === name) return jsonRes({error: "不能对自己操作"}, 400);
        if (!reg.registeredUsers.has(target)) return jsonRes({error: "用户不存在"}, 404);
        let rel = getRel(reg, name);
        let targetRel = getRel(reg, target);
        rel.blocked.delete(target);
        await reg.saveUserRelations();
        return jsonRes({ok: true, blocked: false});
      }

      case "/rel/status": {
        let name = url.searchParams.get("name");
        let token = url.searchParams.get("token");
        let target = url.searchParams.get("target");
        if (!name) return jsonRes({error: "请提供用户名"}, 400);
        if (!tokenValid(reg.registeredUsers.get(name), token)) return jsonRes({error: "请先登录"}, 403);
        if (!target) return jsonRes({error: "请提供目标用户"}, 400);
        if (target === name) return jsonRes({error: "不能对自己操作"}, 400);
        if (!reg.registeredUsers.has(target)) return jsonRes({error: "用户不存在"}, 404);
        let rel = getRelRead(reg, name);
        let trel = getRelRead(reg, target);
        return jsonRes({ok: true, status: {
          following: !!(rel && rel.following.has(target)),
          followedBy: !!(trel && trel.following.has(name)),
          friends: !!(rel && rel.friends.has(target)),
          pendingOut: !!(rel && rel.pendingOut.has(target)),
          pendingIn: !!(rel && rel.pendingIn.has(target)),
          blocked: !!(rel && rel.blocked.has(target)),
          blockedBy: !!(trel && trel.blocked.has(name))
        }});
      }

      case "/rel/lists": {
        let name = url.searchParams.get("name");
        let token = url.searchParams.get("token");
        if (!name) return jsonRes({error: "请提供用户名"}, 400);
        if (!tokenValid(reg.registeredUsers.get(name), token)) return jsonRes({error: "请先登录"}, 403);
        let tab = url.searchParams.get("tab") || "following";
        let rel = getRelRead(reg, name);
        let names = [];
        // 粉丝数：实时遍历 userRelations 找 following.has(name)
        let followerCount = 0;
        for (let [, v] of reg.userRelations) {
          if (v.following.has(name)) followerCount++;
        }
        if (tab === "following") names = [...(rel && rel.following || [])];
        else if (tab === "friends") names = [...(rel && rel.friends || [])];
        else if (tab === "blocked") names = [...(rel && rel.blocked || [])];
        else if (tab === "requests") names = [...(rel && rel.pendingIn || [])];
        else if (tab === "followers") {
          for (let [uname, v] of reg.userRelations) {
            if (v.following.has(name)) names.push(uname);
          }
        }
        let counts = {
          following: rel && rel.following ? rel.following.size : 0,
          followers: followerCount,
          friends: rel && rel.friends ? rel.friends.size : 0,
          blocked: rel && rel.blocked ? rel.blocked.size : 0,
          requests: rel && rel.pendingIn ? rel.pendingIn.size : 0
        };
        return jsonRes({ok: true, tab, names, counts});
      }

      // ---------- chatroom 内部无鉴权端点（stub.fetch 直连，不暴露 HTTP） ----------

      case "/rel/blocked": {
        let from = url.searchParams.get("from");
        let to = url.searchParams.get("to");
        let frel = getRelRead(reg, from);
        return jsonRes({blocked: !!(frel && frel.blocked.has(to))});
      }

      case "/rel/at-filter": {
        let from = url.searchParams.get("from");
        let names = (url.searchParams.get("names") || "").split(",").slice(0, 50);
        // 方向（修正）：目标拉黑发送者（from）→ 过滤该目标（不触发红点/补显）。
        // 语义：B 拉黑 A 后，A 消息 @B 不应打扰 B——查每个目标的 blocked 是否含 from。
        let allowed = names.filter(n => {
          if (!n || n === from) return true;
          let trel = getRelRead(reg, n);
          return !(trel && trel.blocked.has(from));
        });
        return jsonRes({allowed});
      }

      default:
        return null; // registry 兜底 404
    }
  } catch (e) {
    // 🔒 L1 脱敏：不泄露内部错误细节
    console.error("relations handler error:", e && e.message);
    return jsonRes({error: "关系链服务暂时不可用"}, 500);
  }
}
