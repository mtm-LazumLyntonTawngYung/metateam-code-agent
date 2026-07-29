/**
 * Figma MCP Bridge
 *
 * Converts Figma design API responses into React/Tailwind components.
 * Connects to the Figma REST API to fetch file data, then transforms
 * frames, groups, text nodes, and vector elements into JSX.
 *
 * Usage:
 *   1. Set FIGMA_TOKEN environment variable (Figma personal access token)
 *   2. Register in .mtc/mcp.json:
 *      {
 *        "mcpServers": {
 *          "figma": {
 *            "command": "bun",
 *            "args": ["run", "src/mcp-plugins/figma-bridge.ts"]
 *          }
 *        }
 *      }
 *   3. Restart mtc — tools appear under /call
 */

type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

const tools = new Map<string, { def: ToolDef; handler: Handler }>();

function register(def: ToolDef, handler: Handler): void {
  tools.set(def.name, { def, handler });
}

const FIGMA_API = "https://api.figma.com/v1";

function getAuthHeaders(): Record<string, string> {
  const token = process.env.FIGMA_TOKEN ?? process.env.FIGMA_ACCESS_TOKEN ?? "";
  if (!token) throw new Error("FIGMA_TOKEN environment variable is required");
  return { "X-Figma-Token": token };
}

type FigmaNode = {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  fills?: Array<{ type: string; color?: { r: number; g: number; b: number; a?: number }; opacity?: number }>;
  strokes?: Array<{ type: string; color?: { r: number; g: number; b: number; a?: number } }>;
  strokeWeight?: number;
  cornerRadius?: number;
  effects?: Array<{ type: string; radius?: number; offset?: { x: number; y: number }; color?: { r: number; g: number; b: number; a?: number } }>;
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  gap?: number;
  characters?: string;
  style?: { fontSize?: number; fontWeight?: number; fontFamily?: string; textAlignHorizontal?: string; lineHeightPx?: number; letterSpacing?: number };
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  absoluteRenderBounds?: { x: number; y: number; width: number; height: number };
  exportSettings?: Array<{ format: string; constraint?: { type: string; value: number } }>;
  componentProperties?: Record<string, { value: unknown; type: string }>;
};

type FigmaFileResponse = {
  document: FigmaNode;
  components?: Record<string, { key: string; name: string; description: string }>;
};

async function fetchFigmaFile(fileKey: string): Promise<FigmaFileResponse> {
  const res = await fetch(`${FIGMA_API}/files/${fileKey}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Figma API ${res.status}: ${text}`);
  }
  return res.json() as Promise<FigmaFileResponse>;
}

async function fetchFigmaImage(fileKey: string, nodeId: string, format: string = "png"): Promise<string> {
  const res = await fetch(`${FIGMA_API}/images/${fileKey}?ids=${nodeId}&format=${format}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Figma image API ${res.status}`);
  const data = await res.json() as { images?: Record<string, string>; err?: string };
  if (data.err) throw new Error(`Figma error: ${data.err}`);
  return data.images?.[nodeId] ?? "";
}

function figmaColorToTailwind(color: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = color.a ?? 1;

  if (a < 1) return `rgba(${r}, ${g}, ${b}, ${a})`;

  const hex = "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
  return hex;
}

