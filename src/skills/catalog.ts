import type { Skill } from "./types";

const CATALOG: Skill[] = [
  { id: "ai-rag", name: "AI RAG", description: "RAG and search engineering — chunking, hybrid retrieval, reranking, and nDCG evaluation", category: "ai", status: "available", origin: "bundled", tags: ["rag", "search", "retrieval"] },
  { id: "bun-development", name: "Bun Development", description: "Fast JavaScript/TypeScript development with the Bun runtime", category: "development", status: "available", origin: "bundled", tags: ["bun", "javascript", "typescript"] },
  { id: "cloudflare-one", name: "Cloudflare One", description: "Cloudflare One Zero Trust and SASE — Access, Gateway, WARP, Tunnel, DLP, CASB", category: "operations", status: "available", origin: "bundled", tags: ["cloudflare", "zero-trust", "sase"] },
  { id: "code-review", name: "Code Review", description: "AI-powered code review using CodeRabbit", category: "development", status: "available", origin: "bundled", tags: ["review", "quality", "automation"] },
  { id: "customize-opencode", name: "Customize OpenCode", description: "Configure opencode itself — agents, skills, plugins, MCP servers, permissions", category: "utility", status: "available", origin: "bundled", tags: ["opencode", "config", "customization"] },
  { id: "dashboard-builder", name: "Dashboard Builder", description: "Build monitoring dashboards for Grafana, SigNoz, and similar platforms", category: "operations", status: "available", origin: "bundled", tags: ["monitoring", "grafana", "dashboard"] },
  { id: "find-skills", name: "Find Skills", description: "Discover and install agent skills for new capabilities", category: "utility", status: "available", origin: "bundled", tags: ["skills", "discovery"] },
  { id: "nextjs-developer", name: "Next.js Developer", description: "Build Next.js 14+ apps with App Router, server components, and server actions", category: "development", status: "available", origin: "bundled", tags: ["nextjs", "react", "app-router"] },
  { id: "opentui", name: "OpenTUI", description: "Build terminal user interfaces with Core, React, or Solid APIs", category: "development", status: "available", origin: "bundled", tags: ["tui", "terminal", "react"] },
  { id: "ponytail", name: "Ponytail", description: "Force the laziest solution — simplest, shortest, most minimal", category: "development", status: "available", origin: "bundled", tags: ["simplicity", "yagni", "minimal"] },
  { id: "powerpoint-slides", name: "PowerPoint Slides", description: "Create rich .pptx presentations from papers, notes, or any content", category: "utility", status: "available", origin: "bundled", tags: ["presentation", "pptx", "slides"] },
  { id: "spec-driven-development", name: "Spec-Driven Development", description: "Three-phase feature development: Requirements → Design → Tasks", category: "development", status: "available", origin: "bundled", tags: ["spec", "design", "planning"] },
  { id: "tdd", name: "TDD", description: "Test-driven development — red-green-refactor workflow", category: "development", status: "available", origin: "bundled", tags: ["testing", "tdd", "quality"] },
  { id: "wrangler", name: "Wrangler", description: "Cloudflare Workers CLI — deploy and manage Workers, KV, R2, D1, and more", category: "operations", status: "available", origin: "bundled", tags: ["cloudflare", "workers", "serverless"] },
  { id: "xlsx", name: "XLSX", description: "Create and edit spreadsheets — .xlsx, .csv, .tsv input and output", category: "utility", status: "available", origin: "bundled", tags: ["spreadsheet", "excel", "data"] },
];

export function getCatalog(): Skill[] {
  return CATALOG.map((s) => ({ ...s }));
}
