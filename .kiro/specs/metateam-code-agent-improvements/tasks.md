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

- [x] 11. Wire rules and skills into system prompt
  - [x] 11.1 Extend runAgentLoop to use getEffectiveSystemPrompt(agent)
    - Append active-skill body to system prompt
    - Update src/agents/index.ts signature to take agent parameter
    - Have App.tsx pass active skill's body properly
    - _Requirements: 3.1_

- [x] 12. Implement context rotation and database-backed history
  - [x] 12.1 Build messages from buildContext(sessionId, systemPrompt)
    - Update runAgentLoop to use session context instead of completionHistoryRef
    - Call rotateIfNeeded(sessionId) before each iteration
    - Update App.tsx to support new context flow
    - _Requirements: 3.2_
  
  - [x]* 12.2 Write property test for session state management
    - **Property 8: Session State Management**
    - **Validates: Requirements 3.2, 7.4**
  
  - [x] 12.3 Implement SQLite database for session persistence
    - Create database schema for sessions and messages
    - Implement CRUD operations for session management
    - Add migration system for database schema updates
    - _Requirements: 3.2_

- [x] 13. Implement agent-loop abort support
  - [x] 13.1 Add AbortController plumbing throughout execution chain
    - Add signal?: AbortSignal parameter to runAgentLoop
    - Pass signal through to complete() and fetch calls
    - Wire Ctrl+C in App.tsx to abort running agent
    - _Requirements: 3.3_

- [x] 14. Implement LLM streaming responses (largest effort)
  - [x] 14.1 Implement completeStream() for each LLM provider
    - OpenAI/OpenRouter: SSE data: lines handling
    - Anthropic: SSE events handling
    - DeepSeek: Provider-specific streaming format
    - Keep non-streaming fallback for unsupported providers
    - _Requirements: 3.4_
  
  - [x] 14.2 Update agent-loop to consume streaming responses
    - Aggregate content deltas for progressive display
    - Aggregate tool_calls deltas before executing tools
    - Maintain compatibility with existing onUpdate callback
    - _Requirements: 3.4_
  
  - [x] 14.3 Verify UI handles streaming correctly
    - Ensure ChatView.tsx truncation/animation still works
    - Test progressive reveal of streaming content
    - Validate tool call aggregation and execution
    - _Requirements: 3.4_

- [x] 15. Checkpoint - Feature implementation validation
  - Ensure all new features work correctly, ask the user if questions arise.

- [x] 16. Implement comprehensive testing framework
  - [x] 16.1 Extract testable pure functions from codebase
    - Webhook gate validation functions
    - License round-trip functions  
    - Frontmatter parsing and normalization
    - Token counting and text processing utilities
    - _Requirements: 3.5, 5.1_
  
  - [x] 16.2 Set up Bun test runner configuration
    - Add "test": "bun test" to package.json
    - Create tests/unit/ directory structure
    - Configure test runners and coverage reporting
    - _Requirements: 5.1_
  
  - [x] 16.3 Create CI/CD pipeline for automated testing
    - Add .github/workflows/test.yml
    - Run bun install, typecheck, and tests on PRs
    - Add security scanning and dependency auditing
    - _Requirements: 5.4, 5.5_

### Phase 4: Cleanup & Polish (Weeks 10-13)

- [ ] 17. Unify version source and improve error handling
  - [x] 17.1 Create single version source from package.json
    - Add src/version.ts importing package.json version
    - Use in updater.ts and cli.tsx
    - Fix checkForUpdates to compare semver numerically
    - _Requirements: 3.6_
  
  - [x]* 17.2 Write property test for build determinism
    - **Property 12: Build and Version Determinism**
    - **Validates: Requirements 3.6, 7.1, 7.6**
  
  - [x] 17.3 Improve GitLab daemon error handling
    - Add explicit rejection for unsupported GitLab operations
    - Update docs/internal/daemon.md with limitations
    - _Requirements: 3.7_

- [ ] 18. Perform dead code removal and cleanup
  - [x] 18.1 Remove unused functions and imports
    - parseToolCalls from agent-loop.ts (no callers)
    - Unused imports from server/handler.ts
    - Unused retestResult from daemon/pipeline.ts
    - _Requirements: 3.8_
  
  - [x] 18.2 Clean up UI placeholders and stubs
    - Remove or implement sidebar placeholders in App.tsx
    - Fix env-var warning name bug in daemon/config.ts
    - Remove dead verifyWithDeviceCode from sso.ts
    - _Requirements: 3.8_

