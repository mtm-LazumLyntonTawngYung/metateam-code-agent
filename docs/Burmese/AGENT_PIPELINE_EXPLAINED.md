# Agent Pipeline Explained (မြန်မာ)

ဤစာရွက်စာတမ်းသည် ဤ Project တွင် ထည့်သွင်းတည်ဆောက်ထားသော Agent Pipeline တစ်ခုလုံး၏ အလုပ်လုပ်ပုံကို ရှင်းပြထားသည်။ အဆင့်တစ်ခုစီ၏ ရည်ရွယ်ချက်၊ ရေးသားထားသည့် code နှင့် ဒီဇိုင်းဆိုင်ရာ ဆုံးဖြတ်ချက်များ၏ အကြောင်းရင်းကို ဖော်ပြပေးထားပါသည်။

---

# Agent Pipeline Explained (အင်္ဂလိပ် အညွှန်း)

---

## High-Level Flow (အဆင့်မြင့် လုပ်ငန်းစဉ် စီးဆင်းပုံ)

```
┌──────────────────────────────────────────────────────────────────┐
│                     AGENT PIPELINE                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  INPUT PHASE (အချက်အလက် ထည့်သွင်းသည့် အဆင့်)                         │
│                                                                  │
│  User Input → Agent Selection → Permission Check → Tool Choice   │
│                                                                  │
│  EXECUTION PHASE (စနစ် အလုပ်လုပ်ဆောင်သည့် အဆင့်)                    │
│                                                                  │
│  Tool Execution → Result → LLM Call → Streaming Response         │
│                                                                  │
│  PERSISTENCE PHASE (ဒေတာ သိမ်းဆည်းသည့် အဆင့်)                      │
│                                                                  │
│  Save Turn → Update Session → Optional Summary                   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

```

---

## အဆင့် ၁ - CLI ဝင်ရောက်ခြင်းနှင့် TUI ကို စတင်ခြင်း (CLI Entry and TUI Launch)

**ဖိုင်** - `src/cli.tsx`

အသုံးပြုသူက `mtc` ဟု မည်သည့် argument မှ မပါဘဲ ရိုက်နှိပ်လိုက်ပါက CLI သည် Ink TUI ကို စတင်ပါလိမ့်မည်။

### ဖြစ်ပျက်ပုံများ

1. Commander.js မှ command line ကို သုံးသပ်စစ်ဆေးသည် (parse လုပ်သည်)။
2. Subcommand မရှိသည့်အတွက် Default လုပ်ဆောင်ချက်ကို စတင်သည်။
3. Default လုပ်ဆောင်ချက်သည် `src/ui/App.tsx` မှ Ink `<App>` component ကို ပုံဖော်ပေးသည် (render လုပ်သည်)။
4. Ink က Terminal ကို ထိန်းချုပ်လိုက်ပြီး React components များကို ရေးဆွဲပေးသည်။
5. TUI သည် အသုံးပြုသူ၏ Input ကို စောင့်ဆိုင်းရန် Event Loop ထဲသို့ ဝင်ရောက်သွားသည်။

---

## အဆင့် ၂ - Agent ကို ရွေးချယ်ခြင်း (Agent Selection)

**ဖိုင်** - `src/agents/index.ts`

Agent loop မစတင်မီ အသုံးပြုသူ (သို့မဟုတ် default config) က Agent ကို ရွေးချယ်သည်။

### ဖြစ်ပျက်ပုံများ

1. TUI သည် Config မှ Default Agent ကို ဆွဲယူသည်။ သို့မဟုတ် စနစ်တွင် ပါပြီးသား Default ကို အသုံးပြုသည်။
2. စိတ်ကြိုက် Agent များကို `.mtc/agents/*.md` သို့မဟုတ် `~/.config/mtc/agents/*.md` မှ ဆွဲယူသည်။
3. Agent တိုင်း၏ Frontmatter မှ ခွင့်ပြုချက် (Permissions) များကို စစ်ဆေးသည်။
4. System prompt ကို Agent ၏ Markdown body နှင့် လိုအပ်သော နည်းဥပဒေ (rules) များကို ပေါင်းစပ်၍ ပြင်ဆင်သည်။
5. `.mtc/rules/` နှင့် `AGENTS.md` ထဲမှ Rules များကို System prompt ၏ နောက်ဆက်တွဲအဖြစ် ပေါင်းထည့်သည်။

---

