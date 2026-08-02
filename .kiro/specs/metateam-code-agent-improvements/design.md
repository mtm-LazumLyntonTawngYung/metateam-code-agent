# Design Document: MetaTeam Code Agent Improvements

## Overview

The MetaTeam Code Agent (MTC) is a terminal-first AI coding assistant built with TypeScript, React (Ink), and Bun. This design document outlines a comprehensive 13-week improvement plan addressing security vulnerabilities, core correctness issues, missing features, and technical debt. The goal is to transform MTC into a production-ready tool competitive with Kilo Code CLI and OpenCode CLI.

### Design Philosophy

1. **Security First**: All security fixes must be completed before other improvements
2. **Incremental Validation**: Each phase produces working, tested software
3. **Backward Compatibility**: Breaking changes require clear migration paths
4. **Cross-Platform Support**: Consistent behavior on Windows, macOS, and Linux

### Technical Stack Assessment

**Current Stack**:
- **Runtime**: Bun (TypeScript-first JavaScript runtime)
- **UI Framework**: React + Ink (terminal UI components)
- **Build System**: Bun build (compiles to standalone binary)
- **Testing**: Minimal unit tests, no CI/CD pipeline
- **Infrastructure**: Headless daemon, webhook listeners, SSO integration

**Strengths**:
- Fast startup (Bun runtime)
- Rich terminal UI (Ink framework)
- Multi-provider LLM support
- Plugin architecture (MCP integration)

**Weaknesses**:
- Security vulnerabilities (RCE, XSS, auth bypass)
- Incomplete error handling
- Missing core features (streaming, context management)
- Limited test coverage
- Cross-platform compatibility issues

## Architecture

### Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Terminal UI Layer (Ink)                  │
├─────────────────────────────────────────────────────────────┤
│  Chat Interface │ Model Picker │ Session Manager │ Settings │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                  Application Logic Layer                     │
├─────────────────────────────────────────────────────────────┤
│  Agent System │ LLM Clients │ Tool Registry │ Context Mgmt  │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                  Infrastructure Layer                        │
├─────────────────────────────────────────────────────────────┤
│  Daemon Server │ Webhooks │ SSO Auth │ License System       │
└─────────────────────────────────────────────────────────────┘
```

### Revised Architecture (Post-Improvements)

```
┌─────────────────────────────────────────────────────────────┐
│                    Terminal UI Layer                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │  Secure  │ │ Streaming│ │  Context │ │  Cross-  │       │
│  │  Input   │ │ Response │ │ Rotation │ │ Platform │       │
│  │ Handler  │ │ Display  │ │  UI      │ │  UI      │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                  Application Logic Layer                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Security │ │  LLM     │ │  Tool    │ │  Agent   │       │
│  │ Gateway  │ │ Stream   │ │ Registry │ │  Loop    │       │
│  │          │ │ Manager  │ │          │ │ Manager  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                  Infrastructure Layer                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │  Secure  │ │  SSO     │ │ License  │ │  File    │       │
│  │  Daemon  │ │  Auth    │ │ Manager  │ │  System  │       │
│  │          │ │          │ │          │ │          │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                  Testing & Quality Layer                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Property │ │  Unit    │ │Integratio│ │Security  │       │
│  │  Tests   │ │  Tests   │ │  Tests   │ │  Scans   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────���───────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Security Gateway Component

**Purpose**: Centralized security validation for all external inputs

**Interfaces**:
```typescript
interface SecurityGateway {
  validateWebhookRequest(
    platform: "github" | "gitlab",
    signature: string | undefined,
    gitlabToken: string | undefined,
    body: string,
    secret: string
  ): { ok: boolean; status: number; message: string };
  
  validateCloneUrl(url: string): boolean;
  
  validateFilePath(basePath: string, targetPath: string): boolean;
  
  escapeHtml(input: string): string;
}

interface WebhookValidationResult {
  ok: boolean;
  status: number;
  message: string;
}
```

**Implementation Details**:
- Constant-time comparison for signature/token verification
- Strict regex patterns for URL validation
- Path traversal prevention with canonical path resolution
- HTML escaping for all UI interpolations

### 2. License Manager Component

**Purpose**: Secure license key generation, validation, and feature gating