- [ ] 19. Implement cross-platform compatibility fixes
  - [x] 19.1 Fix Windows-specific path and line ending issues
    - Handle Windows path separators consistently
    - Fix CRLF normalization across all text processing
    - Test on Windows 10/11 with PowerShell and CMD
    - _Requirements: 9.1_
  
  - [x]* 19.2 Write property test for cross-platform path handling
    - **Property 9: Cross-Platform Path Handling**
    - **Validates: Requirements 9.1, 9.5**
  
  - [x] 19.3 Test macOS and Linux compatibility
    - Handle macOS security features and filesystem conventions
    - Support different Linux distributions and package managers
    - Implement platform detection for adaptive behavior
    - _Requirements: 9.2, 9.3, 9.6_

- [x] 20. Final checkpoint - Complete system validation
  - Ensure all tests pass across all platforms, ask the user if questions arise.

- [x] 21. Update documentation and create migration guides
  - [x] 21.1 Update README.md with new features and changes
    - Document license key format and secret requirement
    - Explain SSO secret-optional flow
    - Note GitLab daemon limitations
    - _Requirements: 4.2_
  
  - [x] 21.2 Update internal documentation
    - docs/internal/mcp-integrations.md for namespaced tools
    - docs/internal/daemon.md for GitLab limitations
    - docs/internal/configuration.md for updated config schema
    - _Requirements: 4.2_
  
  - [x] 21.3 Create migration guides for breaking changes
    - License key format migration guide
    - SSO configuration updates
    - Custom agent permission changes
    - _Requirements: 4.2_

- [x] 22. Implement telemetry and monitoring systems
  - [x] 22.1 Add opt-in telemetry with clear privacy disclosures
    - Implement usage analytics collection
    - Add privacy policy and data handling documentation
    - Make telemetry opt-in with easy disable option
    - _Requirements: 4.5_
  
  - [x] 22.2 Implement comprehensive logging and metrics
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
    { "id": 8, "tasks": ["17.2", "19.1", "19.2", "19.3"] },
    { "id": 9, "tasks": ["21.1", "21.2", "21.3", "22.1", "22.2"] },
    { "id": 10, "tasks": ["20"] }
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


## Dashboard Enhancement Plan: Enterprise Dashboard Improvements (Weeks 14-23)

### Overview

This 10-week plan enhances the existing MetaTeam Code Agent enterprise dashboard with comprehensive management interfaces, real-time features, advanced configuration, and enhanced security. The dashboard currently provides basic authentication, API endpoints, and viewing capabilities but lacks management interfaces, real-time features, and advanced functionality.

### Phase 5: Management Interfaces & Configuration Wizards (Weeks 14-15)

- [x] 23. Implement comprehensive user management CRUD interfaces
  - [x] 23.1 Create user management API endpoints in dashboard.ts
    - Add POST /api/users/create for new user creation with validation
    - Add PUT /api/users/:userId for user updates and role changes
    - Add DELETE /api/users/:userId for user deactivation
    - Implement email validation and organization membership checks
    - Add rate limiting for user management operations
    - _References: src/enterprise/dashboard.ts, src/enterprise/user.ts_
  
  - [x] 23.2 Implement user management UI in dashboard HTML/JS
    - Add "Manage Users" view with create/edit/delete buttons
    - Implement form validation for user creation/editing
    - Add bulk operations (export, bulk role changes)
    - Add user search and filtering capabilities
    - Implement role-based access control for operations
    - _References: src/enterprise/dashboard.ts HTML template_

  - [x]* 23.3 Write property test for user management operations
    - **Property 13: User Management Consistency**
    - **Validates: Requirements 6.4, 6.5**

- [x] 24. Implement organization management interfaces
  - [x] 24.1 Create organization CRUD API endpoints
    - Add POST /api/orgs/create for new organization creation
    - Add PUT /api/orgs/:orgId for organization updates
    - Add DELETE /api/orgs/:orgId with cascade deletes
    - Add organization settings configuration endpoints
    - Implement slug validation and uniqueness checks
    - _References: src/enterprise/dashboard.ts, src/enterprise/org.ts_
  
  - [x] 24.2 Build organization management UI
    - Create organization dashboard with tier management
    - Implement organization settings configuration interface
    - Add member management within organizations
    - Create organization analytics and usage monitoring
    - Add organization export functionality
    - _References: src/enterprise/dashboard.ts HTML template_

