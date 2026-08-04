/**
 * Configuration schema, defaults, validation, and sanitization.
 *
 * The dashboard uses this module to expose a self-describing configuration
 * system: the schema drives the editor UI, PUT validation, and default values.
 * Secrets are masked when returned to the browser.
 */

export type ConfigFieldType = "string" | "number" | "boolean" | "stringArray" | "object";

export type ConfigField = {
  key: string;
  label: string;
  type: ConfigFieldType;
  description?: string;
  default?: unknown;
  secret?: boolean;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  enum?: string[];
  fields?: ConfigField[];
};

const URL_PATTERN = "^https?://";

export const CONFIG_SCHEMA: ConfigField[] = [
  {
    key: "apiKey",
    label: "Default API Key",
    type: "string",
    description: "Fallback API key used when a provider has no key configured.",
    secret: true,
    default: "",
  },
  {
    key: "endpoint",
    label: "Default Endpoint",
    type: "string",
    description: "Fallback API endpoint URL for providers without an explicit base URL.",
    default: "",
    pattern: URL_PATTERN,
  },
  {
    key: "selectedModel",
    label: "Selected Model",
    type: "string",
    description: "Model used for the main agent loop.",
    default: "",
  },
  {
    key: "agentId",
    label: "Default Agent",
    type: "string",
    description: "Agent used when no explicit agent is selected.",
    default: "primary",
  },
  {
    key: "themeId",
    label: "Theme",
    type: "string",
    description: "UI theme identifier.",
    default: "default",
  },
  {
    key: "organization",
    label: "Organization",
    type: "object",
    fields: [
      {
        key: "name",
        label: "Organization Name",
        type: "string",
        description: "Company or team name used for provisioning and license metadata.",
        default: "",
      },
    ],
  },
  {
    key: "auth",
    label: "Single Sign-On",
    type: "object",
    fields: [
      { key: "clientId", label: "Client ID", type: "string", default: "" },
      { key: "tenantId", label: "Tenant ID", type: "string", default: "" },
      { key: "clientSecret", label: "Client Secret", type: "string", secret: true, default: "" },
    ],
  },
  {
    key: "telemetry",
    label: "Telemetry",
    type: "object",
    fields: [
      {
        key: "enabled",
        label: "Enabled",
        type: "boolean",
        description: "Opt-in usage analytics. Off by default.",
        default: false,
      },
      {
        key: "endpoint",
        label: "Ingest Endpoint",
        type: "string",
        description: "Where telemetry events are posted.",
        default: "",
        pattern: URL_PATTERN,
      },
    ],
  },
  {
    key: "webSearch",
    label: "Web Search",
    type: "object",
    description: "Configuration for web search integration.",
    fields: [
      {
        key: "enabled",
        label: "Enabled",
        type: "boolean",
        description: "Enable web search tool. Requires agent bash permission.",
        default: false,
      },
    ],
  },
  {
    key: "permissions",
    label: "Tool Permissions",
    type: "object",
    description:
      "Tool permission rules (allow/ask/deny) and tools always allowed without prompting.",
    default: {},
  },
  {
    key: "llm",
    label: "LLM Providers",
    type: "object",
    fields: [
      {
        key: "routing",
        label: "Model Routing",
        type: "object",
        fields: [
          {
            key: "simpleModel",
            label: "Simple Tasks",
            type: "string",
            description: "Fast, cheap model for simple requests.",
            default: "gpt-4o-mini",
          },
          {
            key: "defaultModel",
            label: "Default Tasks",
            type: "string",
            default: "deepseek-chat",
          },
          {
            key: "reasoningModel",
            label: "Reasoning Tasks",
            type: "string",
            description: "Capable model for complex reasoning.",
            default: "claude-sonnet-4-20250514",
          },
          {
            key: "reasoningEnabled",
            label: "Reasoning Mode",
            type: "boolean",
            description: "Enable chain-of-thought reasoning for complex tasks.",
            default: false,
          },
        ],
      },
      {
        key: "providers",
        label: "Providers",
        type: "stringArray",
        description: "Provider entries (id, label, apiKey, baseUrl, models).",
        default: [],
      },
    ],
  },
];

type FieldLookup = { schema: ConfigField; path: string; parent?: ConfigField };