## အဆင့် ၃ - အသုံးပြုသူ၏ Input နှင့် Agent Loop

**ဖိုင်** - `src/ui/App.tsx`, `src/agents/agent-loop.ts`

အသုံးပြုသူက စာရိုက်ပြီး Enter နှိပ်လိုက်သောအခါ Agent Loop စတင်သည်။

### ဖြစ်ပျက်ပုံများ

1. အသုံးပြုသူ၏ စာတိုကို Conversation History (စကားပြောမှတ်တမ်း) ထဲသို့ ပေါင်းထည့်သည်။
2. Agent Loop က LLM အတွက် Prompt တစ်ခု ဖန်တီးလိုက်သည် -
* System message (Agent ၏ ညွှန်ကြားချက်များ + Rules များ)
* Conversation history (နောက်ဆုံးပြောခဲ့သော စကားပြော N ခု)
* လက်ရှိ အသုံးပြုသူ ရိုက်နှိပ်လိုက်သော စာတို


3. LLM ကို Streaming ဖွင့်ထားလျက် ခေါ်ယူလိုက်သည်။
4. TUI တွင် အဖြေကို စာလုံးတစ်လုံးချင်းစီ (token-by-token) ပြသပေးသည်။
5. LLM က Tool ကို အသုံးပြုရန် တောင်းဆိုပါက Loop သည် ခွင့်ပြုချက်တောင်းခံရန် ခေတ္တရပ်တန့်သွားမည်။

---

## အဆင့် ၄ - Tool ကို အလုပ်လုပ်ဆောင်စေခြင်း (Tool Execution)

**ဖိုင်** - `src/tools/index.ts`

Tool အသုံးပြုခွင့် ရရှိသည်နှင့် Tool ကို စတင် အလုပ်လုပ်ဆောင်စေသည်။

### ဖြစ်ပျက်ပုံများ

1. Tool registry က အမည်ကို ကြည့်၍ သက်ဆိုင်ရာ Tool ကို ရှာဖွေသည်။
2. ထည့်သွင်းလိုက်သော Parameter (Input arguments) များကို Zod schema နှင့် ကိုက်ညီမှု ရှိမရှိ စစ်ဆေးသည်။
3. စစ်ဆေးပြီးသော Arguments များဖြင့် Tool function ကို ခေါ်ယူသည်။
4. ရလဒ်ကို Agent Loop သို့ ပြန်လည် ပေးပို့သည်။
5. ရလဒ်ကို ပုံစံတကျ ပြင်ဆင်ပြီး Conversation History ထဲသို့ ထည့်သွင်းသည်။
6. ရလဒ်ကို သုံးသပ်ပြီး နောက်ထပ်အဆင့်ကို ဆုံးဖြတ်ရန် LLM ကို ထပ်မံ ခေါ်ယူသည်။

---

## အဆင့် ၅ - LLM ခေါ်ယူခြင်းနှင့် Streaming ရယူခြင်း (LLM Call and Streaming)

**ဖိုင်** - `src/llm/client.ts`, `src/llm/router.ts`

Tool တစ်ခုခု အလုပ်လုပ်ပြီးတိုင်း (သို့မဟုတ် အသုံးပြုသူထံမှ စာတိုရရှိပြီးတိုင်း) LLM ကို ထပ်မံခေါ်ယူသည်။

### ဖြစ်ပျက်ပုံများ

1. Router သည် မေးခွန်း၏ ခက်ခဲနက်နဲမှုကို ခွဲခြားသတ်မှတ်သည် (ရိုးရှင်းသည်၊ ပုံမှန်၊ အကြောင်းပြချက်အစဉ်လိုက် စဉ်းစားရမည်)။
2. သင့်တော်သော Model ကို ရွေးချယ်သည်။
3. ပထမ ဦးစားပေး Provider မရပါက Fallback chain ကို အသုံးပြုသည်။
4. LLM ကို `stream: true` ဖြင့် ခေါ်ယူသည်။
5. Tokens တွဲများ လှိုင်းအဖြစ် ရောက်ရှိလာပြီး TUI တွင် တိုက်ရိုက် (real-time) ပြသပေးသည်။
6. တုံ့ပြန်ချက်တွင် Tool ခေါ်ယူမှု ပါဝင်ပါက Loop သည် အဆင့် ၄ သို့ ပြန်သွားမည်။
7. တုံ့ပြန်ချက်သည် စာသားသက်သက် ဖြစ်ပါက Loop ပြီးဆုံးသွားပြီး အလှည့်ကို သိမ်းဆည်းလိုက်သည်။