- [x] 25. Implement license management and activation wizards
  - [x] 25.1 Create license activation API endpoints
    - Add POST /api/license/activate with validation and error handling
    - Add GET /api/license/validate for real-time validation
    - Add POST /api/license/deactivate for license removal
    - Implement license upgrade/downgrade workflows
    - Add license seat management endpoints
    - _References: src/enterprise/dashboard.ts, src/enterprise/license.ts_
  
  - [x] 25.2 Build license management UI
    - Create license activation wizard with step-by-step guidance
    - Implement license validation and status monitoring
    - Add seat allocation and management interface
    - Create license usage reports and expiration warnings
    - Add license migration and upgrade workflows
    - _References: src/enterprise/dashboard.ts HTML template_

- [x] 26. Checkpoint - Management interfaces validation
  - Ensure all management interfaces work correctly, ask the user if questions arise.

### Phase 6: Configuration & Real-time Features (Weeks 16-17)

- [x] 27. Implement comprehensive configuration system
  - [x] 27.1 Create configuration API endpoints
    - Add GET /api/config for current configuration retrieval
    - Add PUT /api/config for configuration updates
    - Add GET /api/config/schema for configuration schema
    - Add POST /api/config/validate for configuration validation
    - Add GET /api/config/defaults for default values
    - _References: src/enterprise/dashboard.ts, src/config/index.ts_
  
  - [x] 27.2 Build configuration management UI
    - Create configuration editor with syntax highlighting
    - Implement configuration validation and preview
    - Add configuration templates and presets
    - Create configuration import/export functionality
    - Add configuration change history and rollback
    - _References: src/enterprise/dashboard.ts HTML template_

  - [x]* 27.3 Write property test for configuration management
    - **Property 14: Configuration Management Consistency**
    - **Validates: Requirements 4.4, 6.4**

- [x] 28. Implement real-time dashboard features
  - [x] 28.1 Add WebSocket support for real-time updates
    - Implement WebSocket server integration in dashboard.ts
    - Add real-time session monitoring and agent execution updates
    - Create live audit log streaming
    - Implement real-time license status updates
    - Add connection status monitoring
    - _References: src/enterprise/dashboard.ts, src/daemon/notifier.ts_
  
  - [x] 28.2 Build real-time UI components
    - Add live session monitoring with WebSocket integration
    - Create real-time audit log viewer with filtering
    - Implement agent execution progress tracking
    - Add real-time system health indicators
    - Create notification system for important events
    - _References: src/enterprise/dashboard.ts HTML template_

- [x] 29. Implement notification and alerting system
  - [x] 29.1 Create notification API endpoints
    - Add POST /api/notifications for notification creation
    - Add GET /api/notifications for notification retrieval
    - Add PUT /api/notifications/:id for notification updates
    - Implement notification routing and delivery
    - Add notification preferences management
    - _References: src/enterprise/dashboard.ts, src/daemon/notifier.ts_
  
  - [x] 29.2 Build notification management UI
    - Create notification center with unread/read filtering
    - Implement notification preferences configuration
    - Add notification templates and scheduling
    - Create alert rule configuration interface
    - Add notification history and analytics
    - _References: src/enterprise/dashboard.ts HTML template_

### Phase 7: Advanced Analytics & Export Capabilities (Weeks 18-19)

- [x] 30. Implement advanced analytics and reporting
  - [x] 30.1 Enhance analytics API endpoints
    - Add GET /api/analytics/detailed with granular filtering
    - Add POST /api/analytics/report for custom report generation
    - Add GET /api/analytics/trends for usage trend analysis
    - Implement performance metrics collection
    - Add cost analysis and optimization recommendations
    - _References: src/enterprise/dashboard.ts, src/telemetry/reporter.ts_
  
  - [x] 30.2 Build advanced analytics UI
    - Create interactive analytics dashboard with charts
    - Implement custom report builder with drag-and-drop
    - Add trend analysis and forecasting visualization
    - Create cost optimization recommendations interface
    - Add comparative analysis between time periods
    - _References: src/enterprise/dashboard.ts HTML template_

  - [x]* 30.3 Write property test for analytics data integrity
    - **Property 15: Analytics Data Integrity**
    - **Validates: Requirements 4.5, 5.2, 6.3**
    - _Tests: tests/unit/analytics.test.ts_

- [x] 31. Implement comprehensive export capabilities
  - [x] 31.1 Create export API endpoints
    - Add GET /api/export/audit for audit log exports (CSV, JSON)
    - Add GET /api/export/analytics for analytics data exports
    - Add GET /api/export/users for user data exports
    - Add GET /api/export/config for configuration exports
    - Implement export filtering and format selection
    - _References: src/enterprise/dashboard.ts, src/telemetry/reporter.ts_
  
  - [x] 31.2 Build export management UI
    - Create export wizard with format and filter selection
    - Implement scheduled export configuration
    - Add export history and download management
    - Create bulk export operations
    - Add export template management
    - _References: src/enterprise/dashboard.ts HTML template_

