# Code Walkthrough (မြန်မာ)

ဤစာရွက်စာတမ်းသည် Codebase အတွင်းရှိ အဓိက Module၊ Router နှင့် Utility တစ်ခုစီကို ရှင်းပြထားပါသည်။ အပိုင်းတစ်ခုစီ၏ အလုပ်လုပ်ပုံနှင့် ဒီဇိုင်းရေးဆွဲထားသည့် အကြောင်းရင်းကို သိရှိနိုင်ရန် ဤစာရွက်စာတမ်းကို မူရင်း Code များနှင့် ယှဉ်တွဲဖတ်ရှုပါ။

---

# Code Walkthrough (အင်္ဂလိပ် အညွှန်း)

---

## မာတိကာ (Table of Contents)

1. [CLI Entry Point (`src/cli.tsx`)](https://www.google.com/search?q=%23srcclitsx)
2. [TUI Application (`src/ui/App.tsx`)](https://www.google.com/search?q=%23srcuiapptsx)
3. [Agent System (`src/agents/`)](https://www.google.com/search?q=%23srcagents)
4. [Tool Registry (`src/tools/`)](https://www.google.com/search?q=%23srctools)
5. [LLM Layer (`src/llm/`)](https://www.google.com/search?q=%23srcllm)
6. [MCP Client (`src/mcp/`)](https://www.google.com/search?q=%23srcmcp)
7. [Session Management (`src/session/`)](https://www.google.com/search?q=%23srcsession)
8. [Daemon (`src/daemon/`)](https://www.google.com/search?q=%23srcdaemon)
9. [Enterprise (`src/enterprise/`)](https://www.google.com/search?q=%23srcenterprise)
10. [Server (`src/server/`)](https://www.google.com/search?q=%23srcserver)
11. [Shared Sessions (`src/shared-sessions/`)](https://www.google.com/search?q=%23srcshared-sessions)
12. [Configuration (`src/config/`)](https://www.google.com/search?q=%23srcconfig)

---

## `src/cli.tsx`

**တည်နေရာ** - `src/cli.tsx`

ဤဖိုင်သည် ပင်မ CLI Entry Point ဖြစ်သည်။ Commander.js ကို အသုံးပြု၍ ထိပ်တန်း အမိန့်ပေးစနစ်များ (Top-level commands) နှင့် ၎င်းတို့၏ Options များကို သတ်မှတ်ထားသည်။

### Top-Level Commands များ

| Command | ဖော်ပြချက် |
| --- | --- |
| `mtc` (default) | Interactive Ink TUI ကို စတင်သည် |
| `eval list|run|bench` | Agent အခြေပြု ဆန်းစစ်ချက်နှင့် စွမ်းဆောင်ရည် စမ်းသပ်ချက်များ |
| `analytics report|enable|disable|status` | အသုံးပြုမှုဆိုင်ရာ သုံးသပ်ချက် စီမံခန့်ခွဲမှု |
| `serve` | Editor နှင့် ချိတ်ဆက်ရန် WebSocket server ကို စတင်သည် |
| `daemon` | Headless webhook daemon ကို စတင်သည် |
| `enterprise` | လိုင်စင်၊ Dashboard၊ Audit နှင့် အဖွဲ့အစည်း စီမံခန့်ခွဲမှု |
| `init [dir]` | `.mtc/` နှင့် Rules များပါဝင်သော Project အသစ်တစ်ခုကို စတင်သည် |
| `review` | Static code review ကို Run သည် |
| `llm status|set-provider|set-routing|classify|models` | LLM provider ပြင်ဆင်သတ်မှတ်မှု |
| `auth logout` | သိမ်းဆည်းထားသော Auth tokens များကို ရှင်းလင်းသည် |
| `session list|patches|revert` | Session နှင့် Patch စီမံခန့်ခွဲမှု |
| `plugin list|reload` | Plugin စီမံခန့်ခွဲမှု |
| `debug info` | Debug ပြုလုပ်ရန် အချက်အလက်များ |

---

## `src/ui/App.tsx`

**တည်နေရာ** - `src/ui/App.tsx`

ပင်မ Ink/React TUI Application ဖြစ်သည်။ Views၊ Overlays၊ Agent loop၊ ခွင့်ပြုချက်များနှင့် Telemetry များကို ထိန်းချုပ်ပေးသည်။

### ပြသသည့် မျက်နှာပြင်များ (Views)

| View | ရည်ရွယ်ချက် |
| --- | --- |
| `home` | Project အချက်အလက်များ ပါဝင်သော စတင်မျက်နှာပြင် |
| `chat` | ပင်မ Agent စကားပြောမျက်နှာပြင် |
| `diff` | ဖိုင် ပြင်ဆင်ချက်များ (File patch) ကို စစ်ဆေးသည့် မျက်နှာပြင် |
| `connect` | LLM provider ချိတ်ဆက်ရန် ဖောင် |

---

## `src/agents/`

**တည်နေရာ** - `src/agents/`

Agent စနစ်သည် Built-in/Custom agents များ၊ Rules များကို Load လုပ်ခြင်းနှင့် Subagent စီမံခန့်ခွဲခြင်းများကို လုပ်ဆောင်ပေးသည်။

### အဓိက ဖိုင်များ

* **`index.ts`** - Agent များကို စတင်ခြင်း၊ ပြောင်းလဲခြင်းနှင့် Rule များကို Load လုပ်ခြင်း
* **`builtin.ts`** - စနစ်ပါ သတ်မှတ်ချက်များ (Default, QA Tester, DevOps Engineer, Product Manager)
* **`custom.ts`** - `.mtc/agents/*.md` မှ စိတ်ကြိုက် Agent များကို Load လုပ်ပေးသည့် စနစ်
* **`subagent.ts`** - သီးခြား လုပ်ဆောင်ချက်များအတွက် Subagent စီမံခန့်ခွဲမှု
* **`agent-loop.ts`** - Tool execution နှင့် LLM calls များကို စီမံပေးသည့် ပင်မ Agent loop
* **`permissions.ts`** - ခွင့်ပြုချက် စစ်ဆေးရေး အင်ဂျင် (`read`, `bash`, `edit`, `execute`)

---

## `src/tools/`

**တည်နေရာ** - `src/tools/`

Tool registry တွင် Built-in tools ၁၂ ခုထက်မက ပါဝင်ပြီး Plugin များမှတစ်ဆင့် တိုးချဲ့ထားသော Tools များကိုလည်း ထောက်ပံ့ပေးသည်။

### Built-in Tools များ

| Tool | ဖော်ပြချက် | ခွင့်ပြုချက် အဆင့် |
| --- | --- | --- |
| `read_file` | ဖိုင်ပါ အကြောင်းအရာများကို ဖတ်သည် | `read` |
| `write_file` | ဖိုင်ထဲသို့ စာသားများ ရေးသွင်းသည် | `edit` |
| `edit_file` | Search/Replace ဖြင့် ဖိုင်ကို ပြင်ဆင်သည် | `edit` |
| `run_bash` | Shell commands များကို လုပ်ဆောင်စေသည် | `bash` |
| `glob_files` | Pattern အလိုက် ဖိုင်များကို ရှာဖွေသည် | `read` |
| `grep_files` | Regex ဖြင့် ဖိုင်အကြောင်းအရာများကို ရှာဖွေသည် | `read` |
| `websearch` | အင်တာနက်တွင် ရှာဖွေသည် | `read` |
| `task` | Subagent တစ်ခုကို စတင်အလုပ်လုပ်စေသည် | `read` |
| `apply_patch` | Unified diff patch တစ်ခုကို ပေါင်းထည့်သည် | `edit` |
| `git_diff` | Git diff ကို ပြသသည် | `read` |
| `git_commit` | အပြောင်းအလဲများကို Stage လုပ်ပြီး Commit ပြုလုပ်သည် | `bash` |
| `skill` | Skill တစ်ခုကို ဖွင့်လှစ်သည် | `read` |

---

## `src/llm/`

**တည်နေရာ** - `src/llm/`

LLM layer သည် Provider ချိတ်ဆက်မှု၊ အလုပ် အမျိုးအစားခွဲခြားမှု၊ လမ်းကြောင်းပေးမှုနှင့် Fallback စနစ်များကို ဆောင်ရွက်ပေးသည်။

### ထောက်ပံ့ပေးထားသော Providers များ

| Provider | Config ID |
| --- | --- |
| DeepSeek | `deepseek` |
| OpenAI | `openai` |
| Anthropic | `anthropic` |
| OpenRouter | `openrouter` |
| llama.cpp (local) | `llamacpp` |

### လမ်းကြောင်းပေးမှု ဆိုင်ရာ သဘောတရား (Routing Logic)

Router သည် ဝင်ရောက်လာသော မေးခွန်းများကို ခက်ခဲမှုအလိုက် ခွဲခြားလိုက်သည် -

* **Simple** - `simpleModel` သို့ လမ်းကြောင်းပေးသည် (မြန်ဆန်၍ ကုန်ကျစရိတ် သက်သာသည်)
* **Default** - `defaultModel` သို့ လမ်းကြောင်းပေးသည်
* **Reasoning** - `reasoningModel` သို့ လမ်းကြောင်းပေးသည် (စွမ်းဆောင်ရည် အမြင့်ဆုံး)

ပထမ ဦးစားပေး Provider အလုပ်မလုပ်ပါက Fallback chain မှ အခြား Provider များကို အစားထိုး ကြိုးပမ်းမည်ဖြစ်သည်။

---

## `src/mcp/`

**တည်နေရာ** - `src/mcp/`

Model Context Protocol (MCP) client သည် ပြင်ပ Tool servers များကို Load လုပ်ပြီး ၎င်းတို့၏ Tools များကို Local tool registry ထဲသို့ မှတ်ပုံတင် ပေါင်းစပ်ပေးသည်။

### MCP Server ရှာဖွေသည့် အစီအစဉ်

1. လက်ရှိ လုပ်ဆောင်နေသည့် Directory ထဲရှိ `.mtc/mcp.json`
2. တစ်ကမ္ဘာလုံးဆိုင်ရာ (Global) ဖြစ်သော `~/.config/mtc/mcp.json`
3. OpenCode Configuration ဖိုင်များ

---

## `src/session/`

**တည်နေရာ** - `src/session/`

စကားပြော မှတ်တမ်းများ၊ ဖိုင်ပြင်ဆင်ချက်များ၊ Token ပမာဏများနှင့် အလိုအလျောက် အနှစ်ချုပ်များအတွက် Session စီမံခန့်ခွဲမှု ဖြစ်သည်။

---

## `src/daemon/`

**တည်နေရာ** - `src/daemon/`

Headless webhook daemon သည် GitHub (နှင့် GitLab) webhooks များကို နားစွင့်နေပြီး Repositories များကို Clone လုပ်ခြင်း၊ LLM မှတစ်ဆင့် Bug ပြင်ဆင်ချက်များ ထုတ်လုပ်ခြင်းနှင့် Draft PR များကို ဖွင့်လှစ်ပေးခြင်းတို့ ပြုလုပ်သည်။

### Autofix လုပ်ငန်းစဉ် (Autofix Pipeline)

1. Webhook ကို လက်ခံရရှိသည် (ဥပမာ - `autofix` label ပါသော GitHub issue)
2. Repository ကို ယာယီ Directory ထဲသို့ Clone လုပ်သည်
3. Issue ကို LLM ဖြင့် လေ့လာသုံးသပ်သည်
4. Code ပြင်ဆင်ချက်ကို ထုတ်လုပ်သည်
5. Test များကို Run သည် (သတ်မှတ်ထားပါက)
6. ပြင်ဆင်ချက်ကို Commit လုပ်ပြီး Push လုပ်သည်
7. ပြင်ဆင်ချက်ဖြင့် Draft PR တစ်ခုကို ဖွင့်လှစ်လိုက်သည်

---

## `src/enterprise/`

**တည်နေရာ** - `src/enterprise/`

အဆင့်မြင့် လုပ်ဆောင်ချက်များ လိုအပ်သော အဖွဲ့အစည်းများအတွက် သီးသန့် Enterprise modules များဖြစ်သည်။

### Modules များ

| Module | ရည်ရွယ်ချက် |
| --- | --- |
| `license` | HMAC-SHA256 လိုင်စင်ကီး စစ်ဆေးခြင်းနှင့် သုံးစွဲခွင့် စစ်ဆေးမှု |
| `audit` | Audit log များ စုဆောင်းခြင်းနှင့် စေခိုင်းရှာဖွေခြင်း |
| `org` | အဖွဲ့အစည်း စီမံခန့်ခွဲမှု |
| `rbac` | အခန်းကဏ္ဍအလိုက် သုံးစွဲခွင့် ထိန်းချုပ်မှု (Role-based access control) |
| `notifications` | Slack/Teams webhook အကြောင်းကြားချက်များ |
| `dashboard` | Web control-plane dashboard |
| `analytics` | အသုံးပြုမှု သုံးသပ်ချက်များနှင့် ထုတ်ယူမှုများ |

---

## `src/server/`

**တည်နေရာ** - `src/server/`

WebSocket server (`mtc serve`) သည် VS Code နှင့် အခြား Editor clients များကို Agent နှင့် ချိတ်ဆက်နိုင်စေသည်။

---

## `src/shared-sessions/`

**တည်နေရာ** - `src/shared-sessions/`

ပူးတွဲသုံး Session အင်ဂျင်သည် အသုံးပြုသူ အများအပြား ချိတ်ဆက်မှု၊ ခွင့်ပြုချက်များ၊ ပဋိပက္ခ ဖြေရှင်းမှုများ၊ Offline အချိန်တွင် စင့်ခ်လုပ်မှုများနှင့် Event bus တို့ဖြင့် Real-time ပူးပေါင်းလုပ်ဆောင်နိုင်စွမ်းကို ပေးစွမ်းသည်။

---

## `src/config/`

**တည်နေရာ** - `src/config/`

Global နှင့် Project-local ဆက်တင်များအတွက် ပြင်ဆင်ချက်များကို Load လုပ်ခြင်းနှင့် ပေါင်းစပ်ခြင်း။

### ဆက်တင် တည်နေရာများ (Config Locations)

| အတိုင်းအတာ (Scope) | လမ်းကြောင်း (Path) | ရည်ရွယ်ချက် |
| --- | --- | --- |
| Global | `~/.config/mtc/config.json` | အသုံးပြုသူအဆင့် ဆက်တင်များ |
| Project | `.mtc/config.json` | Project အဆင့် သီးသန့် ပြင်ဆင်ချက်များ |

---

## အနှစ်ချုပ် - အစိတ်အပိုင်းများ ပေါင်းစပ် လုပ်ဆောင်ပုံ

```
src/cli.tsx
    └── Commander.js ဖြင့် အမိန့်ပေးချက်များကို စစ်ဆေးသည်
        │
        ├── default - Ink TUI ကို ဖန်တီးပေးသည် (src/ui/App.tsx)
        │       └── Agent loop, ခွင့်ပြုချက်များ, Overlays များကို ထိန်းချုပ်သည်
        │           ├── src/agents/ (Agent ရွေးချယ်မှု၊ Rules၊ Subagents)
        │           ├── src/tools/ (ခွင့်ပြုချက် စစ်ဆေးမှုများဖြင့် Tool ကို လုပ်ဆောင်ခြင်း)
        │           ├── src/llm/ (Provider လမ်းကြောင်းပေးမှု၊ တိုက်ရိုက် တုံ့ပြန်မှုများ)
        │           ├── src/mcp/ (ပြင်ပ Tool servers များ)
        │           ├── src/session/ (စကားပြော မှတ်တမ်း၊ ပြင်ဆင်ချက်များ)
        │           └── src/skills/ (စနစ်ပါ Skill catalog)
        │
        ├── mtc serve - WebSocket server ကို စတင်သည် (src/server/)
        ├── mtc daemon - Webhook server ကို စတင်သည် (src/daemon/)
        ├── mtc enterprise - လိုင်စင်၊ Dashboard၊ Audit (src/enterprise/)
        ├── mtc eval - Agent အခြေပြု ဆန်းစစ်ချက် (src/eval/)
        ├── mtc init - Project ပုံစံကြမ်း စတင်ခြင်း (src/init/)
        ├── mtc review - Static code review (src/review/)
        └── mtc llm - Provider ပြင်ဆင်သတ်မှတ်ခြင်း (src/llm/)

```