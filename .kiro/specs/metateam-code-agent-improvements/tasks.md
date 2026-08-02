# Implementation Plan: MetaTeam Code Agent Improvements

## Overview

Implement comprehensive improvements to the MetaTeam Code Agent (MTC) across four phases: Security Hardening, Core Correctness Fixes, Missing Feature Implementation, and Cleanup & Polish. This 13-week plan transforms MTC into a production-ready terminal-first AI coding assistant competitive with Kilo Code CLI and OpenCode CLI.

## Tasks

### Phase 1: Security Hardening (Weeks 1-3)

- [x] 1. Implement webhook authentication security gateway
  - [x] 1.1 Create SecurityGateway interface with validateWebhookRequest method
    - Implement constant-time signature/token comparison using crypto.timingSafeEqual
    - Support both GitHub (x-hub-signature-256) and GitLab (x-gitlab-token) validation
    - Return {ok: boolean, status: number, message: string} for testability
    - _Requirements: 1.1, 1.2_
  
  - [x]* 1.2 Write property test for webhook validation
    - **Property 1: Security Validation Consistency**
    - **Validates: Requirements 1.1, 1.2**
  
  - [x] 1.3 Implement path traversal prevention
    - Validate repository clone URLs with strict regex patterns
    - Resolve and assert file paths stay within clone directory
    - Implement safe path resolution utilities
    - _Requirements: 1.3, 1.4_

- [x] 2. Redesign license system with canonical format
  - [x] 2.1 Implement LicenseManager with generateLicenseKey and parseLicenseKey
    - Use canonical format: MTC-<tier>-<base64url(payload)>-<hmac>
    - Implement HMAC verification with configurable secret
    - Enforce expiry dates at read time (fail-closed)
    - _Requirements: 1.5, 1.6_
  
  - [x]* 2.2 Write property test for license system
    - **Property 3: License System Integrity**
    - **Validates: Requirements 1.5, 1.6**
  
  - [x] 2.3 Update CLI to warn when generating without MTC_LICENSE_SECRET
    - Add clear CLI warning in cli.tsx (lines 247-275)
    - Update CHANGELOG.md for breaking changes
    - _Requirements: 1.6_

- [x] 3. Implement SSO hardening improvements
  - [x] 3.1 Update SSO system to support public-client device flow
    - Make client_secret optional based on MTC_AZURE_CLIENT_SECRET presence
    - Write auth.json with 0600 file permissions
    - Add domain validation: @metateammyanmar.com only
    - _Requirements: 1.8_
  
  - [x] 3.2 Fix config/env alignment for SSO
    - Add auth config to MtcConfig (config/index.ts)
    - Ensure consistent env → config resolution across sso.ts and LoginScreen
    - Implement consistent failure state handling
    - _Requirements: 1.8, 4.4_

- [x] 4. Checkpoint - Security phase validation
  - Ensure all security tests pass, ask the user if questions arise.

- [x] 5. Implement XSS protection and default permission tightening
  - [x] 5.1 Add escapeHtml() helper and apply to all dashboard interpolations
    - Apply to audit table (line 750), overview (768-777), org/user pages
    - Sanitize x-forwarded-for in login-failure detail
    - _Requirements: 1.7_
  
  - [x] 5.2 Tighten custom agent default permissions
    - Update DEFAULT_PERMS to read: allow, edit: deny, bash: deny, execute: deny
    - Update mtc init template to match
    - _Requirements: 1.9_
  
  - [x]* 5.3 Write property test for input sanitization
    - **Property 2: Input Sanitization Safety**
    - **Validates: Requirements 1.3, 1.4, 1.7**

### Phase 2: Core Correctness Fixes (Weeks 4-5)

- [x] 6. Fix token limit regression and model registry issues
  - [x] 6.1 Restore DEFAULT_MAX_TOKENS to 4096 or derive from model capabilities
    - Update agent-loop.ts:24 to use findModel(modelId)?.maxTokens ?? 4096
    - Update llm/client.ts to use model-specific token limits
    - _Requirements: 2.1_
  
  - [x] 6.2 Clean up model registry and fix DeepSeek Flash duplicate
    - Remove duplicate DeepSeek Flash entry from KNOWN_MODELS
    - Fix incorrect token limits (maxTokens:200/contextWindow:6200)
    - Update DEFAULT_ROUTING.fast to use valid model ID
    - _Requirements: 2.2_

- [x] 7. Implement file size guards and CRLF handling
  - [x] 7.1 Enforce 10MB file size limit with correct error display
    - Update MAX_FILE_SIZE to 10 * 1024 * 1024
    - Fix error display math (size / (1024*1024))
    - Apply same fix to webhook.ts:45
    - _Requirements: 2.3_
  
  - [x]* 7.2 Write property test for resource management bounds
    - **Property 5: Resource Management Bounds**
    - **Validates: Requirements 2.1, 2.3, 8.1, 8.4**
  
  - [x] 7.3 Implement CRLF normalization for frontmatter parsing
    - Add content.replace(/\r\n/g, "\n") before regex match in frontmatter.ts
    - Fix parseScalar to not coerce quoted or non-integer strings
    - Apply same normalization to AGENTS.md frontmatter strip in rules.ts:47
    - _Requirements: 2.4_

