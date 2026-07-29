# MetaTeam AI Labs — Spin-Off Strategy

This document outlines the rationale, structure, and execution plan for
spinning **mtc** out of MetaTeam into an independent venture-backed entity:
**MetaTeam AI Labs, Inc.**

---

## 1. Rationale

| Factor | Description |
|--------|-------------|
| **Market focus** | Developer tools + AI infrastructure is a distinct market from MetaTeam's core business |
| **Fundraising** | A dedicated entity can raise venture capital without diluting MetaTeam's cap table or diverting its cash flow |
| **Talent** | Spin-off enables equity-heavy hiring (options pool) competitive with AI startups |
| **Brand** | "MetaTeam AI Labs" signals a standalone AI-first product company, not an internal tool |
| **M&A optionality** | Clean entity structure enables acquisition without selling MetaTeam |

### Trigger Conditions

The spin-off is activated when all of the following are met:

1. **100+ active paying organizations** on the Enterprise tier
2. **>500 daily active developer sessions** across community + enterprise
3. **At least 2 referenceable enterprise customers** paying >$50K ACV
4. **Sustained 20% month-over-month growth** in seat count for 3 consecutive months

---

## 2. Corporate Structure

```
MetaTeam (parent)
│
├── MetaTeam AI Labs, Inc. (Delaware C-Corp, wholly owned → partially owned)
│   ├── mtc CLI (open-source, MIT)
│   ├── Enterprise Edition (proprietary, licensed)
│   ├── mtc Cloud (hosted SaaS control plane)
│   └── Fine-tuned model registry
│
└── MetaTeam Core (existing business, retains ownership stake)
```

### Entity Formation Steps

| Step | Action | Timeline |
|------|--------|----------|
| 1 | Incorporate MetaTeam AI Labs, Inc. in Delaware (C-Corp) | T+0 |
| 2 | Execute IP contribution agreement — MetaTeam assigns mtc IP to subsidiary | T+2 weeks |
| 3 | Execute trademark assignment — "MTC" and "Metateam Code Agent" marks | T+2 weeks |
| 4 | Set up board structure (MetaTeam-appointed directors + independent) | T+4 weeks |
| 5 | Open separate banking, accounting, and legal entities | T+4 weeks |
| 6 | Hire founding CEO (if not internally sourced) | T+6 weeks |
| 7 | Close seed round | T+8 weeks |

### IP Contribution & Licensing

| Asset | Treatment |
|-------|-----------|
| `src/` (open-source core) | Assigned to MetaTeam AI Labs; continues under MIT |
| `src/enterprise/` (proprietary) | Assigned to MetaTeam AI Labs; proprietary |
| "MTC" / "Metateam Code Agent" trademarks | Assigned to MetaTeam AI Labs |
| Fine-tuned model weights | Owned by MetaTeam AI Labs; licensed back to MetaTeam |
| Customer contracts | Novated to MetaTeam AI Labs |

MetaTeam (parent) receives a **royalty-free, perpetual, worldwide license**
to use mtc internally. In exchange, MetaTeam AI Labs receives a
**perpetual, irrevocable license** to MetaTeam's name and brand marks.

---

## 3. Cap Table (Post-Spin, Pre-Seed)

| Stakeholder | Ownership | Notes |
|-------------|-----------|-------|
| MetaTeam (parent) | 45–55% | For contributed IP, trademarks, and initial funding |
| Founders / Leadership | 15–20% | CEO, CTO, Head of Product |
| Employee option pool | 15–20% | Standard for seed-stage AI startups |
| Seed investors | 10–15% | Priced round or SAFE with valuation cap |

### Option Pool

- **Size:** 18% fully-diluted post-seed
- **Vesting:** 4-year, 1-year cliff, monthly thereafter
- **Exercisability:** Early exercise allowed (83(b) election)
- **Refresh pool:** 2% annual evergreen replenishment

---

## 4. Board & Governance

| Seat | Appointer | Term |
|------|-----------|------|
| Chair | MetaTeam | Initial 3 years |
| CEO | MetaTeam AI Labs | Ongoing |
| Independent director | Mutual agreement | 2-year renewable |
| Investor director | Lead seed investor (post-close) | Through Series B |

### Reserved Matters (MetaTeam veto)

- Any change to the MIT licensing of the open-source core
- Sale of the open-source core assets separate from the enterprise business
- Amendment to the IP license-back agreement benefiting MetaTeam

---

## 5. Leadership Team

| Role | Source | Priority |
|------|--------|----------|
| **CEO** | External hire (AI developer tools experience) | P0 |
| **CTO** | Internal MetaTeam lead (mtc architect) | P0 |
| **Head of Product** | External (developer platforms) | P1 |
| **Head of Engineering** | Internal promotion or external | P1 |
| **Head of Sales** | External (DevTools enterprise sales) | P1 |

---

## 6. Operations

| Function | MetaTeam AI Labs | Shared Services (MetaTeam) |
|----------|------------------|----------------------------|
| Engineering | Dedicated team | — |
| Sales & Marketing | Dedicated team | — |
| Legal | — | Shared (fee-for-service) |
| Finance / Accounting | — | Shared (fee-for-service) |
| Office / Facilities | — | Shared (co-location) |
| HR / Recruiting | Dedicated recruiter | Shared platform |

---

## 7. Timeline

```
T+0  ─  Incorporate, IP assignment, board formation
T+2  ─  Seed fundraising begins (data room prepared)
T+4  ─  First engineering hires, separate CI/CD
T+8  ─  Seed close (~$3-5M), CEO on board
T+12 ─  V1 mtc Cloud SaaS beta (hosted control plane)
T+18 ─  First enterprise self-serve tier (credit card)
T+24 ─  Series A fundraising ($10-15M target)
```

---

## 8. Risk Factors

| Risk | Mitigation |
|------|------------|
| Parent company priorities shift | Board seat + governance agreement ensures autonomy |
| Talent retention post-spin | Competitive equity, retention bonuses for key engineers |
| Customer confusion (branding) | Clear communication: "From the makers of MTC at MetaTeam AI Labs" |
| Open-source community fork risk | Trademark enforcement, trademark assignment to entity |
| IP valuation dispute | Third-party valuation of contributed assets |

---

*For questions about the spin-off, contact founders@metateam-ai-labs.io.*