**Interfaces**:
```typescript
interface LicenseManager {
  generateLicenseKey(
    tier: LicenseTier,
    organization: string,
    expiresAt: Date,
    maxSeats: number
  ): string;
  
  parseLicenseKey(key: string): LicenseInfo | null;
  
  validateLicense(key: string): ValidationResult;
  
  hasFeature(feature: EnterpriseFeature): boolean;
}

interface LicenseInfo {
  tier: "community" | "enterprise" | "enterprise-plus";
  organization: string;
  expiresAt: Date;
  maxSeats: number;
  features: EnterpriseFeature[];
}

interface ValidationResult {
  success: boolean;
  license?: LicenseInfo;
  error?: string;
}
```

**Implementation Details**:
- Canonical payload format: `MTC-<tier>-<base64url(payload)>-<hmac>`
- HMAC verification with configurable secret
- Fail-closed behavior when secret not configured
- Expiry enforcement at read time

### 3. SSO Authentication Component

**Purpose**: Secure Single Sign-On with Azure AD integration

**Interfaces**:
```typescript
interface SSOManager {
  initiateDeviceCodeFlow(): Promise<DeviceCodeResponse>;
  
  pollForToken(
    deviceCode: string,
    interval: number,
    expiresIn: number
  ): Promise<AuthData>;
  
  validateEmailDomain(email: string): boolean;
  
  saveAuthData(data: AuthData): void;
  
  clearAuthData(): void;
}

interface DeviceCodeResponse {
  user_code: string;
  device_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

interface AuthData {
  accessToken: string;
  idToken?: string;
  userEmail: string;
  userName?: string;
  expiresOn: Date;
  scope: string;
}
```

**Implementation Details**:
- Public-client device flow (secret optional)
- File permissions: 0600 for auth token storage
- Consistent config/env variable resolution
- Domain validation: `@metateammyanmar.com` only

### 4. LLM Streaming Manager Component

**Purpose**: Unified streaming interface for all LLM providers

**Interfaces**:
```typescript
interface LLMStreamManager {
  completeStream(
    request: StreamingRequest,
    onChunk: (chunk: StreamingChunk) => void,
    signal?: AbortSignal
  ): Promise<StreamingResponse>;
  
  supportsStreaming(provider: ProviderId): boolean;
  
  convertToStreamingFormat(
    messages: CompletionMessage[],
    tools?: ToolDefinition[]
  ): ProviderSpecificFormat;
}

interface StreamingRequest {
  model: string;
  messages: CompletionMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

interface StreamingChunk {
  content?: string;
  toolCalls?: Partial<ToolCallInfo>[];
  done: boolean;
  error?: string;
}

interface StreamingResponse {
  model: string;
  content: string;
  toolCalls: ToolCallInfo[];
  usage: TokenUsage;
  provider: ProviderId;
}
```

**Implementation Details**:
- Provider-specific SSE/event stream handling
- Delta aggregation for tool calls
- Fallback to non-streaming for unsupported providers
- AbortController integration for user cancellation

### 5. Context Management Component

**Purpose**: Database-backed conversation history with intelligent rotation

**Interfaces**:
```typescript
interface ContextManager {
  buildContext(
    sessionId: string,
    systemPrompt: string,
    maxTokens: number
  ): CompletionMessage[];
  
  rotateIfNeeded(
    sessionId: string,
    newMessages: CompletionMessage[],
    maxTokens: number
  ): void;
  
  summarizeHistory(
    messages: CompletionMessage[],
    targetTokens: number
  ): CompletionMessage[];
  
  saveMessage(
    sessionId: string,
    message: CompletionMessage
  ): Promise<void>;
}

interface ConversationSummary {
  summary: string;
  remainingMessages: CompletionMessage[];
  tokenCount: number;
}
```

**Implementation Details**:
- SQLite database for persistent storage
- Token-aware summarization algorithm
- Configurable rotation policies
- LRU-based message eviction

### 6. Testing Framework Component

**Purpose**: Comprehensive test infrastructure for all code layers

**Interfaces**:
```typescript
interface TestFramework {
  runUnitTests(): TestResults;
  
  runPropertyTests(): PropertyTestResults;
  
  runIntegrationTests(): IntegrationTestResults;
  
  generateCoverageReport(): CoverageReport;
}

interface TestResults {
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

interface PropertyTestResults extends TestResults {
  counterexamples: Counterexample[];
  shrinkPaths: ShrinkPath[];
}

interface IntegrationTestResults extends TestResults {
  externalServices: ExternalServiceStatus[];
}
```

