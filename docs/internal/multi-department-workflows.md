# Multi-Department Workflows

Extending **mtc** beyond engineering into QA, Design, DevOps, and Product
Management.

---

## Overview

mtc's agent and MCP plugin systems make it adaptable to any technical
workflow. Each department gets:

- **Custom agents** tuned to their domain language and tools
- **MCP plugins** that connect to their existing toolchain
- **Shared infrastructure** — sessions, telemetry, permissions

```
┌─────────────────────────────────────────────────────────┐
│                    mtc Platform                           │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│  Engineering │   QA    │   Design  │  DevOps  │  Product     │
│  Plan/Build  │  Tester  │  Figma   │  Infra   │  Manager     │
│  Agents      │  Agent   │  Plugin  │  Plugin  │  Agent       │
└──────────┴──────────┴──────────┴──────────┴─────────────┘
```

---

## Quality Assurance

### QA Tester Agent

The [QA Tester agent](../../.mtc/agents/qa-tester.md) generates Cypress and
Playwright E2E test suites directly from user story documents.

**Setup:**
```bash
# The agent is already available after cloning mtc
mtc

# Switch to the QA Tester agent (Tab key)
```

**Workflow:**

1. Write a user story in your project's docs or ticket system
2. Switch to the QA Tester agent (Tab) and point it at the story:
   ```
   /read docs/stories/login.md
   Generate Cypress E2E tests covering:
   - Happy path login
   - Invalid credentials
   - Empty field validation
   - Session expiry
   ```
3. The agent outputs complete test files with assertions
4. Run the generated tests: `bun test` or `npx cypress run`

**Supported frameworks:**
- Cypress (`.cy.ts`)
- Playwright (`.spec.ts`)
- Gherkin feature files → step definitions
- API contract tests from OpenAPI specs

---

## Design-to-Code Pipeline

### Figma MCP Bridge

The [Figma bridge](../../src/mcp-plugins/figma-bridge.ts) connects mtc to the
Figma REST API, converting UI components directly into React/Tailwind code.

**Setup:**
```bash
# 1. Get a Figma personal access token
#    https://www.figma.com/developers/api#access-tokens

# 2. Set the token
export FIGMA_TOKEN="figd_..."

# 3. Register the plugin in .mtc/mcp.json
```

**.mtc/mcp.json:**
```json
{
  "mcpServers": {
    "figma": {
      "command": "bun",
      "args": ["run", "src/mcp-plugins/figma-bridge.ts"]
    }
  }
}
```

**Available tools:**

| Tool | Description |
|------|-------------|
| `figma_fetch_file` | Fetch a Figma file's document tree |
| `figma_list_components` | List all components/frames in a file |
| `figma_export_component` | Convert a node to a React/Tailwind component |
| `figma_export_image` | Export a node as PNG/JPEG/SVG |

**Workflow:**
```
# 1. Browse the Figma file structure
/call figma_list_components fileKey="abc123"

# 2. Export a component to React/Tailwind
/call figma_export_component fileKey="abc123" nodeId="1:2" componentName="LoginForm"

# 3. The result includes:
#    - Complete React component with Tailwind classes
#    - Tailwind config extension with extracted colors/fonts
```

**Output example:**
```tsx
import React from 'react';

interface LoginFormProps {
  className?: string;
}

export function LoginForm({ className }: LoginFormProps) {
  return (
    <div className="flex-col items-center gap-4"
      style={{ padding: '24px 24px 24px 24px' }}>
      <span style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Inter' }}>
        Welcome Back
      </span>
      <div style={{ width: 320, height: 48 }}
        style={{ backgroundColor: '#f5f5f5', borderRadius: 8 }} />
      <div style={{ width: 320, height: 48 }}
        style={{ backgroundColor: '#f5f5f5', borderRadius: 8 }} />
      <div style={{ width: 320, height: 48 }}
        className="items-center justify-center"
        style={{ backgroundColor: '#3b82f6', borderRadius: 8 }}>
        <span style={{ fontSize: 16, color: '#ffffff' }}>Sign In</span>
      </div>
    </div>
  );
}

export default LoginForm;
```

---

## DevOps Automation

### DevOps Engineer Agent + MCP Bridge

The [DevOps Engineer agent](../../.mtc/agents/devops-engineer.md) and
[DevOps bridge](../../src/mcp-plugins/devops-bridge.ts) together provide
infrastructure monitoring, log analysis, and configuration patching.

**Setup:**
```bash
# Required environment variables (set before starting mtc):
export DATADOG_API_KEY="..."
export DATADOG_APP_KEY="..."
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
```

**.mtc/mcp.json:**
```json
{
  "mcpServers": {
    "devops": {
      "command": "bun",
      "args": ["run", "src/mcp-plugins/devops-bridge.ts"]
    }
  }
}
```

**MCP Tools:**

| Tool | Description |
|------|-------------|
| `datadog_query_logs` | Query Datadog logs with search filters |
| `datadog_query_metrics` | Query Datadog metric timeseries |
| `cloudwatch_query_logs` | Query CloudWatch Logs Insights |
| `k8s_analyze_manifest` | Analyze K8s manifest for security/resource issues |
| `terraform_analyze_plan` | Analyze Terraform HCL for best practices |
| `devops_diagnose_logs` | Scan log text for known incident patterns |

**Workflow:**
```
# 1. Query Datadog for recent errors
/call datadog_query_logs query="service:api status:error" hoursAgo=2

# 2. Diagnose the logs
/call devops_diagnose_logs logs="OOMKilled: pod crashed" source="k8s"

# 3. Analyze the Kubernetes manifest
/call k8s_analyze_manifest yaml="apiVersion: apps/v1
kind: Deployment
spec:
  containers:
  - name: app
    image: myapp:latest"

# 4. Review Terraform config
/call terraform_analyze_plan hcl="resource \"aws_instance\" \"web\" {
  ami = \"ami-123\"
}"
```

**Incident response pattern:**
```
# Switch to the DevOps Engineer agent (Tab), then:
/call datadog_query_logs {"query":"service:payment status:error","hoursAgo":1}
/call devops_diagnose_logs {"logs":"<result>","source":"app"}
/read k8s/payment-service.yaml
Suggest a fix for the Kubernetes deployment
```

---

## Product Management

### Product Manager Agent

The [Product Manager agent](../../.mtc/agents/product-manager.md) assists with
requirements analysis, user story creation, sprint planning, and release notes.

```
# Gather requirement context (subagents run /read, /glob, /call only):
/subagent product-manager /read docs/requirements/notifications.md

# Generate artifacts with a primary agent (switch with Tab):
Write user stories with acceptance criteria for a notification system
- Real-time push notifications
- Email digest
- In-app notification center
```

**Output artifacts:**
- User stories with acceptance criteria
- Sprint plans with story point estimates
- Release notes and changelog drafts
- PRD (Product Requirements Document) outlines
- A/B test plans

---

## Adding New Department Workflows

The MCP plugin system makes it straightforward to connect any tool:

1. **Build an MCP server** following the [scaffold](../templates/mcp-plugin-scaffold.ts)
2. **Register** in `.mtc/mcp.json`
3. **Create an agent** in `.mtc/agents/` with instructions for using the new tools
4. **Document** the workflow in this directory

### Plugin Checklist

- [ ] Implements JSON-RPC over stdin/stdout
- [ ] Handles `initialize`, `tools/list`, `tools/call`
- [ ] Returns structured error messages
- [ ] Security-reviewed (no unexpected network calls, no eval)
- [ ] README with setup instructions and example calls