function figmaNodeToTailwind(node: FigmaNode, depth: number = 0): string {
  const indent = "  ".repeat(depth);
  const props: string[] = [];
  const children: string[] = [];

  const box = node.absoluteBoundingBox ?? node.absoluteRenderBounds;

  if (box) {
    const tw: Record<string, string> = {};
    if (node.type !== "TEXT") {
      props.push(`style={{ width: ${Math.round(box.width)}, height: ${Math.round(box.height)} }}`);
    }
  }

  if (node.fills?.length) {
    const solidFill = node.fills.find((f) => f.type === "SOLID");
    if (solidFill?.color) {
      const color = figmaColorToTailwind(solidFill.color);
      props.push(`style={{ backgroundColor: '${color}'${solidFill.opacity != null ? `, opacity: ${solidFill.opacity}` : ""} }}`);
    }
  }

  if (node.strokes?.length) {
    const stroke = node.strokes[0];
    if (stroke?.color) {
      const color = figmaColorToTailwind(stroke.color);
      const weight = node.strokeWeight ?? 1;
      props.push(`style={{ border: '${weight}px solid ${color}' }}`);
    }
  }

  if (node.cornerRadius) {
    props.push(`className="rounded-${mapRadius(node.cornerRadius)}"`);
  }

  if (node.effects?.length) {
    const shadow = node.effects.find((e) => e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW");
    if (shadow) {
      const offset = shadow.offset ?? { x: 0, y: 0 };
      const color = shadow.color ? figmaColorToTailwind(shadow.color) : "rgba(0,0,0,0.1)";
      props.push(`style={{ boxShadow: '${offset.x}px ${offset.y}px ${shadow.radius ?? 4}px ${color}' }}`);
    }
  }

  if (node.layoutMode && node.layoutMode !== "NONE") {
    const flexClass = node.layoutMode === "HORIZONTAL" ? "flex-row" : "flex-col";
    const alignMap: Record<string, string> = {
      MIN: "items-start", CENTER: "items-center", MAX: "items-end", SPACE_BETWEEN: "items-stretch",
    };
    const justifyMap: Record<string, string> = {
      MIN: "justify-start", CENTER: "justify-center", MAX: "justify-end", SPACE_BETWEEN: "justify-between",
    };
    const classes = [flexClass];
    if (node.primaryAxisAlignItems) classes.push(justifyMap[node.primaryAxisAlignItems] ?? "");
    if (node.counterAxisAlignItems) classes.push(alignMap[node.counterAxisAlignItems] ?? "");
    if (node.gap) classes.push(`gap-${mapGap(node.gap)}`);
    props.push(`className="${classes.filter(Boolean).join(" ")}"`);

    if (node.paddingTop != null || node.paddingBottom != null || node.paddingLeft != null || node.paddingRight != null) {
      props.push(`style={{ padding: '${node.paddingTop ?? 0}px ${node.paddingRight ?? 0}px ${node.paddingBottom ?? 0}px ${node.paddingLeft ?? 0}px' }}`);
    }
  }

  if (node.type === "TEXT") {
    const textStyle: string[] = [];
    if (node.style?.fontSize) textStyle.push(`fontSize: ${node.style.fontSize}`);
    if (node.style?.fontWeight) textStyle.push(`fontWeight: ${node.style.fontWeight}`);
    if (node.style?.fontFamily) textStyle.push(`fontFamily: '${node.style.fontFamily}'`);
    if (node.style?.lineHeightPx) textStyle.push(`lineHeight: ${node.style.lineHeightPx}`);
    if (node.style?.textAlignHorizontal && node.style.textAlignHorizontal !== "LEFT") {
      textStyle.push(`textAlign: '${node.style.textAlignHorizontal.toLowerCase()}'`);
    }
    const styleAttr = textStyle.length ? ` style={{ ${textStyle.join(", ")} }}` : "";
    return `${indent}<span${styleAttr}>${escapeHtml(node.characters ?? "")}</span>`;
  }

  if (node.type === "INSTANCE" || node.type === "COMPONENT") {
    const componentName = node.name.replace(/\s+/g, "");
    return `${indent}<${componentName} ${props.join(" ")} />`;
  }

  if (node.type === "RECTANGLE" && !node.children?.length) {
    return `${indent}<div ${props.join(" ")} />`;
  }

  if (node.children?.length) {
    for (const child of node.children) {
      children.push(figmaNodeToTailwind(child, depth + 1));
    }
  }

  const tag = node.type === "FRAME" || node.type === "GROUP" ? "div" : "div";
  const propStr = props.length ? ` ${props.join(" ")}` : "";

  if (children.length === 0) {
    return `${indent}<${tag}${propStr} />`;
  }

  return `${indent}<${tag}${propStr}>\n${children.join("\n")}\n${indent}</${tag}>`;
}

function mapRadius(radius: number): string {
  if (radius <= 2) return "sm";
  if (radius <= 4) return "md";
  if (radius <= 8) return "lg";
  if (radius <= 16) return "xl";
  return "2xl";
}

function mapGap(gap: number): string {
  if (gap <= 2) return "0.5";
  if (gap <= 4) return "1";
  if (gap <= 8) return "2";
  if (gap <= 12) return "3";
  if (gap <= 16) return "4";
  if (gap <= 24) return "6";
  if (gap <= 32) return "8";
  return String(Math.round(gap / 4));
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function generateReactComponent(node: FigmaNode, componentName: string): string {
  const body = figmaNodeToTailwind(node);
  return `import React from 'react';

interface ${componentName}Props {
  className?: string;
}

export function ${componentName}({ className }: ${componentName}Props) {
  return (
${body}
  );
}

export default ${componentName};
`;
}

function generateTailwindConfig(node: FigmaNode): string {
  const colors = new Set<string>();
  const fontSizes = new Set<number>();
  const fontFamilies = new Set<string>();

  function walk(n: FigmaNode): void {
    if (n.fills) {
      for (const f of n.fills) {
        if (f.color) colors.add(figmaColorToTailwind(f.color));
      }
    }
    if (n.strokes) {
      for (const s of n.strokes) {
        if (s.color) colors.add(figmaColorToTailwind(s.color));
      }
    }
    if (n.style?.fontSize) fontSizes.add(n.style.fontSize);
    if (n.style?.fontFamily) fontFamilies.add(n.style.fontFamily);
    if (n.children) n.children.forEach(walk);
  }

  walk(node);

  const colorEntries: string[] = [];
  [...colors].forEach((c, i) => {
    const name = `figma-${i}`;
    colorEntries.push(`        '${name}': '${c}'`);
  });

  return `/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
${colorEntries.join("\n")}
      },
      fontFamily: {
        ${[...fontFamilies].map((f) => `'${f.toLowerCase().replace(/\s+/g, "-")}': ['${f}']`).join(",\n        ")}
      },
    },
  },
};
`;
}

register({
  name: "figma_fetch_file",
  description: "Fetch a Figma file by file key and return its document structure",
  parameters: {
    type: "object",
    properties: {
      fileKey: { type: "string", description: "Figma file key from the share URL" },
      depth: { type: "number", description: "Max depth to traverse (default: 3)" },
    },
    required: ["fileKey"],
  },
}, async (args) => {
  const fileKey = args.fileKey as string;
  const data = await fetchFigmaFile(fileKey);
  return {
    fileKey,
    name: data.document.name,
    nodeCount: countNodes(data.document),
    children: summarizeTree(data.document, (args.depth as number) ?? 3),
  };
});

register({
  name: "figma_export_component",
  description: "Export a Figma node as a React/Tailwind component",
  parameters: {
    type: "object",
    properties: {
      fileKey: { type: "string", description: "Figma file key" },
      nodeId: { type: "string", description: "Node ID to export" },
      componentName: { type: "string", description: "React component name (PascalCase)" },
    },
    required: ["fileKey", "nodeId", "componentName"],
  },
}, async (args) => {
  const fileKey = args.fileKey as string;
  const nodeId = args.nodeId as string;
  const componentName = args.componentName as string;

  const data = await fetchFigmaFile(fileKey);
  const node = findNodeById(data.document, nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const componentCode = generateReactComponent(node, componentName);
  const tailwindConfig = generateTailwindConfig(node);

  return {
    component: componentCode,
    tailwindConfig,
    nodeName: node.name,
    nodeType: node.type,
    childCount: countNodes(node),
  };
});

register({
  name: "figma_list_components",
  description: "List all top-level components and frames in a Figma file",
  parameters: {
    type: "object",
    properties: {
      fileKey: { type: "string", description: "Figma file key" },
    },
    required: ["fileKey"],
  },
}, async (args) => {
  const fileKey = args.fileKey as string;
  const data = await fetchFigmaFile(fileKey);

  const components: Array<{ id: string; name: string; type: string; childCount: number }> = [];

  function findComponents(node: FigmaNode): void {
    if (node.type === "COMPONENT" || node.type === "FRAME" || node.type === "INSTANCE") {
      components.push({ id: node.id, name: node.name, type: node.type, childCount: countNodes(node) });
    }
    if (node.children) node.children.forEach(findComponents);
  }

  findComponents(data.document);

  return {
    fileKey,
    fileName: data.document.name,
    components: components.slice(0, 100),
    total: components.length,
  };
});

register({
  name: "figma_export_image",
  description: "Export a Figma node as an image (PNG by default)",
  parameters: {
    type: "object",
    properties: {
      fileKey: { type: "string", description: "Figma file key" },
      nodeId: { type: "string", description: "Node ID to export" },
      format: { type: "string", description: "Image format: png, jpg, svg, pdf (default: png)" },
    },
    required: ["fileKey", "nodeId"],
  },
}, async (args) => {
  const fileKey = args.fileKey as string;
  const nodeId = args.nodeId as string;
  const format = (args.format as string) ?? "png";
  const imageUrl = await fetchFigmaImage(fileKey, nodeId, format);
  return { url: imageUrl, format, nodeId };
});

function findNodeById(node: FigmaNode, id: string): FigmaNode | null {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
}

function countNodes(node: FigmaNode): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children) count += countNodes(child);
  }
  return count;
}

