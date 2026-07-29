export type SecretPattern = {
  name: string;
  regex: RegExp;
  replaceWith: string;
};

const REDACTED = "[REDACTED_SECRET]";

export const SECRET_PATTERNS: SecretPattern[] = [
  // AWS Credentials
  { name: "AWS Access Key ID", regex: /(AKIA[0-9A-Z]{16})/g, replaceWith: REDACTED },
  { name: "AWS Secret Key", regex: /([^A-Za-z0-9+/=])([A-Za-z0-9+/=]{40})([^A-Za-z0-9+/=]|$)/g, replaceWith: `$1${REDACTED}$3` },

  // API Keys
  { name: "OpenAI / Anthropic API Key", regex: /(sk-[A-Za-z0-9_-]{20,})/g, replaceWith: REDACTED },
  { name: "Generic API Key (header)", regex: /(api[-_]?key['"]?\s*[:=]\s*)['"][^'"]+['"]/gi, replaceWith: `$1"${REDACTED}"` },
  { name: "Generic API Key env", regex: /((?:API_KEY|API_SECRET|APP_SECRET)\s*=\s*)[^\s"']+/g, replaceWith: `$1${REDACTED}` },

  // GitHub Tokens
  { name: "GitHub PAT", regex: /(gh[pousr]_[A-Za-z0-9_]{36,})/g, replaceWith: REDACTED },
  { name: "GitHub OAuth", regex: /(github_pat_[A-Za-z0-9_]{80,})/g, replaceWith: REDACTED },

  // JWT Tokens
  { name: "JWT", regex: /(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g, replaceWith: REDACTED },

  // Database URLs
  { name: "PostgreSQL URL", regex: /(postgres(?:ql)?:\/\/[^@\s]+:[^@\s]+@[^\s]+)/g, replaceWith: REDACTED },
  { name: "MySQL URL", regex: /(mysql:\/\/[^@\s]+:[^@\s]+@[^\s]+)/g, replaceWith: REDACTED },
  { name: "MongoDB URL", regex: /(mongodb(?:\+srv)?:\/\/[^@\s]+:[^@\s]+@[^\s]+)/g, replaceWith: REDACTED },
  { name: "Redis URL", regex: /(redis:\/\/:[^@\s]+@[^\s]+)/g, replaceWith: REDACTED },

  // Connection Strings
  { name: "Generic connection string", regex: /((?:host|server|database|username|password)\s*=\s*)[^\s;"]+/gi, replaceWith: `$1${REDACTED}` },

  // Private Keys
  { name: "PEM Private Key", regex: /(-----BEGIN\s?(?:RSA|EC|DSA|OPENSSH|PRIVATE)\s?KEY-----)[\s\S]*?(-----END\s?(?:RSA|EC|DSA|OPENSSH|PRIVATE)\s?KEY-----)/g, replaceWith: `$1\n${REDACTED}\n$2` },
  { name: "SSH Key", regex: /(-----BEGIN OPENSSH PRIVATE KEY-----)[\s\S]*?(-----END OPENSSH PRIVATE KEY-----)/g, replaceWith: `$1\n${REDACTED}\n$2` },

  // Slack Tokens
  { name: "Slack Bot Token", regex: /(xoxb-[A-Za-z0-9]{10,})/g, replaceWith: REDACTED },
  { name: "Slack User Token", regex: /(xoxp-[A-Za-z0-9]{10,})/g, replaceWith: REDACTED },

  // Generic password/token/secret assignments
  { name: "Password assignment", regex: /((?:password|passwd|pwd)\s*[:=]\s*)['"][^'"]+['"]/gi, replaceWith: `$1"${REDACTED}"` },
  { name: "Token assignment", regex: /((?:token|auth_token|secret|credential)\s*[:=]\s*)['"][^'"]+['"]/gi, replaceWith: `$1"${REDACTED}"` },
];

export const REDACTED_PLACEHOLDER = REDACTED;
