import { loadConfig } from "../config";
import type { ToolDefinition } from "./schema";

const websearchTool: ToolDefinition = {
  name: "websearch",
  description:
    "Search the web for current information. Returns top results with titles, URLs, and snippets. Only available when web search is enabled in config.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query string",
      },
      max_results: {
        type: "number",
        description: "Maximum number of results to return (default: 5, max: 10)",
        default: 5,
      },
    },
    required: ["query"],
  },
  execute(args) {
    const cfg = loadConfig();
    if (!cfg.webSearch?.enabled) {
      return {
        success: false,
        error: "Web search is not enabled. Set webSearch.enabled to true in config.",
      };
    }

    const query = args.query as string;
    const maxResults = Math.min((args.max_results as number | undefined) ?? 5, 10);

    return fetchSearchResults(query, maxResults);
  },
};

async function fetchSearchResults(query: string, maxResults: number): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      return {
        success: false,
        error: `Search request failed with status ${res.status}`,
      };
    }

    const html = await res.text();
    const results = parseDuckDuckGoResults(html, maxResults);

    if (results.length === 0) {
      return {
        success: false,
        error: "No search results found",
      };
    }

    return {
      success: true,
      data: { query, results },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function parseDuckDuckGoResults(html: string, maxResults: number): Array<{
  title: string;
  url: string;
  snippet: string;
}> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];

  const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
  const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/gi;

  let match;
  const titles: string[] = [];
  const urls: string[] = [];

  while ((match = resultRegex.exec(html)) !== null && urls.length < maxResults) {
    urls.push(match[1]);
    titles.push(match[2].replace(/<[^>]+>/g, "").trim());
  }

  const snippets: string[] = [];
  while ((match = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
    snippets.push(match[1].replace(/<[^>]+>/g, "").trim());
  }

  for (let i = 0; i < Math.min(maxResults, titles.length); i++) {
    results.push({
      title: titles[i],
      url: urls[i],
      snippet: snippets[i] ?? "",
    });
  }

  return results;
}

export default websearchTool;
