import { z } from "zod";
import type { ToolDefinition, ToolResult } from "./schema";
import { runTaskSubagent, runParallelSubagents } from "../agents/subagent";
import { getAgentById, getSubagents } from "../agents/index";
import type { AgentDefinition } from "../agents/types";
import {
  createEnhancedAgent,
  createTask,
  routeTask,
  completeTask,
  failTask,
  getTaskStats,
} from "../multi-agent/index";

const TaskSchema = z.object({
  description: z
    .string()
    .describe("A concise description of the task, used for scheduling and to show the user what the subagent is doing."),
  prompt: z
    .string()
    .describe("The full instructions to hand to the subagent. Be specific about the goal and the expected output."),
  agent: z
    .string()
    .optional()
    .describe("Subagent to run (id or name). Defaults to the built-in 'explore' agent."),
  tasks: z
    .array(
      z.object({
        description: z.string(),
        prompt: z.string(),
        agent: z.string().optional(),
      }),
    )
    .optional()
    .describe("Optional list of subtasks to run in parallel. When provided, 'prompt' is ignored."),
});

export function resolveSubagent(idOrName: string | undefined): AgentDefinition | null {
  if (!idOrName) {
    return getSubagents()[0] ?? getAgentById("explore");
  }
  return getAgentById(idOrName) ?? getSubagents().find((a) => a.name === idOrName) ?? null;
}

export function dispatchParallelThroughRouter(
  tasks: Array<{ description: string; prompt: string; agent?: string }>,
): string {
  const subagents = getSubagents();
  let created = 0;
  for (const t of tasks) {
    const agent = resolveSubagent(t.agent);
    if (!agent) continue;
    const enhanced = createEnhancedAgent(
      {
        id: agent.id,
        name: agent.name,
        mode: agent.mode,
        permissions: agent.permissions,
        systemPrompt: agent.systemPrompt,
      },
      [{
        id: "codebase",
        name: "Codebase",
        description: "Navigate and modify the codebase",
        requiredPermissions: [],
        proficiencyScore: 5,
        executionTimeEstimate: 30000,
        resourceRequirements: { cpuWeight: 1, memoryMB: 256, ioWeight: 1, networkWeight: 0 },
      }],
    );
    void enhanced;
    if (!subagents.some((s) => s.id === agent.id)) {
      createTask(t.description, t.description.slice(0, 120), ["codebase"]);
      created++;
    }
  }
  return `Queued ${created} parallel subtask(s) via the multi-agent task router.`;
}

async function runSingle(
  description: string,
  prompt: string,
  agent: AgentDefinition,
  signal?: AbortSignal,
): Promise<ToolResult> {
  try {
    const result = await runTaskSubagent({
      description,
      prompt,
      agent,
      signal,
      maxIterations: 15,
    });
    return {
      success: true,
      data: {
        output: result.output,
        toolCalls: result.toolCalls,
        durationMs: result.duration,
        agent: agent.name,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `Subagent '${agent.name}' failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

const taskTool: ToolDefinition = {
  name: "task",
  description:
    "Delegate a well-scoped task to a subagent. Provide a clear description and a self-contained prompt. " +
    "Use this to search code, gather context, or draft solutions in parallel without disturbing the main agent's context. " +
    "Subagents are permission-limited and cannot spawn further subagents.",
  parameters: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description: "Concise summary of what the subagent should do.",
      },
      prompt: {
        type: "string",
        description: "Full instructions for the subagent.",
      },
      agent: {
        type: "string",
        description: "Subagent id or name (default: explore).",
      },
      tasks: {
        type: "object",
        description: "Parallel subtask list. Items have description, prompt, and optional agent.",
      },
    },
    required: ["description"],
  },
  schema: TaskSchema,
  async execute(args) {
    const parsed = TaskSchema.parse(args);
    const tasks = parsed.tasks ?? [];

    if (tasks.length > 0) {
      dispatchParallelThroughRouter(tasks);
      const results = await runParallelSubagents({
        tasks: tasks.map((t) => ({
          description: t.description,
          prompt: t.prompt,
          agent: resolveSubagent(t.agent) ?? undefined,
        })),
        concurrency: 4,
      });
      return {
        success: true,
        data: {
          results: results.map((r, i) => ({
            description: tasks[i]?.description ?? `task ${i + 1}`,
            output: r.output,
            toolCalls: r.toolCalls,
            durationMs: r.duration,
          })),
          router: getTaskStats(),
        },
      };
    }

    if (!parsed.prompt) {
      return {
        success: false,
        error: "Either 'prompt' or a non-empty 'tasks' array is required.",
      };
    }

    const agent = resolveSubagent(parsed.agent);
    if (!agent) {
      return {
        success: false,
        error: `Unknown subagent '${parsed.agent}'. Available: ${getSubagents().map((a) => `${a.id} (${a.name})`).join(", ")}`,
      };
    }
    return runSingle(parsed.description, parsed.prompt, agent);
  },
};

export default taskTool;