function summarizeTree(node: FigmaNode, maxDepth: number, depth: number = 0): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  if (depth < maxDepth && node.children?.length) {
    result.children = node.children.map((c) => summarizeTree(c, maxDepth, depth + 1));
  } else if (node.children?.length) {
    result.childCount = node.children.length;
  }

  return result;
}

// JSON-RPC over stdin/stdout
process.stdin.on("data", async (buffer) => {
  for (const line of buffer.toString().split("\n").filter(Boolean)) {
    try {
      const req = JSON.parse(line);
      if (req.method === "initialize") {
        console.log(JSON.stringify({
          jsonrpc: "2.0", id: req.id, result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
          },
        }));
      } else if (req.method === "tools/list") {
        console.log(JSON.stringify({
          jsonrpc: "2.0", id: req.id, result: {
            tools: [...tools.values()].map((t) => t.def),
          },
        }));
      } else if (req.method === "tools/call") {
        const tool = tools.get(String((req.params as Record<string, unknown>).name ?? ""));
        if (!tool) {
          console.log(JSON.stringify({
            jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `Tool not found: ${req.params}` },
          }));
          return;
        }
        try {
          const result = await tool.handler((req.params as Record<string, unknown>).arguments as Record<string, unknown> ?? {});
          console.log(JSON.stringify({
            jsonrpc: "2.0", id: req.id, result: {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            },
          }));
        } catch (err) {
          console.log(JSON.stringify({
            jsonrpc: "2.0", id: req.id, error: {
              code: -32603, message: err instanceof Error ? err.message : String(err),
            },
          }));
        }
      }
    } catch {
      // ignore parse errors
    }
  }
});
