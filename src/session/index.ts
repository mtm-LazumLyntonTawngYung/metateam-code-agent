export { getDb, closeDb } from "./db";

export {
  createSession,
  getSession,
  listSessions,
  deleteSession,
  addMessage,
  getMessages,
  countSessionTokens,
} from "./history";

export type { MessageRow, SessionRow, MessageRole } from "./history";

export { savePatch, getPatches, getFileVersions } from "./patches";
export type { PatchRow, FileVersion } from "./patches";

export {
  countTokens,
  estimateContextUsage,
  DEFAULT_BUDGET,
} from "./tokens";
export type { TokenBudget, TokenUsage } from "./tokens";

export {
  buildContext,
  rotateIfNeeded,
  getSummaries,
  getLatestSummary,
} from "./summary";
export type { SummaryRow } from "./summary";
