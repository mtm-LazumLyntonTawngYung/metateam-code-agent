export type EvalTask = {
  name: string;
  title: string;
  dir: string;
};

export type EvalStep = {
  toolName: string;
  args: Record<string, unknown>;
  result: { success: boolean; data?: unknown; error?: string };
  duration: number;
};

export type EvalMetrics = {
  totalDuration: number;
  toolCalls: number;
  passed: boolean;
  error?: string;
};

export type EvalResult = {
  task: string;
  passed: boolean;
  duration: number;
  toolCalls: number;
  steps: EvalStep[];
  error?: string;
};
