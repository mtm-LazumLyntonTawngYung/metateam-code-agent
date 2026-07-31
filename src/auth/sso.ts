import fs from "fs";
import path from "path";
import os from "os";
import { loadConfig } from "../config";

const AUTH_FILE = path.join(os.homedir(), ".config", "mtc", "auth.json");

function readEnvVar(name: string): string | undefined {
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv;
  try {
    const cfg = loadConfig() as Record<string, unknown>;
    const auth = cfg.auth as Record<string, string> | undefined;
    if (auth?.[name]) return auth[name];
  } catch {
    // ignore
  }
  return undefined;
}

const AZURE_CLIENT_ID =
  readEnvVar("MTC_AZURE_CLIENT_ID") ?? process.env.MTC_AZURE_CLIENT_ID ?? "";
const AZURE_TENANT_ID =
  readEnvVar("MTC_AZURE_TENANT_ID") ?? process.env.MTC_AZURE_TENANT_ID ?? "";
const AZURE_CLIENT_SECRET =
  readEnvVar("MTC_AZURE_CLIENT_SECRET") ?? process.env.MTC_AZURE_CLIENT_SECRET ?? "";

const AUTHORITY = AZURE_TENANT_ID
  ? `https://login.microsoftonline.com/${AZURE_TENANT_ID}`
  : null;

function withSecret(body: URLSearchParams): URLSearchParams {
  if (AZURE_CLIENT_SECRET) {
    body.set("client_secret", AZURE_CLIENT_SECRET);
  }
  return body;
}

export interface AuthData {
  accessToken: string;
  idToken?: string;
  userEmail: string;
  userName?: string;
  expiresOn: string;
  scope: string;
}

export interface DeviceCodeResponse {
  user_code: string;
  device_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

export function getAuthFilePath(): string {
  return AUTH_FILE;
}

export function getAuth(): AuthData | null {
  try {
    if (!fs.existsSync(AUTH_FILE)) return null;
    const raw = fs.readFileSync(AUTH_FILE, "utf-8");
    return JSON.parse(raw) as AuthData;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  const auth = getAuth();
  if (!auth) return false;
  const expires = new Date(auth.expiresOn).getTime();
  return Date.now() < expires;
}

export function clearAuth(): void {
  try {
    if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
  } catch {
    // ignore
  }
}

export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  if (!AZURE_CLIENT_ID || !AZURE_TENANT_ID) {
    throw new Error(
      "Azure AD credentials not configured. Set MTC_AZURE_CLIENT_ID and MTC_AZURE_TENANT_ID environment variables.",
    );
  }
  const body = withSecret(new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    scope: "openid profile email User.Read",
  }));

  const url = `${AUTHORITY}/oauth2/v2.0/devicecode`;
  console.error(`[mtc auth] POST ${url}`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[mtc auth] device code error: ${res.status} ${text}`);
    throw new Error(`Device code request failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as DeviceCodeResponse;
  console.error(`[mtc auth] device code obtained: ${data.user_code}, expires in ${data.expires_in}s`);
  return data;
}

export async function pollForToken(
  deviceCode: string,
  interval: number,
  expiresIn: number,
  onPoll?: () => void,
): Promise<AuthData> {
  const body = withSecret(new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    client_id: AZURE_CLIENT_ID,
    device_code: deviceCode,
  }));

  const deadline = Date.now() + expiresIn * 1000;
  let pollCount = 0;

  while (Date.now() < deadline) {
    if (onPoll) onPoll();
    pollCount++;

    const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (res.status === 400) {
      const err = (await res.json()) as { error: string; error_description?: string };
      if (err.error === "authorization_pending") {
        console.error(`[mtc auth] poll #${pollCount}: pending, waiting ${interval}s`);
        await sleep(interval * 1000);
        continue;
      }
      if (err.error === "slow_down") {
        interval += 5;
        console.error(`[mtc auth] poll #${pollCount}: slow_down, new interval ${interval}s`);
        await sleep(interval * 1000);
        continue;
      }
      console.error(`[mtc auth] poll #${pollCount} error: ${err.error} - ${err.error_description}`);
      throw new Error(err.error_description ?? err.error);
    }

    if (!res.ok) {
      const text = await res.text();
      console.error(`[mtc auth] poll #${pollCount} HTTP ${res.status}: ${text}`);
      throw new Error(`Token polling failed: ${res.status} ${text}`);
    }

    const tokenRes = (await res.json()) as {
      access_token: string;
      id_token?: string;
      expires_in: number;
      scope: string;
    };

    console.error(`[mtc auth] poll #${pollCount}: tokens received, decoding claims`);

    const rawIdToken = tokenRes.id_token ?? tokenRes.access_token;
    const decodedId = decodeJwtPayload(rawIdToken);
    console.error(`[mtc auth] decoded claims:`, JSON.stringify(decodedId, null, 2));

    const userEmail = String(
      decodedId?.email ??
      decodedId?.preferred_username ??
      decodedId?.unique_name ??
      decodedId?.upn ??
      "",
    );
    const userName = String(
      decodedId?.name ??
      decodedId?.given_name ??
      decodedId?.family_name ??
      "",
    );

    console.error(`[mtc auth] extracted email: "${userEmail}", name: "${userName}"`);

    if (!userEmail.endsWith("@metateammyanmar.com")) {
      throw new Error(
        `Access denied: You must log in with an @metateammyanmar.com account. "${userEmail}" is not allowed.`,
      );
    }

    const authData: AuthData = {
      accessToken: tokenRes.access_token,
      idToken: tokenRes.id_token,
      userEmail,
      userName,
      expiresOn: new Date(Date.now() + tokenRes.expires_in * 1000).toISOString(),
      scope: tokenRes.scope,
    };

    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2));
    console.error(`[mtc auth] saved to ${AUTH_FILE}`);

    return authData;
  }

  throw new Error("Device code expired. Please try again.");
}

export async function verifyWithDeviceCode(deviceCode: string): Promise<AuthData> {
  return pollForToken(deviceCode, 5, 900);
}

export async function initiateSSOLogin(
  onCodeGenerated: (code: string, uri: string) => void,
): Promise<AuthData> {
  const deviceCode = await requestDeviceCode();
  onCodeGenerated(deviceCode.user_code, deviceCode.verification_uri);
  return pollForToken(deviceCode.device_code, deviceCode.interval, deviceCode.expires_in);
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return {};
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}