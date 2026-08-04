import { z } from "zod";

export type JsonSchema = {
  type: "object";
  properties: Record<
    string,
    {
      type: "string" | "number" | "boolean" | "array" | "object";
      description?: string;
      default?: unknown;
      items?: { type: "string" | "number" };
    }
  >;
  required?: string[];
};

export type ToolResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: JsonSchema;
  schema?: z.ZodObject<any>;
  execute: (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
};