- [x] 8. Fix MCP lifecycle bugs and fallback timeout
  - [x] 8.1 Fix MCP error attribution and tool cleanup
    - Fix iteration of filtered entries for proper error attribution
    - Track Map<serverName, toolName[]> for proper cleanup
    - Namespace MCP tools as {server}/{tool} consistently
    - _Requirements: 2.5_
  
  - [x] 8.2 Implement proper timeout abortion using AbortSignal
    - Add signal?: AbortSignal to CompletionRequest
    - Pass controller signal through to fetch calls
    - Add openrouter to priority map
    - _Requirements: 2.6_
  
  - [x]* 8.3 Write property test for concurrency safety
    - **Property 7: Concurrency Safety**
    - **Validates: Requirements 2.6, 2.8, 3.3, 8.2**

- [x] 9. Checkpoint - Core correctness validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Fix model picker and verify session deletion
  - [x] 10.1 Filter ModelPicker to only configured models
    - Update ModelPicker.tsx:17 to filter to getConfiguredModelIds()
    - Show warning and setup hint when no models configured
    - _Requirements: 2.7_
  
  - [x]* 10.2 Write property test for configuration consistency
    - **Property 6: Configuration Consistency**
    - **Validates: Requirements 2.7, 3.1, 4.4, 6.4**
  
  - [x] 10.3 Verify session deletion works correctly
    - Confirm SessionsView.tsx:67 deletion cleanly switches sessions
    - Verify App.tsx handleDeleteSession → handleNewSession works
    - No code change expected, just validation
    - _Requirements: 2.8_

### Phase 3: Missing Feature Implementation (Weeks 6-9)

- [ ] 11. Wire rules and skills into system prompt
  - [ ] 11.1 Extend runAgentLoop to use getEffectiveSystemPrompt(agent)
    - Append active-skill body to system prompt
    - Update src/agents/index.ts signature to take agent parameter
    - Have App.tsx pass active skill's body properly
    - _Requirements: 3.1_

- [ ] 12. Implement context rotation and database-backed history
  - [ ] 12.1 Build messages from buildContext(sessionId, systemPrompt)
    - Update runAgentLoop to use session context instead of completionHistoryRef
    - Call rotateIfNeeded(sessionId) before each iteration
    - Update App.tsx to support new context flow
    - _Requirements: 3.2_
  
  - [ ]* 12.2 Write property test for session state management
    - **Property 8: Session State Management**
    - **Validates: Requirements 3.2, 7.4**
  
  - [ ] 12.3 Implement SQLite database for session persistence
    - Create database schema for sessions and messages
    - Implement CRUD operations for session management
    - Add migration system for database schema updates
    - _Requirements: 3.2_

- [ ] 13. Implement agent-loop abort support
  - [ ] 13.1 Add AbortController plumbing throughout execution chain
    - Add signal?: AbortSignal parameter to runAgentLoop
    - Pass signal through to complete() and fetch calls
    - Wire Ctrl+C in App.tsx to abort running agent
    - _Requirements: 3.3_

- [ ] 14. Implement LLM streaming responses (largest effort)
  - [ ] 14.1 Implement completeStream() for each LLM provider
    - OpenAI/OpenRouter: SSE data: lines handling
    - Anthropic: SSE events handling
    - DeepSeek: Provider-specific streaming format
    - Keep non-streaming fallback for unsupported providers
    - _Requirements: 3.4_
  
  - [ ] 14.2 Update agent-loop to consume streaming responses
    - Aggregate content deltas for progressive display
    - Aggregate tool_calls deltas before executing tools
    - Maintain compatibility with existing onUpdate callback
    - _Requirements: 3.4_
  
  - [ ] 14.3 Verify UI handles streaming correctly
    - Ensure ChatView.tsx truncation/animation still works
    - Test progressive reveal of streaming content
    - Validate tool call aggregation and execution
    - _Requirements: 3.4_

- [ ] 15. Checkpoint - Feature implementation validation
  - Ensure all new features work correctly, ask the user if questions arise.

- [ ] 16. Implement comprehensive testing framework
  - [ ] 16.1 Extract testable pure functions from codebase
    - Webhook gate validation functions
    - License round-trip functions  
    - Frontmatter parsing and normalization
    - Token counting and text processing utilities
    - _Requirements: 3.5, 5.1_
  
  - [ ] 16.2 Set up Bun test runner configuration
    - Add "test": "bun test" to package.json
    - Create tests/unit/ directory structure
    - Configure test runners and coverage reporting
    - _Requirements: 5.1_
  
  - [ ] 16.3 Create CI/CD pipeline for automated testing
    - Add .github/workflows/test.yml
    - Run bun install, typecheck, and tests on PRs
    - Add security scanning and dependency auditing
    - _Requirements: 5.4, 5.5_