- [x] 32. Implement API documentation and testing interface
  - [x] 32.1 Create API documentation endpoints
    - Add GET /api/docs/openapi for OpenAPI specification
    - Add GET /api/docs/markdown for markdown documentation
    - Implement API endpoint discovery and testing
    - Add API usage examples and code snippets
    - Create API changelog and version information
    - _References: src/enterprise/dashboard.ts_
  
  - [x] 32.2 Build API testing interface
    - Create interactive API testing console
    - Implement request/response inspection
    - Add authentication token management
    - Create API usage examples library
    - Add API performance testing tools
    - _References: src/enterprise/dashboard.ts HTML template_

- [x] 33. Checkpoint - Advanced features validation
  - Ensure all advanced features work correctly, ask the user if questions arise.

### Phase 8: Security Enhancement & Monitoring (Weeks 20-21)

- [x] 34. Implement comprehensive security monitoring
  - [x] 34.1 Create security monitoring API endpoints
    - Add GET /api/security/events for security event monitoring
    - Add GET /api/security/threats for threat detection
    - Add POST /api/security/alerts for security alert creation
    - Implement intrusion detection and prevention
    - Add security policy configuration
    - _References: src/enterprise/dashboard.ts, src/enterprise/audit.ts_
  
  - [x] 34.2 Build security monitoring UI
    - Create security dashboard with threat indicators
    - Implement security event timeline visualization
    - Add security policy configuration interface
    - Create compliance reporting and auditing
    - Add security incident response interface
    - _References: src/enterprise/dashboard.ts HTML template_
  
  - [x]* 34.3 Write property test for security monitoring
    - **Property 16: Security Monitoring Consistency**
    - **Validates: Requirements 1.1-1.9, 5.5**
    - _Tests: tests/unit/security-monitoring.test.ts_

- [x] 35. Implement advanced audit logging and compliance
  - [x] 35.1 Enhance audit logging capabilities
    - Add detailed audit trail for all dashboard operations
    - Implement compliance reporting (SOC2, GDPR)
    - Create audit log retention policies
    - Add audit log integrity verification
    - Implement audit log tamper detection
    - _References: src/enterprise/dashboard.ts, src/enterprise/audit.ts_
  
  - [x] 35.2 Build advanced audit interface
    - Create compliance dashboard with audit requirements
    - Implement audit log search with advanced filters
    - Add compliance reporting generation
    - Create audit policy configuration
    - Add audit log integrity verification tools
    - _References: src/enterprise/dashboard.ts HTML template_

- [x] 36. Implement role-based access control (RBAC)
  - [x] 36.1 Create RBAC API endpoints
    - Add POST /api/rbac/roles for role creation
    - Add PUT /api/rbac/roles/:roleId for role updates
    - Add GET /api/rbac/permissions for permission management
    - Implement permission inheritance and overrides
    - Add user-role assignment management
    - _References: src/enterprise/dashboard.ts, src/enterprise/user.ts_
  
  - [x] 36.2 Build RBAC management UI
    - Create role management interface with permission matrix
    - Implement user-role assignment interface
    - Add permission testing and validation tools
    - Create role templates and cloning
    - Add RBAC analytics and reporting
    - _References: src/enterprise/dashboard.ts HTML template_

### Phase 9: Integration & Deployment Enhancements (Weeks 22-23)

- [ ] 37. Implement external integrations
  - [ ] 37.1 Create integration API endpoints
    - Add POST /api/integrations/webhook for webhook configuration
    - Add GET /api/integrations/providers for available integrations
    - Add POST /api/integrations/:provider/test for integration testing
    - Implement Slack, Teams, Discord integration endpoints
    - Add CI/CD pipeline integration endpoints
    - _References: src/enterprise/dashboard.ts, src/daemon/webhook.ts_
  
  - [ ] 37.2 Build integration management UI
    - Create integration marketplace with available providers
    - Implement integration configuration wizard
    - Add integration testing and validation
    - Create integration analytics and monitoring
    - Add webhook management interface
    - _References: src/enterprise/dashboard.ts HTML template_

  - [ ]* 37.3 Write property test for integration consistency
    - **Property 17: Integration Consistency**
    - **Validates: Requirements 6.2, 6.6**

