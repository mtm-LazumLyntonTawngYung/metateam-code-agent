import { randomBytes, createHash } from "crypto";
import { generateToken, hashToken, generateExpiresAt } from "./security";

export type SSOProvider = "google" | "github" | "microsoft" | "okta" | "auth0";

export type SSOConfig = {
  provider: SSOProvider;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
};

export type SSOState = {
  state: string;
  codeVerifier?: string;
  createdAt: string;
  expiresAt: string;
};

export type SSOUser = {
  id: string;
  email: string;
  name: string;
  provider: SSOProvider;
  providerUserId: string;
  avatar?: string;
  organizationId?: string;
};

export type SSOToken = {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
};

const ssoStates = new Map<string, SSOState>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function generateSSOState(): string {
  const state = randomBytes(32).toString("hex");
  const now = new Date();

  ssoStates.set(state, {
    state,
    createdAt: now.toISOString(),
    expiresAt: generateExpiresAt(STATE_TTL_MS),
  });

  return state;
}

export function validateSSOState(state: string): boolean {
  const ssoState = ssoStates.get(state);
  if (!ssoState) return false;

  if (new Date(ssoState.expiresAt) < new Date()) {
    ssoStates.delete(state);
    return false;
  }

  return true;
}

export function consumeSSOState(state: string): boolean {
  const ssoState = ssoStates.get(state);
  if (!ssoState) return false;

  ssoStates.delete(state);
  return true;
}

export function generateAuthorizationUrl(config: SSOConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
  });

  const baseUrl = getProviderBaseUrl(config.provider);
  return `${baseUrl}/authorize?${params.toString()}`;
}

export function getProviderBaseUrl(provider: SSOProvider): string {
  const urls: Record<SSOProvider, string> = {
    google: "https://accounts.google.com",
    github: "https://github.com/login/oauth",
    microsoft: "https://login.microsoftonline.com/common/oauth2/v2.0",
    okta: "https://your-domain.okta.com/oauth2/default",
    auth0: "https://your-domain.auth0.com",
  };
  return urls[provider];
}

export function getProviderTokenUrl(provider: SSOProvider): string {
  const urls: Record<SSOProvider, string> = {
    google: "https://oauth2.googleapis.com/token",
    github: "https://github.com/login/oauth/access_token",
    microsoft: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    okta: "https://your-domain.okta.com/oauth2/default/token",
    auth0: "https://your-domain.auth0.com/oauth/token",
  };
  return urls[provider];
}

export function getProviderUserInfoUrl(provider: SSOProvider): string {
  const urls: Record<SSOProvider, string> = {
    google: "https://www.googleapis.com/oauth2/v2/userinfo",
    github: "https://api.github.com/user",
    microsoft: "https://graph.microsoft.com/v1.0/me",
    okta: "https://your-domain.okta.com/oauth2/default/userinfo",
    auth0: "https://your-domain.auth0.com/userinfo",
  };
  return urls[provider];
}

export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export function parseSSOCallback(
  callbackUrl: string,
): { code: string; state: string } | null {
  try {
    const url = new URL(callbackUrl);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) return null;

    return { code, state };
  } catch {
    return null;
  }
}

export function mapSSOUser(
  provider: SSOProvider,
  providerUserData: Record<string, unknown>,
): SSOUser {
  const baseUser: SSOUser = {
    id: "",
    email: "",
    name: "",
    provider,
    providerUserId: "",
  };

  switch (provider) {
    case "google":
      return {
        ...baseUser,
        id: providerUserData.sub as string,
        email: providerUserData.email as string,
        name: providerUserData.name as string,
        providerUserId: providerUserData.sub as string,
        avatar: providerUserData.picture as string | undefined,
      };
    case "github":
      return {
        ...baseUser,
        id: String(providerUserData.id),
        email: (providerUserData.email as string) || "",
        name: (providerUserData.name as string) || (providerUserData.login as string),
        providerUserId: String(providerUserData.id),
        avatar: providerUserData.avatar_url as string | undefined,
      };
    case "microsoft":
      return {
        ...baseUser,
        id: providerUserData.id as string,
        email: (providerUserData.mail as string) || (providerUserData.userPrincipalName as string),
        name: providerUserData.displayName as string,
        providerUserId: providerUserData.id as string,
      };
    case "okta":
    case "auth0":
      return {
        ...baseUser,
        id: providerUserData.sub as string,
        email: providerUserData.email as string,
        name: providerUserData.name as string,
        providerUserId: providerUserData.sub as string,
        avatar: providerUserData.picture as string | undefined,
      };
    default:
      return baseUser;
  }
}

export function cleanupExpiredStates(): number {
  const now = new Date();
  let cleaned = 0;

  for (const [state, ssoState] of ssoStates) {
    if (new Date(ssoState.expiresAt) < now) {
      ssoStates.delete(state);
      cleaned++;
    }
  }

  return cleaned;
}

export function getStateCount(): number {
  return ssoStates.size;
}