### Phase 4: Cleanup & Polish (Weeks 10-13)

- [ ] 17. Unify version source and improve error handling
  - [ ] 17.1 Create single version source from package.json
    - Add src/version.ts importing package.json version
    - Use in updater.ts and cli.tsx
    - Fix checkForUpdates to compare semver numerically
    - _Requirements: 3.6_
  
  - [ ]* 17.2 Write property test for build determinism
    - **Property 12: Build and Version Determinism**
    - **Validates: Requirements 3.6, 7.1, 7.6**
  
  - [ ] 17.3 Improve GitLab daemon error handling
    - Add explicit rejection for unsupported GitLab operations
    - Update docs/internal/daemon.md with limitations
    - _Requirements: 3.7_

- [ ] 18. Perform dead code removal and cleanup
  - [ ] 18.1 Remove unused functions and imports
    - parseToolCalls from agent-loop.ts (no callers)
    - Unused imports from server/handler.ts
    - Unused retestResult from daemon/pipeline.ts
    - _Requirements: 3.8_
  
  - [ ] 18.2 Clean up UI placeholders and stubs
    - Remove or implement sidebar placeholders in App.tsx
    - Fix env-var warning name bug in daemon/config.ts
    - Remove dead verifyWithDeviceCode from sso.ts
    - _Requirements: 3.8_

- [ ] 19. Implement cross-platform compatibility fixes
  - [ ] 19.1 Fix Windows-specific path and line ending issues
    - Handle Windows path separators consistently
    - Fix CRLF normalization across all text processing
    - Test on Windows 10/11 with PowerShell and CMD
    - _Requirements: 9.1_
  
  - [ ]* 19.2 Write property test for cross-platform path handling
    - **Property 9: Cross-Platform Path Handling**
    - **Validates: Requirements 9.1, 9.5**
  
  - [ ] 19.2 Test macOS and Linux compatibility
    - Handle macOS security features and filesystem conventions
    - Support different Linux distributions and package managers
    - Implement platform detection for adaptive behavior
    - _Requirements: 9.2, 9.3, 9.6_

- [ ] 20. Final checkpoint - Complete system validation
  - Ensure all tests pass across all platforms, ask the user if questions arise.

- [ ] 21. Update documentation and create migration guides
  - [ ] 21.1 Update README.md with new features and changes
    - Document license key format and secret requirement
    - Explain SSO secret-optional flow
    - Note GitLab daemon limitations
    - _Requirements: 4.2_
  
  - [ ] 21.2 Update internal documentation
    - docs/internal/mcp-integrations.md for namespaced tools
    - docs/internal/daemon.md for GitLab limitations
    - docs/internal/configuration.md for updated config schema
    - _Requirements: 4.2_
  
  - [ ] 21.3 Create migration guides for breaking changes
    - License key format migration guide
    - SSO configuration updates
    - Custom agent permission changes
    - _Requirements: 4.2_

- [ ] 22. Implement telemetry and monitoring systems
  - [ ] 22.1 Add opt-in telemetry with clear privacy disclosures
    - Implement usage analytics collection
    - Add privacy policy and data handling documentation
    - Make telemetry opt-in with easy disable option
    - _Requirements: 4.5_
  
  - [ ] 22.2 Implement comprehensive logging and metrics
    - Structured JSON logging for all operations
    - Performance metrics collection
    - Health check endpoints for daemon
    - _Requirements: 7.3_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation throughout implementation
- Property tests validate universal correctness properties from design document
- Unit tests validate specific examples and edge cases
- Phase 1 (Security) must be completed before proceeding to other phases
- Cross-platform testing should occur throughout development, not just at the end
- All TypeScript code must pass type checking and linting
- Breaking changes require migration guides in CHANGELOG.md

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "5.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "2.3", "3.2", "5.2", "5.3"] },
    { "id": 2, "tasks": ["6.1", "6.2", "7.1", "7.3", "8.1", "8.2", "10.1"] },
    { "id": 3, "tasks": ["7.2", "8.3", "10.2", "10.3"] },
    { "id": 4, "tasks": ["11.1", "12.1", "12.3", "13.1"] },
    { "id": 5, "tasks": ["12.2", "14.1", "14.2", "14.3"] },
    { "id": 6, "tasks": ["16.1", "16.2", "16.3"] },
    { "id": 7, "tasks": ["17.1", "17.3", "18.1", "18.2"] },
    { "id": 8, "tasks": ["17.2", "19.1", "19.2"] },
    { "id": 9, "tasks": ["21.1", "21.2", "21.3", "22.1", "22.2"] }
  ]
}
```

**Dependency Graph Rules**:
1. Security tasks (Phase 1) must complete before core correctness (Phase 2)
2. Core correctness must complete before feature implementation (Phase 3)
3. Property tests depend on their corresponding implementation tasks
4. Cross-platform testing depends on core functionality being stable
5. Documentation updates depend on feature implementation being complete
6. Each wave contains independent tasks that can execute in parallel
7. Tasks writing to the same file are placed in different waves to avoid conflicts