export function flattenSchema(fields: ConfigField[] = CONFIG_SCHEMA, prefix = ""): FieldLookup[] {
  const out: FieldLookup[] = [];
  for (const f of fields) {
    const path = prefix ? `${prefix}.${f.key}` : f.key;
    out.push({ schema: f, path });
    if (f.fields) out.push(...flattenSchema(f.fields, path));
  }
  return out;
}

export function getConfigDefaults(fields: ConfigField[] = CONFIG_SCHEMA, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const path = prefix ? `${prefix}.${f.key}` : f.key;
    if (f.fields) {
      out[f.key] = getConfigDefaults(f.fields, path);
    } else if (f.type === "boolean") {
      out[f.key] = f.default ?? false;
    } else if (f.type === "number") {
      out[f.key] = f.default ?? 0;
    } else if (f.type === "stringArray") {
      out[f.key] = f.default ?? [];
    } else {
      out[f.key] = f.default ?? "";
    }
  }
  return out;
}

export function maskConfig(value: unknown, fields: ConfigField[] = CONFIG_SCHEMA): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => maskConfig(v, fields));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const field = fields.find((f) => f.key === k);
      if (field?.secret && typeof v === "string" && v !== "") {
        out[k] = v.length > 8 ? "********".slice(0, Math.min(8, v.length)) : "*".repeat(v.length);
      } else if (field?.fields) {
        out[k] = maskConfig(v, field.fields);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return value;
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function validateValue(field: ConfigField, value: unknown, errors: string[], label: string): boolean {
  if (value === undefined || value === null || value === "") {
    if (field.required) errors.push(`${label} is required`);
    return false;
  }
  if (field.type === "boolean") {
    if (typeof value !== "boolean") {
      errors.push(`${label} must be a boolean`);
      return false;
    }
    return true;
  }
  if (field.type === "number") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) {
      errors.push(`${label} must be a number`);
      return false;
    }
    if (field.min !== undefined && n < field.min) errors.push(`${label} must be at least ${field.min}`);
    if (field.max !== undefined && n > field.max) errors.push(`${label} must be at most ${field.max}`);
    return true;
  }
  if (field.type === "string") {
    if (typeof value !== "string") {
      errors.push(`${label} must be a string`);
      return false;
    }
    if (field.pattern && !new RegExp(field.pattern).test(value)) {
      errors.push(`${label} must match the expected format`);
      return false;
    }
    if (field.enum && !field.enum.includes(value)) {
      errors.push(`${label} must be one of: ${field.enum.join(", ")}`);
      return false;
    }
    if (field.max !== undefined && value.length > field.max)
      errors.push(`${label} must be at most ${field.max} characters`);
    return true;
  }
  if (field.type === "stringArray") {
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      errors.push(`${label} must be an array of strings`);
      return false;
    }
    return true;
  }
  if (field.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      errors.push(`${label} must be an object`);
      return false;
    }
    return true;
  }
  return true;
}

/**
 * Validate a partial config object against the schema. Returns the normalized
 * patch (only keys present in the schema) and any validation errors.
 */
export function validateConfig(patch: unknown, fields: ConfigField[] = CONFIG_SCHEMA, prefix = ""): {
  ok: boolean;
  normalized: Record<string, unknown>;
  errors: string[];
} {
  const errors: string[] = [];
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return { ok: false, normalized: {}, errors: ["Configuration must be a JSON object"] };
  }
  const input = patch as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};

  for (const field of fields) {
    const label = prefix ? `${prefix}.${field.key}` : field.key;
    if (!hasOwn(input, field.key)) {
      if (field.required) errors.push(`${label} is required`);
      continue;
    }
    const value = input[field.key];
    if (field.fields) {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const nested = validateConfig(value, field.fields, label);
        errors.push(...nested.errors.map((e) => e));
        normalized[field.key] = nested.normalized;
      } else if (value === undefined || value === null) {
        normalized[field.key] = value;
      } else {
        errors.push(`${label} must be an object`);
      }
      continue;
    }
    if (validateValue(field, value, errors, label)) {
      normalized[field.key] = value;
    }
  }
  return { ok: errors.length === 0, normalized, errors };
}