- [ ] 38. Implement deployment and scaling features
  - [ ] 38.1 Create deployment API endpoints
    - Add GET /api/deployment/status for deployment status
    - Add POST /api/deployment/scale for horizontal scaling
    - Add GET /api/deployment/metrics for deployment metrics
    - Implement health check and readiness endpoints
    - Add backup/restore management endpoints
    - _References: src/enterprise/dashboard.ts_
  
  - [ ] 38.2 Build deployment management UI
    - Create deployment dashboard with status monitoring
    - Implement scaling configuration interface
    - Add health check and monitoring tools
    - Create backup/restore management interface
    - Add deployment analytics and optimization
    - _References: src/enterprise/dashboard.ts HTML template_

- [ ] 39. Implement documentation and help system
  - [ ] 39.1 Create documentation API endpoints
    - Add GET /api/docs/help for contextual help
    - Add POST /api/docs/feedback for user feedback
    - Implement documentation search and indexing
    - Add tutorial and guide endpoints
    - Create changelog and release notes endpoints
    - _References: src/enterprise/dashboard.ts_
  
  - [ ] 39.2 Build help and documentation UI
    - Create integrated help system with search
    - Implement contextual help bubbles
    - Add interactive tutorials and guides
    - Create feedback and suggestion system
    - Add documentation version management
    - _References: src/enterprise/dashboard.ts HTML template_

- [ ] 40. Final checkpoint - Complete dashboard validation
  - Ensure all dashboard features work correctly across all phases, ask the user if questions arise.

## Dashboard Implementation Notes

### Integration Points with Existing Code
- All new API endpoints extend existing src/enterprise/dashboard.ts server
- User management integrates with src/enterprise/user.ts functions
- Organization management uses src/enterprise/org.ts
- License management builds on src/enterprise/license.ts
- Audit logging extends src/enterprise/audit.ts
- Configuration uses src/config/index.ts
- Real-time features integrate with src/daemon/notifier.ts

### Security Considerations
- All management operations require admin privileges
- API endpoints implement proper authentication and authorization
- Input validation and sanitization for all user inputs
- Rate limiting for all management operations
- Audit logging for all administrative actions

### Performance Considerations
- Implement pagination for large datasets
- Add caching for frequently accessed data
- Optimize database queries for dashboard operations
- Implement lazy loading for UI components
- Add performance monitoring for dashboard endpoints

### User Experience Guidelines
- Consistent UI patterns across all management interfaces
- Clear error messages with actionable suggestions
- Progress indicators for long-running operations
- Confirmation dialogs for destructive operations
- Keyboard shortcuts for power users

## Updated Task Dependency Graph

```json
{
  "waves": [
    { "id": 11, "tasks": ["23.1", "24.1", "25.1", "27.1"] },
    { "id": 12, "tasks": ["23.2", "23.3", "24.2", "25.2"] },
    { "id": 13, "tasks": ["26", "27.2", "28.1", "29.1"] },
    { "id": 14, "tasks": ["27.3", "28.2", "29.2", "30.1"] },
    { "id": 15, "tasks": ["30.2", "30.3", "31.1", "32.1"] },
    { "id": 16, "tasks": ["31.2", "32.2", "33", "34.1"] },
    { "id": 17, "tasks": ["34.2", "34.3", "35.1", "36.1"] },
    { "id": 18, "tasks": ["35.2", "36.2", "37.1", "38.1"] },
    { "id": 19, "tasks": ["37.2", "37.3", "38.2", "39.1"] },
    { "id": 20, "tasks": ["39.2", "40"] }
  ]
}
```

**Dependency Graph Rules**:
1. Management APIs (Phase 5) must be implemented before UI components
2. Configuration system (Phase 6) depends on user/org management APIs
3. Real-time features (Phase 6) depend on WebSocket integration
4. Analytics (Phase 7) depend on data collection from all phases
5. Security monitoring (Phase 8) depends on audit logging infrastructure
6. Integration features (Phase 9) depend on API endpoints from all phases
7. Each wave contains independent tasks that can execute in parallel
8. Tasks writing to the same file are placed in different waves to avoid conflicts

### Success Metrics for Dashboard Improvements
1. **Management Efficiency**: <1 minute for common administrative tasks
2. **Response Time**: <200ms for dashboard API endpoints
3. **Reliability**: 99.9% uptime for dashboard service
4. **Security**: Zero security vulnerabilities in dashboard code
5. **User Satisfaction**: >90% admin user satisfaction rate
6. **Feature Coverage**: 100% of planned features implemented and tested