**Implementation Details**:
- Bun test runner integration
- Fast-check for property-based testing
- Mock service worker for HTTP mocking
- Coverage reporting with Istanbul

## Data Models

### 1. Webhook Event Model

```typescript
type WebhookEvent = {
  event: "issue.labeled" | "issue.opened" | "push";
  platform: "github" | "gitlab";
} & (
  | {
      event: "issue.labeled" | "issue.opened";
      issue: IssuePayload;
    }
  | {
      event: "push";
      repo: RepoPayload;
    }
);

interface IssuePayload {
  id: number;
  number: number;
  title: string;
  body: string;
  labels: string[];
  repoFullName: string;
  repoCloneUrl: string;
  htmlUrl: string;
  sender: string;
}

interface RepoPayload {
  fullName: string;
  cloneUrl: string;
  branch: string;
  defaultBranch: string;
  htmlUrl: string;
}
```

### 2. Agent Configuration Model

```typescript
interface AgentDefinition {
  id: string;
  name: string;
  systemPrompt: string;
  mode: "primary" | "subagent";
  permissions: AgentPermissions;
  description?: string;
  icon?: string;
}

interface AgentPermissions {
  read: PermissionLevel;
  edit: PermissionLevel;
  bash: PermissionLevel;
  execute: PermissionLevel;
}

type PermissionLevel = "allow" | "deny" | "ask";
```

### 3. LLM Message Model

```typescript
interface CompletionMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCallInfo[];
  timestamp: Date;
}

interface ToolCallInfo {
  id: string;
  name: string;
  arguments: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
}
```

### 4. Session Model

```typescript
interface Session {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  agentId: string;
  modelId: string;
  messages: SessionMessage[];
  tokenCount: number;
  metadata: Record<string, unknown>;
}

interface SessionMessage {
  id: string;
  sessionId: string;
  role: CompletionMessage["role"];
  content: string;
  toolCalls?: string; // JSON serialized
  toolCallId?: string;
  timestamp: Date;
  tokenCount: number;
}
```

### 5. License Data Model

