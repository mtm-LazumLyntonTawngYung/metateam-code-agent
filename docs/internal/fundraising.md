# Fundraising — MetaTeam AI Labs

Target market, traction metrics, investor universe, and use-of-funds plan
for the mtc spin-off entity.

---

## 1. Market Opportunity

| Metric | Value | Source |
|--------|-------|--------|
| **TAM** | $8.5B | AI-assisted developer tooling (2030) |
| **SAM** | $2.1B | Terminal-first + CI/CD-integrated coding agents |
| **SOM** | $180M | Enterprise dev teams using autonomous PR agents |
| **Market CAGR** | 32% | GitHub Copilot / Devin / Cursor comparable growth |

### Competitive Landscape

| Competitor | Strengths | Weaknesses vs. mtc |
|------------|-----------|-------------------|
| GitHub Copilot | IDE integration, brand | Closed agents, no MCP, no autonomous PR |
| Devin | Autonomous mode, marketing | Cloud-only, expensive, no local CLI |
| Cursor | Fork-based, fast | VS Code lock-in, no multi-agent |
| OpenCode | Open-source, terminal | No enterprise tier, no fine-tuned models |
| CodeRabbit | PR review | Narrow scope, no coding agents |

**MTC differentiators:**
- Terminal-native with full TUI (Ink/React)
- Multi-agent orchestration + MCP plugin ecosystem
- Open-source core + enterprise control plane
- Autonomous daemon mode with PR generation
- Tool-permission matrix (fine-grained security)

---

## 2. Traction Metrics

Growth accounting framework: each user generates sessions × tool calls,
which produce measurable developer productivity outcomes.

### Adoption Metrics

| Metric | Current | Target (Series A) |
|--------|---------|-------------------|
| Active developer sessions (daily) | — | 5,000+ |
| Total registered users | — | 25,000+ |
| Paying organizations | — | 200+ |
| Enterprise ACV | — | $25K–$100K |
| Community-to-enterprise conversion | — | >5% |

### Usage & Performance Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| **Sessions per active user / week** | Avg developer sessions | 8+ |
| **Tokens processed / month** | Total LLM tokens | >1B |
| **Tool calls / session** | Avg tools invoked per session | 15+ |
| **Autonomous PR resolution rate** | % of daemon-generated PRs merged unmodified | >40% |
| **Autonomous PR resolution rate (with edits)** | % merged with minor edits | >70% |
| **Agent task completion rate** | % of tasks completed without human intervention | >75% |
| **MCP plugins published** | Ecosystem plugins in registry | 50+ |
| **Avg session duration** | Time from start to task completion | <12 min |
| **p50 latency per tool call** | Time to first tool response | <2s |

### Unit Economics

| Metric | Target |
|--------|--------|
| **CAC (self-serve)** | $50 |
| **CAC (enterprise)** | $2,500 |
| **Self-serve monthly LTV** | $25/mo × 18 mo avg = $450 |
| **Enterprise ACV** | $50K (3-5 users) |
| **Net revenue retention** | >120% (land + expand on seats) |
| **Payback period (self-serve)** | 2 months |
| **Payback period (enterprise)** | 6 months |

---

## 3. Investment Thesis

### Seed Round

| Term | Detail |
|------|--------|
| **Target raise** | $3–5M |
| **Instrument** | SAFE with valuation cap ($15–20M) or priced seed |
| **Lead** | DevTools-focused fund (e.g., Gradient, Madrona, Flybridge) |
| **Co-investors** | AI infrastructure angels, existing MetaTeam angels |
| **Target close** | T+8 weeks from spin-off incorporation |

### Use of Funds (Seed)

| Area | % | Amount | Purpose |
|------|---|--------|---------|
| Engineering | 50% | $1.5–2.5M | Core agents, MCP SDK, daemon reliability, cloud SaaS |
| Go-to-Market | 25% | $0.75–1.25M | Developer marketing, community, first enterprise sales |
| Infrastructure | 10% | $0.3–0.5M | LLM inference, hosting, observability |
| Legal & compliance | 10% | $0.3–0.5M | IP filings, SOC2, enterprise procurement support |
| Operations | 5% | $0.15–0.25M | Tools, travel, recruiting |

### Series A

| Term | Detail |
|------|--------|
| **Target raise** | $10–15M |
| **Lead** | Series A AI / DevTools specialist (e.g., Andreessen Horowitz, Benchmark, CRV) |
| **Target close** | T+24 months from spin-off |
| **Key metrics required** | 200+ paying orgs, $1M+ ARR, 5K+ DAU sessions |

---

## 4. Target Investor Universe

### DevTools Specialists

| Fund | Thesis Fit |
|------|------------|
| **Gradient Ventures** (Google) | AI-native developer tools |
| **Madrona Ventures** | Seattle/PNW developer platforms |
| **Flybridge Capital** | AI-first infrastructure |
| **Felicis Ventures** | Developer tooling, open-source commercial |
| **Heavybit** | Developer-first enterprise SaaS |

### AI Infrastructure Funds

| Fund | Thesis Fit |
|------|------------|
| **AIX Ventures** | AI application layer |
| **LDV Capital** | AI infrastructure |
| **Theory Ventures** | AI + developer tools |
| **Ridge Ventures** | Enterprise AI |

### Strategic Angels

| Profile | Value Add |
|---------|-----------|
| Former Vercel / Netlify PM | DevTools GTM playbook |
| Former GitHub / Copilot eng | AI coding agent architecture |
| Former HashiCorp exec | Open-source commercial model |
| Former Datadog exec | SaaS metrics + enterprise sales |

---

## 5. Data Room Index

The following documents should be prepared for seed due diligence:

| Document | Location |
|----------|----------|
| IP governance & patent strategy | [ip-governance.md](./ip-governance.md) |
| Commercial tiering & licensing | [commercialization.md](./commercialization.md) |
| Spin-off corporate structure | [spin-off.md](./spin-off.md) |
| Architecture overview | [architecture.md](./architecture.md) |
| Platform governance | [governance.md](./governance.md) |
| Security policy | [security-policy.md](./security-policy.md) |
| Active license key generation | `src/enterprise/license.ts` |
| Audit logging engine | `src/enterprise/audit.ts` |
| Organizational RBAC | `src/enterprise/org.ts` |
| Full codebase (open-source) | `./` (root, MIT-licensed) |

### Financial Model Assumptions (Seed)

| Year | DAU | Paying Orgs | ARR | Burn |
|------|-----|-------------|-----|------|
| Y1 | 1K | 20 | $240K | $1.2M (lean 8-person team) |
| Y2 | 5K | 150 | $2.5M | $3.0M (scale to 15 people) |
| Y3 | 15K | 500 | $10M | $6.0M (efficient growth) |

---

*Contact founders@metateam-ai-labs.io for the full data room and pitch deck.*
