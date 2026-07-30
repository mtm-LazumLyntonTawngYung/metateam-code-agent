import fs from "fs";
import path from "path";
import os from "os";

const AUTH_FILE = path.join(os.homedir(), ".config", "mtc", "auth.json");

const AZURE_CLIENT_ID = process.env.MTC_AZURE_CLIENT_ID ?? "159fbf0f-82f2-4b4e-a1b5-e4734cf9ffc6";
const AZURE_TENANT_ID = process.env.MTC_AZURE_TENANT_ID ?? "30102b23-c817-43f8-b2de-e77962e3a3e0";
const AZURE_CLIENT_SECRET = process.env.MTC_AZURE_CLIENT_SECRET ?? "";

const AUTHORITY = `https://login.microsoftonline.com/${AZURE_TENANT_ID}`;

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
    return JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8")) as AuthData;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  const auth = getAuth();
  if (!auth) return false;
  return Date.now() < new Date(auth.expiresOn).getTime();
}

export function clearAuth(): void {
  try {
    if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
  } catch {
    // ignore
  }
}

export async function initiateSSOLogin(
  onCodeGenerated: (code: string, uri: string) => void,
): Promise<AuthData> {
  const dc = await requestDeviceCode();
  onCodeGenerated(dc.user_code, dc.verification_uri);
  return pollForToken(dc.device_code, dc.interval, dc.expires_in);
}

async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const body = new URLSearchParams({ client_id: AZURE_CLIENT_ID, scope: "openid profile email User.Read" });
  if (AZURE_CLIENT_SECRET) body.set("client_secret", AZURE_CLIENT_SECRET);

  const res = await fetch(`${AUTHORITY}/oauth2/v2.0/devicecode`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`Device code request failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as DeviceCodeResponse;
}

async function pollForToken(deviceCode: string, interval: number, expiresIn: number): Promise<AuthData> {
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    client_id: AZURE_CLIENT_ID,
    device_code: deviceCode,
  });
  if (AZURE_CLIENT_SECRET) body.set("client_secret", AZURE_CLIENT_SECRET);

  const deadline = Date.now() + expiresIn * 1000;

  while (Date.now() < deadline) {
    const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (res.status === 400) {
      const err = (await res.json()) as { error: string; error_description?: string };
      if (err.error === "authorization_pending") { await sleep(interval * 1000); continue; }
      if (err.error === "slow_down") { interval += 5; await sleep(interval * 1000); continue; }
      throw new Error(err.error_description ?? err.error);
    }

    if (!res.ok) throw new Error(`Token polling failed: ${res.status} ${await res.text()}`);

    const tokenRes = (await res.json()) as { access_token: string; id_token?: string; expires_in: number; scope: string };
    const claims = decodeJwt(tokenRes.id_token ?? tokenRes.access_token);
    const userEmail = String(claims?.email ?? claims?.preferred_username ?? claims?.unique_name ?? claims?.upn ?? "");
    const userName = String(claims?.name ?? claims?.given_name ?? "");

    if (!userEmail.endsWith("@metateammyanmar.com")) {
      throw new Error(`Access denied: Must use @metateammyanmar.com account. "${userEmail}" is not allowed.`);
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
    return authData;
  }

  throw new Error("Device code expired. Please try again.");
}

function decodeJwt(token: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}