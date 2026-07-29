const CURRENT_VERSION = "1.0.0";
const REPO = "mtm-LazumLyntonTawngYung/metateam-code-agent";

export type UpdateInfo = {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  downloadUrl: string | null;
};

let cached: UpdateInfo | null = null;

export async function checkForUpdates(): Promise<UpdateInfo> {
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as {
      tag_name?: string;
      html_url?: string;
    };
    const latestVersion = (data.tag_name ?? "").replace(/^v/, "");

    cached = {
      currentVersion: CURRENT_VERSION,
      latestVersion: latestVersion || null,
      hasUpdate:
        latestVersion !== "" && latestVersion !== CURRENT_VERSION,
      downloadUrl: data.html_url ?? null,
    };
  } catch {
    cached = {
      currentVersion: CURRENT_VERSION,
      latestVersion: null,
      hasUpdate: false,
      downloadUrl: null,
    };
  }

  return cached;
}
