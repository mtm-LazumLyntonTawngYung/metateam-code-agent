export * from "./types";

export {
  createSession,
  getSession,
  listSessions,
  updateSession,
  deleteSession,
  endSession,
  archiveSession,
  getActiveSessions,
  getExpiringSessions,
} from "./session-service";

export {
  joinSession,
  leaveSession,
  getParticipant,
  getParticipantByUser,
  getSessionParticipants,
  countParticipants,
  updateParticipantRole,
  updateConnectionStatus,
  updateCursorPosition,
  updateSelection,
  removeInactiveParticipants,
} from "./participant-service";

export {
  grantPermission,
  revokePermission,
  getPermission,
  getSessionPermissions,
  getParticipantPermissions,
  validateAccess,
  hasDomainAccess,
  canPerformAction,
  getEffectiveAccessLevel,
  cleanupExpiredPermissions,
} from "./permission-engine";

export {
  createSessionLink,
  validateSessionLink,
  invalidateSessionLink,
  invalidateAllSessionLinks,
  getSessionLink,
  getSessionLinkByToken,
  getSessionLinks,
  cleanupExpiredLinks,
} from "./session-link-service";

export {
  applyOperation,
  getOperation,
  getSessionOperations,
  getCurrentVersion,
  createSnapshot,
  getSnapshot,
  getSessionSnapshots,
  getLatestSnapshot,
  transformOperation,
} from "./collaboration-service";

export {
  detectConflicts,
  resolveConflict,
  autoResolveConflicts,
  getConflict,
  getUnresolvedConflicts,
  getSessionConflicts,
  getConflictHistory,
} from "./conflict-resolver";

export {
  captureContext,
  getContextSnapshot,
  getSessionContextSnapshots,
  getLatestContextSnapshot,
  updateFileTree,
  updateEnvironment,
  addCommandToHistory,
  addBreakpoint,
  removeBreakpoint,
  addVariableWatch,
  removeVariableWatch,
} from "./context-sharing-service";

export {
  handleWsConnection,
  handleWsDisconnection,
  handleOperation,
  handleCursorPosition,
  handleSelection,
  broadcastToSession,
  getSessionClientCount,
  isUserInSession,
  disconnectAllClients,
} from "./ws-collaboration";

export {
  subscribe,
  subscribeGlobal,
  broadcastSessionEvent,
  getSubscriberCount,
  clearAllHandlers,
} from "./event-bus";

export {
  encrypt,
  decrypt,
  encryptSessionData,
  decryptSessionData,
  generateToken,
  hashToken,
  generateHMAC,
  verifyHMAC,
  generateSessionId,
  generateParticipantColor,
  sanitizeInput,
  validateSessionId,
  validateUserId,
  validateToken,
  isSecureConnection,
  generateRateLimitKey,
  checkRateLimit,
  cleanupExpiredEntries,
  generateCSRFToken,
  validateCSRFToken,
  maskSensitiveData,
  generateAuditId,
  timestampToDate,
  dateToTimestamp,
  isExpired,
  addTimeToNow,
  generateExpiresAt,
} from "./security";

export {
  generateSSOState,
  validateSSOState,
  consumeSSOState,
  generateAuthorizationUrl,
  getProviderBaseUrl,
  getProviderTokenUrl,
  getProviderUserInfoUrl,
  generateCodeVerifier,
  generateCodeChallenge,
  parseSSOCallback,
  mapSSOUser,
  cleanupExpiredStates,
  getStateCount,
} from "./sso-service";

export {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  validateAccessToken,
  validateRefreshToken,
  refreshAccessToken,
  revokeAccessToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  getUserTokens,
  getSessionTokens,
  cleanupExpiredTokens,
  generateSessionToken,
  validateSessionToken,
  getTokenStats,
} from "./token-service";

export {
  checkRateLimit as checkPerformanceRateLimit,
  getRateLimitStatus,
  cleanupExpiredBuckets,
  trackConnection,
  trackDisconnection,
  trackOperation,
  trackError,
  trackRequest,
  getMetrics,
  getHealthStatus,
  resetMetrics,
  createLoadBalancer,
  createConnectionPool,
  debounce,
  throttle,
} from "./performance";

export {
  queueOfflineChange,
  getOfflineChanges,
  markChangeSynced,
  markChangeFailed,
  getPendingChanges,
  clearSyncedChanges,
  setOnlineStatus,
  getOfflineStats,
  mergeOfflineChanges,
  cleanupOldOfflineData,
  listOfflineQueues,
} from "./offline-service";

export { createApiGateway } from "./api-gateway";

export { getDb, closeDb } from "./db";
