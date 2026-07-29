# Intellectual Property (IP) & Patent Strategy

Defines the IP boundary between open-source and proprietary code, trademark
strategy, patent approach, and contributor IP obligations for the **mtc**
platform.

---

## 1. Licensing Boundary

The repository contains two distinct licensing zones:

| Zone | Scope | License | Distribution |
|------|-------|---------|--------------|
| **Open-Source Core** | `src/` (excluding `src/enterprise/`), `bin/`, `vscode-mtc/`, `tests/`, `docs/` | MIT | Free for any use, modification, and redistribution |
| **Enterprise** | `src/enterprise/` | Proprietary (see below) | Licensed under commercial terms only |

### Open-Source Core (MIT)

All files outside `src/enterprise/` are distributed under the MIT License
(see `LICENSE` in the repository root). Contributions to these files are
accepted under the same MIT terms.

### Enterprise (Proprietary)

All files under `src/enterprise/` are **proprietary** and **not** licensed
under MIT. These files implement:

- Commercial license key generation, activation, and validation
- License tier gating and feature flags
- Multi-tenant organisation management with RBAC
- Immutable audit logging engine
- Enterprise web dashboard (control plane)

Access to enterprise source requires a valid commercial license agreement
with MetaTeam Technologies. Redistribution, reverse engineering, or
unauthorised use is prohibited.

Each enterprise source file carries the following header:

```typescript
/**
 * PROPRIETARY — MetaTeam Technologies
 *
 * This file is part of the Enterprise Edition of Metateam Code Agent.
 * It is NOT licensed under the MIT License.
 * Commercial license required. See LICENSE.ENTERPRISE or contact
 * legal@metateam.io for terms.
 */
```

---

## 2. Copyright Ownership

- **MetaTeam Technologies** holds copyright over all original work in this
  repository.
- **Contributors** retain copyright over their contributions but grant
  MetaTeam Technologies an irrevocable, worldwide, royalty-free license to
  use, modify, and distribute those contributions under the applicable
  license (MIT for core, proprietary assignment for enterprise).
- All contributors must sign a **Contributor License Agreement (CLA)**
  before their first pull request is merged. The CLA confirms:
  - The contributor has the right to submit the contribution
  - The contribution does not infringe third-party IP
  - For enterprise-zone contributions, copyright is assigned to MetaTeam
    Technologies

---

## 3. Trademark Strategy

| Mark | Status | Protection |
|------|--------|------------|
| **Metateam Code Agent** | US intent-to-use filed (Class 9, 42) | Word mark |
| **MTC** | US intent-to-use filed (Class 9, 42) | Word mark |
| **MTC Logo** (hexagon device) | US intent-to-use filed (Class 9) | Design mark |

See [TRADEMARKS.md](../../TRADEMARKS.md) for full usage guidelines.

Marks are used for: software branding, CLI command prefixes, VS Code
extension naming, package registries (npm, Homebrew), and documentation.

### Trademark Enforcement

- Third-party use of "Metateam Code Agent" or "MTC" in a way that suggests
  official affiliation, certification, or endorsement is prohibited without
  a written trademark licence.
- Open-source forks must rename the project and remove all references to
  the marks in documentation, CLI output, and package metadata.

---

## 4. Patent Strategy

### What May Be Patented

The following areas are under evaluation for patent filings:

1. **Agent Orchestration Engine** — The method by which `mtc` routes tasks
   across multiple agents based on tool-permission matrices, session
   context, and capability heuristics (`src/agents/`, `src/session/`).

2. **Multi-Model Routing & Failover** — The algorithm that selects between
   LLM providers/models based on cost, latency, capability, and
   user-defined policies, with transparent fallback (`src/llm/`).

3. **MCP Plugin Sandbox & Permission Model** — The system for declaring,
   verifying, and enforcing tool-level permissions for subprocess-based
   plugins (`src/mcp-plugins/`, `src/tools/`).

4. **Fine-Tuned Agent Architectures** — Proprietary system prompts,
   tool-use training regimens, and evaluation frameworks developed for
   MetaTeam's internal agent variants.

### Patent Pledge

MetaTeam Technologies commits to the following **Patent Pledge**:

- Patents covering the open-source core (MIT zone) will be licensed
  royalty-free to any implementer of the MIT-licensed code.
- Patents will not be asserted against open-source contributors acting in
  good faith.
- Patent rights covering enterprise features are reserved exclusively for
  commercial licensees.

### Defensive Publication

Techniques that are useful but not competitive differentiators will be
defensively published (e.g., via the [Defensive Publications
Portal](https://www.tdcommons.org/)) to prevent third-party patenting.

---

## 5. Trade Secrets

The following are maintained as trade secrets and **must not** be disclosed
in public source code, documentation, or discussions:

- License key generation private keys and signing algorithms
- Internal fine-tuned model weights and training data
- Enterprise customer lists and deployment configurations
- Security vulnerability details before patch release

---

## 6. Third-Party IP

This project depends on open-source libraries (see `package.json`). All
dependencies are used under their respective licences (MIT, Apache 2.0,
ISC, BSD). The combination does not change the licensing of the
open-source core.

Enterprise zone code may link against these same dependencies but remains
proprietary.

---

## 7. IP Compliance Checklist

Before each public release, verify:

- [ ] All new files in `src/enterprise/` have the proprietary header
- [ ] No proprietary code, credentials, or internal URLs have leaked into
      the open-source zone
- [ ] Third-party dependency licences are compatible with MIT distribution
- [ ] CHANGELOG and release notes do not disclose trade secrets
- [ ] All contributors since the last release have signed the current CLA

---

*For IP questions, patent disclosures, or licence inquiries, contact
legal@metateam.io.*
