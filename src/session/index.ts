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

export {
  savePatch,
  getPatches,
  getPatchesForFile,
  getFileVersions,
  recordPatch,
  getPatchSessionId,
  withPatchContext,
  revertFileToVersion,
} from "./patches";
export type { PatchRow, FileVersion, RevertResult } from "./patches";

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

export {
  recordTurn,
  getSessionTurns,
  getSessionTurnStats,
} from "./turns";
export type { TurnRow } from "./turns";