```typescript
interface LicensePayload {
  tier: LicenseTier;
  organization: string;
  expiresAt: string; // ISO date
  maxSeats: number;
}

type LicenseTier = "community" | "enterprise" | "enterprise-plus";

type EnterpriseFeature = 
  | "sso"
  | "audit_logs"
  | "team_collaboration"
  | "advanced_analytics"
  | "custom_agents"
  | "priority_support";

interface LicenseInfo {
  key: string;
  tier: LicenseTier;
  status: LicenseStatus;
  organization: string;
  activatedAt: string;
  expiresAt: string;
  features: EnterpriseFeature[];
  maxSeats: number;
  currentSeats: number;
}

type LicenseStatus = "active" | "expired" | "invalid" | "suspended";
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

**Property-Based Testing Applicability Assessment**:
This feature includes both pure functions (parsers, validators, transformers) and infrastructure components. PBT is appropriate for the pure function components but not for infrastructure/IaC components. Based on prework analysis, the following core properties cover testable acceptance criteria with minimal redundancy.

### Property 1: Security Validation Consistency

*For any* webhook signature, GitLab token, or authentication credential, security validation functions should consistently reject invalid inputs and accept valid ones, with constant-time comparison to prevent timing attacks.

**Validates: Requirements 1.1, 1.2**

### Property 2: Input Sanitization Safety

*For any* user-provided input string, sanitization functions should neutralize injection attempts while preserving legitimate content, including proper HTML escaping, URL validation, and path traversal prevention.

**Validates: Requirements 1.3, 1.4, 1.7**

### Property 3: License System Integrity

*For any* valid license parameters (tier, organization, expiry, seats), the license system should maintain round-trip consistency, enforce expiry dates at read time, and fail closed when secrets are unconfigured.

**Validates: Requirements 1.5, 1.6**

### Property 4: Data Format Normalization

*For any* textual data with mixed line endings or formatting, normalization functions should produce consistent output while preserving semantic content, including frontmatter parsing and message format conversion.

**Validates: Requirements 2.4, 3.4**

### Property 5: Resource Management Bounds

*For any* resource usage scenario (file sizes, token counts, memory usage), management functions should enforce configured limits while providing accurate error information and graceful degradation.

**Validates: Requirements 2.1, 2.3, 8.1, 8.4**

### Property 6: Configuration Consistency

*For any* configuration state (models, agents, settings), filtering and application functions should maintain consistency, prevent invalid states, and provide clear feedback to users.

**Validates: Requirements 2.7, 3.1, 4.4, 6.4**

### Property 7: Concurrency Safety

*For any* concurrent execution pattern (multiple agents, simultaneous operations), the system should maintain isolation, prevent interference, and support clean cancellation via AbortController.

**Validates: Requirements 2.6, 2.8, 3.3, 8.2**

### Property 8: Session State Management

*For any* session history and context rotation scenario, the context management system should maintain conversation coherence while respecting token limits and supporting database persistence.

**Validates: Requirements 3.2, 7.4**

### Property 9: Cross-Platform Path Handling

*For any* file system path across different platforms, path resolution functions should handle platform-specific conventions (separators, permissions, line endings) while maintaining consistent behavior.

**Validates: Requirements 9.1, 9.5**

### Property 10: Plugin System Robustness

*For any* valid plugin definition, the plugin system should correctly load, register, and manage plugins while maintaining system stability and preventing conflicts.

**Validates: Requirements 6.1, 6.6**

### Property 11: Error Message Quality

*For any* error condition, the error handling system should generate clear, actionable messages with appropriate resolution suggestions, maintaining consistency across error types.

**Validates: Requirements 3.7, 4.3**

### Property 12: Build and Version Determinism

*For any* build environment and version string combination, the build system should produce deterministic outputs and correctly interpret semantic versioning for update detection.

**Validates: Requirements 3.6, 7.1, 7.6**

### Property Reflection Summary

The 12 consolidated properties above eliminate redundancy by:
1. Combining related security validations (Properties 1-3)
2. Grouping data handling concerns (Property 4)
3. Unifying resource management (Property 5)
4. Consolidating configuration logic (Property 6)
5. Addressing concurrency holistically (Property 7)
6. Covering state persistence (Property 8)
7. Handling platform differences systematically (Property 9)
8. Managing extensibility concerns (Property 10)
9. Standardizing error handling (Property 11)
10. Ensuring build reproducibility (Property 12)

Each property provides unique validation value and collectively covers 32 of the 54 acceptance criteria that are amenable to property-based testing. The remaining criteria require example-based tests, integration tests, or manual verification due to their infrastructure, UI, or process-oriented nature.

## Error Handling

### Error Classification

1. **Security Errors** (immediate termination):
   - Authentication failures
   - Signature validation failures
   - Path traversal attempts
   - License validation failures

2. **Operational Errors** (graceful degradation):
   - LLM provider timeouts
   - Network connectivity issues
   - File system permission errors
   - Database connection failures

3. **User Errors** (actionable feedback):
   - Invalid configuration
   - Insufficient permissions
   - Resource limits exceeded
   - Invalid input format

### Error Recovery Strategies

1. **Retry with Backoff**:
   - Network timeouts (max 3 retries)
   - Rate limiting (exponential backoff)
   - Temporary service outages

2. **Fallback Mechanisms**:
   - Primary LLM provider → secondary provider
   - Streaming → non-streaming fallback
   - Database → in-memory storage

3. **Graceful Degradation**:
   - Disable non-essential features
   - Continue with reduced functionality
   - Inform user of limitations

### Error Reporting

1. **User-Facing Messages**:
   - Clear, actionable error descriptions
   - Resolution suggestions
   - Reference to documentation

2. **System Logging**:
   - Structured JSON logs
   - Correlation IDs for tracing
   - Sensitive data redaction

3. **Telemetry**:
   - Error frequency tracking
   - Recovery success rates
   - Performance impact measurement

## Testing Strategy

### Dual Testing Approach

MTC requires both example-based unit tests and property-based tests due to its mixed nature of pure functions and infrastructure components.

### 1. Property-Based Testing (For Pure Functions)

**Framework**: Fast-check (TypeScript property-based testing library)

**Configuration**:
- Minimum 100 iterations per property test
- Seed randomization for reproducibility
- Shrinking enabled for counterexample minimization

**Test Coverage**:
- All parsers (license, frontmatter, JSON)
- All validators (paths, URLs, input)
- All data transformers (message formats)
- All pure business logic functions

**Tagging Convention**:
```typescript
// Feature: metateam-code-agent-improvements, Property 1: License key round-trip
test.prop({ /* generators */ })("license round-trip", () => {
  // test implementation
});
```

### 2. Unit Testing (For All Components)

**Framework**: Bun test (built-in test runner)

**Coverage Goals**:
- Minimum 80% line coverage for core modules
- 100% coverage for security-critical code
- All public API endpoints tested

**Test Categories**:
- **Security Tests**: Authentication, validation, sanitization
- **Integration Tests**: Component interactions, external services
- **UI Tests**: Terminal interface behavior
- **Performance Tests**: Response times, memory usage

### 3. Integration Testing

**Mock Strategy**:
- Mock service worker for HTTP requests
- In-memory SQLite for database tests
- Fake file system for file operations
- Mock LLM providers for predictable responses

**Test Scenarios**:
- End-to-end agent execution
- Webhook processing pipeline
- SSO authentication flow
- License activation and validation

### 4. Security Testing

**Automated Scans**:
- Dependency vulnerability scanning (npm audit)
- Code security analysis (Semgrep, SonarQube)
- Secret detection (GitGuardian, TruffleHog)

**Manual Validation**:
- Penetration testing of daemon endpoints
- Authentication flow security review
- Input validation bypass testing

### 5. Cross-Platform Testing

**Platform Matrix**:
- Windows 10/11 (PowerShell, CMD)
- macOS (Intel, Apple Silicon)
- Linux (Ubuntu, Fedora, Alpine)

**Test Focus Areas**:
- Path separator handling
- Line ending normalization
- File permission semantics
- Process spawning behavior

### 6. CI/CD Pipeline

**Pipeline Stages**:
1. **Pre-commit**: Type checking, linting, formatting
2. **Build**: Compilation, bundling, binary generation
3. **Test**: Unit tests, property tests, integration tests
4. **Security**: Vulnerability scanning, secret detection
5. **Release**: Version tagging, changelog generation, distribution

**Quality Gates**:
- All tests must pass
- No high/critical security vulnerabilities
- Minimum 80% test coverage
- Type checking without errors

## Implementation Timeline

### Phase 1: Security Hardening (Weeks 1-3)
- Webhook authentication and validation
- License system redesign
- SSO hardening
- XSS protection
- Default permission tightening

### Phase 2: Core Correctness (Weeks 4-5)
- Token limit restoration
- Model registry cleanup
- File size guards
- CRLF handling
- MCP lifecycle fixes

### Phase 3: Missing Features (Weeks 6-9)
- Rules and skills integration
- Context management system
- Agent loop abort support
- LLM streaming implementation
- Unit test framework

### Phase 4: Cleanup & Polish (Weeks 10-13)
- Version source unification
- GitLab daemon error handling
- Dead code removal
- Documentation updates
- Cross-platform testing

## Risk Mitigation

### Technical Risks
1. **Breaking Changes**: Maintain backward compatibility where possible, provide migration guides
2. **Performance Regression**: Benchmark before/after each major change
3. **Cross-Platform Issues**: Test on all target platforms throughout development

### Project Risks
1. **Scope Creep**: Stick to the 13-week plan, defer non-critical improvements
2. **Integration Complexity**: Implement features incrementally with continuous integration
3. **Security Regressions**: Security-focused code review for all changes

### Operational Risks
1. **Deployment Issues**: Canary releases, feature flags, rollback procedures
2. **User Adoption**: Clear documentation, migration assistance, user feedback loops
3. **Maintenance Burden**: Automated testing, monitoring, alerting from day one

## Success Metrics

1. **Security**: Zero critical vulnerabilities, 100% security test pass rate
2. **Reliability**: 99.9% uptime for daemon, <1% error rate for agent execution
3. **Performance**: <2s response time for common operations, <100MB memory usage
4. **Quality**: >80% test coverage, <0.1% regression rate
5. **Usability**: <5min setup time for new users, >90% user satisfaction

## Open Questions and Decisions

1. **MCP Tool Naming**: Always prefix with `{server}/{tool}` vs. prefix only on collision
2. **Skills Directory**: Migrate `~/.mtc/skills` → `~/.config/mtc/skills` or maintain both
3. **Streaming Fallback**: Implement non-streaming fallback for all providers or only unsupported ones
4. **Database Choice**: SQLite vs. JSON files for session storage
5. **Telemetry Opt-in**: Default opt-out with clear benefits vs. default opt-in with easy disable

These decisions will be resolved during implementation based on user feedback and technical constraints.