---

## အဆင့် ၆ - ခွင့်ပြုချက်များ စစ်ဆေးခြင်း (Permission Checks)

**ဖိုင်** - `src/agents/permissions.ts`

Tool တစ်ခုကို အလုပ်မလုပ်ဆောင်မီ Agent ၏ ခွင့်ပြုချက်များကို စစ်ဆေးသည်။

### ခွင့်ပြုချက် အဆင့်များ (Permission Levels)

| အဆင့် (Level) | မူဘောင် (Behavior) |
| --- | --- |
| `allow` | မေးမြန်းခြင်း မပြုဘဲ တိုက်ရိုက် လုပ်ဆောင်မည် |
| `ask` | အသုံးပြုသူထံမှ အတည်ပြုချက် တောင်းခံမည် |
| `deny` | Tool ခေါ်ယူမှုကို ငြင်းပယ်မည် |

---

## အဆင့် ၇ - Session ကို ဒေတာဘေ့စ်တွင် သိမ်းဆည်းခြင်း (Session Persistence)

**ဖိုင်** - `src/session/index.ts`

တစ်လှည့်စီ ပြောဆိုပြီးတိုင်း ပြောဆိုချက်များကို SQLite database ထဲတွင် သိမ်းဆည်းသည်။

### သိမ်းဆည်းသည့် အချက်အလက်များ

* **User message** - ထည့်သွင်းလိုက်သော စာသား
* **Tool calls** - အမည်၊ သုံးစွဲသည့် Parameter များ နှင့် ထွက်ပေါ်လာသည့် ရလဒ်
* **LLM response** - ပြည့်စုံသော စာသား တုံ့ပြန်ချက်
* **Metadata** - အချိန်၊ သုံးစွဲခဲ့သော Token ပမာဏ၊ အသုံးပြုခဲ့သော Model နှင့် Latency

---

## အဆင့် ၈ - MCP Integrated လုပ်ဆောင်ခြင်း (MCP Integration)

**ဖိုင်** - `src/mcp/index.ts`

စနစ်စတင်ချိန်တွင် MCP servers များကို Load လုပ်ပြီး ၎င်းတို့၏ Tools များကို Local tool registry ထဲသို့ ပေါင်းစပ်လိုက်သည်။

### MCP Server ရှာဖွေသည့် အစီအစဉ်

1. လက်ရှိ လုပ်ဆောင်နေသည့် Directory ထဲရှိ `.mtc/mcp.json`
2. တစ်ကမ္ဘာလုံးဆိုင်ရာ (Global) ဖြစ်သော `~/.config/mtc/mcp.json`
3. OpenCode Configuration ဖိုင်များ

---

## အဆင့် ၉ - မျက်နှာပြင်မပါသော Daemon Mode (Headless Daemon Mode)

**ဖိုင်** - `src/daemon/webhook.ts`, `src/daemon/pipeline.ts`

Daemon သည် TUI မပါဘဲ နောက်ကွယ်တွင် Run နေပြီး Webhooks များကို နားစွင့်စောင့်ဆိုင်းနေသည်။

### ဖြစ်ပျက်ပုံများ

1. `mtc daemon` က Bun.serve HTTP server ကို စတင်သည်။
2. Server က GitHub/GitLab webhooks များကို နားစွင့်နေသည်။
3. ဝင်ရောက်လာသော Webhooks များကို စစ်ဆေးသည် (signature, IP allowlist, rate limit)။
4. `autofix` label ပါသော GitHub `issues` ဖြစ်ရပ်များအတွက် -
* Repository ကို ယာယီ Directory ထဲသို့ Clone ဆွဲယူသည်။
* Issue ကို LLM ဖြင့် လေ့လာသုံးသပ်သည်။
* ပြင်ဆင်မှုကို ဖန်တီးပြီး ထည့်သွင်းလိုက်သည်။
* Test များကို Run သည်။ (သတ်မှတ်ထားပါက)
* ပြင်ဆင်ချက်ဖြင့် Draft PR တစ်ခုကို ဖွင့်လှစ်လိုက်သည်။


5. ပြီးစီးပါက သို့မဟုတ် လွဲမှားမှုရှိပါက Slack/Teams သို့ အကြောင်းကြားချက် ပေးပို့သည်။

---

## အဆင့် ၁၀ - VS Code Extension

