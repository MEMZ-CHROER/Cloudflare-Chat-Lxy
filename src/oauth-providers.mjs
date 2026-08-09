// v1.46 OAuth Provider 注册表（服务端）
// 每个 provider 声明授权/令牌/用户信息端点与字段映射，供 api 层 OAuth 流程使用。
// 凭证从环境变量读取（clientIdEnv / clientSecretEnv），服务端不透传密钥到前端。
export const OAUTH_PROVIDERS = [
  { id: "github", name: "GitHub",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    redirectPath: "/api/oauth/callback/github", scopes: "read:user",
    idField: "id", usernameField: "login", avatarField: "avatar_url", emailField: "email",
    clientIdEnv: "GITHUB_CLIENT_ID", clientSecretEnv: "GITHUB_CLIENT_SECRET", mock: false },
  // 仅当 env.OAUTH_MOCK === "1" 时启用，供无凭证端到端验证
  { id: "test", name: "测试OAuth", mock: true, redirectPath: "/api/oauth/callback/test",
    authUrl: "", tokenUrl: "", userInfoUrl: "", scopes: "",
    idField: "id", usernameField: "login", avatarField: "avatar_url", emailField: "email",
    clientIdEnv: "GITHUB_CLIENT_ID", clientSecretEnv: "GITHUB_CLIENT_SECRET" }
];
