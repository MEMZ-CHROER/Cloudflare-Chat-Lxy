// 管理后台共享状态
// 🔒 安全修复（LD12）：不再从 localStorage 读取管理密钥（密钥改走 httpOnly Cookie，JS 不可读）
export const state = {
  adminKey: "",
  adminLevel: null,
  refreshInterval: null,
  expandedRoom: null,
  ptsSelectedUser: null,
  ptsCheckedUsers: new Set(),
  ipgExpanded: null,
};