**ဖိုင်** - `src/server/ws.ts`, `vscode-mtc/src/extension.ts`

WebSocket server သည် Editor နှင့် ချိတ်ဆက်မှုကို လုပ်ဆောင်ပေးနိုင်သည်။

### ဖြစ်ပျက်ပုံများ

1. `mtc serve` က WebSocket server ကို စတင်သည်။
2. VS Code extension က WebSocket မှတစ်ဆင့် ချိတ်ဆက်သည်။
3. Extension က မေးခွန်းများ၊ ရွေးချယ်ထားသော Code နှင့် ဖိုင် Context များကို ပေးပို့သည်။
4. Server က တောင်းဆိုချက်များကို Agent Loop ထို့ ပေးပို့သည်။
5. တုံ့ပြန်ချက်များကို Extension ထံသို့ Stream လုပ်၍ ပြန်လည်ပေးပို့သည်။
6. Extension က ၎င်းတို့ကို Sidebar webview တွင် ပုံဖော်ပြသပေးသည်။

---

## Data Flow အနှစ်ချုပ် (Data Flow Summary)

```
အသုံးပြုသူက TUI တွင် စာရိုက်လိုက်သည်
    │
    ▼
[Agent Loop] → System message + History ဖြင့် Prompt ကို စုစည်းသည်
    │
    ▼
[LLM Router] → မေးခွန်းကို ခွဲခြားသည်၊ Model ကို ရွေးချယ်သည်၊ LLM ကို ခေါ်ယူသည်
    │
    ▼
LLM တုံ့ပြန်ချက်:
    ├── စာသား → TUI တွင် ပြသသည်၊ အလှည့်ကို သိမ်းဆည်းသည်
    └── Tool call → [Permission Check]
            │
            ├── ငြင်းပယ်သည် (denied) → LLM ကို အကြောင်းကြားသည်၊ ပြန်လည် ကြိုးစားသည်
            ├── မေးမြန်းသည် (ask) → အသုံးပြုသူကို မေးသည်၊ ဆက်သွားမည် သို့မဟုတ် ပယ်ဖျက်မည်
            └── ခွင့်ပြုသည် (allowed) → [Tool Execution]
                    │
                    ▼
                [Tool Registry] → Args ကို စစ်ဆေးသည်၊ Tool ကို လုပ်ဆောင်သည်
                    │
                    ▼
                [Result] → History ထဲသို့ ပေါင်းထည့်သည်၊ LLM ကို ထပ်မံ ခေါ်ယူသည်
                    │
                    ▼
                LLM က စာသား ပြန်လည် မထုတ်ပေးမချင်း Loop အလုပ်လုပ်မည်

```

---

## အဓိက ဒီဇိုင်းဆိုင်ရာ ဆုံးဖြတ်ချက်များ (Key Design Decisions)

| ဆုံးဖြတ်ချက် (Decision) | အကြောင်းပြချက် (Reasoning) |
| --- | --- |
| Terminal-first UI | Latency နည်းပါးခြင်း၊ Filesystem ကို တိုက်ရိုက် သုံးနိုင်ခြင်း၊ OS တိုင်းတွင် သုံးနိုင်ခြင်း |
| Permissioned tools | ကိုယ်တိုင် Code ပြင်ဆင်ရေးဆွဲခြင်းတွင် လုံခြုံရေးနှင့် ထိန်းချုပ်မှု ရရှိစေရန် |
| Streaming LLM responses | ပိုမိုကောင်းမွန်သော UX နှင့် အရှိန်အဟုန် မြန်ဆန်သည်ဟု ခံစားရစေရန် |
| SQLite for sessions | ပေါ့ပါးခြင်း၊ Serverless ဖြစ်ခြင်း၊ ရွှေ့ပြောင်းရ လွယ်ကူခြင်း |
| MCP for external tools | စနစ်၏ ပင်မအပိုင်းကို မပြင်ဘဲ တိုးချဲ့နိုင်သော Standard protocol ဖြစ်ခြင်း |
| Daemon for webhooks | လူကိုယ်တိုင် ပါဝင်ရန် မလိုဘဲ အပြည့်အဝ ကိုယ်တိုင် လုပ်ဆောင်နိုင်ခြင်း |
| WebSocket for editor | Real-time ဖြစ်ခြင်း၊ နှစ်ဦးနှစ်ဖက် ချိတ်ဆက်နိုင်ခြင်း၊ Overhead နည်းပါးခြင်း |