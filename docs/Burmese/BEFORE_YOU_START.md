# အစမတိုင်မှီ (Before You Start)

ကြိုဆိုပါတယ်။ ဤ Project သည် လုပ်ငန်းသုံးအဆင့်မြင့် Terminal အခြေပြု AI Coding Assistant တစ်ခုဖြစ်ပါတယ်။ သင်၏ OJT (On-the-Job Training) မပြီးဆုံးမီ AI Agent တစ်ခုသည် သင်၏ Codebase များကို မည်သို့ ဖတ်ရှုသည်၊ ခွင့်ပြုချက် စစ်ဆေးမှုများဖြင့် Tools များကို မည်သို့ အသုံးပြုသည်၊ LLMs များထံ သက်ဆိုင်ရာ လုပ်ဆောင်ချက်များကို မည်သို့ ခွဲဝေပေးပို့သည်၊ ထို့ပြင် Terminal မှနေ၍ သင့်နှင့်အတူ Real-time မည်သို့ ပူးပေါင်းလုပ်ဆောင်သည်တို့ကို နားလည်သဘောပေါက်လာမည် ဖြစ်သည်။

---

# Before You Start (အင်္ဂလိပ် အညွှန်း)

---

## Agentic Coding Assistant ဆိုသည်မှာ ဘာလဲ။

**Agentic coding assistant** ဆိုသည်မှာ သင်၏ Development Environment (ရေးသားဆောက်လုပ်ရေး ပတ်ဝန်းကျင်) နှင့် ကိုယ်ပိုင်ဆုံးဖြတ်ချက်ဖြင့် ပူးပေါင်းလုပ်ဆောင်နိုင်သော AI စနစ်တစ်ခု ဖြစ်သည်။ မေးခွန်းများကို ဖြေဆိုရုံမျှမက အောက်ပါတို့ကိုပါ လုပ်ဆောင်နိုင်သည် -

1. Project ထဲရှိ **ဖိုင်များကို ဖတ်ရှုခြင်းနှင့် ပြင်ဆင်ခြင်း**
2. Build၊ Test သို့မဟုတ် Git လုပ်ဆောင်ချက်များကို စတင်ရန် **Bash commands များကို Run ခြင်း**
3. Glob နှင့် Grep တို့ကို အသုံးပြု၍ **Codebase ထဲတွင် ရှာဖွေခြင်း**
4. Model Context Protocol (MCP) မှတစ်ဆင့် **ပြင်ပ Tools များကို အသုံးပြုခြင်း**
5. စကားပြော မှတ်တမ်းများနှင့် Session Summaries များကို အသုံးပြု၍ ပြောဆိုခဲ့ဖူးသမျှ **အကြောင်းအရာများ (Context) ကို အမှတ်ရနေခြင်း**

---

## ဤ Project က မည်သည်တို့ကို လုပ်ဆောင်ပေးသနည်း

MetaTeam Code Agent (`mtc`) သည် Ink (CLIs များအတွက် React) ဖြင့် တည်ဆောက်ထားသော Interactive Terminal UI (TUI) အဖြစ် အလုပ်လုပ်သည်။ ၎င်းသည် အင်ဂျင်နီယာများကို အောက်ပါတို့ ပြုလုပ်နိုင်စေသည် -

* LLM Provider အများအပြား (DeepSeek, OpenAI, Anthropic, OpenRouter, local llama.cpp) နှင့် စကားပြောဆိုနိုင်ခြင်း
* စနစ်တွင် ပါပြီးသား သို့မဟုတ် စိတ်ကြိုက်ပြင်ဆင်ထားသော Agents များအကြား ပြောင်းလဲအသုံးပြုနိုင်ခြင်း (ဥပမာ - QA Tester, DevOps Engineer, Product Manager)
* Agent တစ်ခုစီအလိုက် သီးခြား ခွင့်ပြုချက်များပါရှိသော စနစ်ပါ Built-in Tools ၁၂ ခုထက်မကကို အသုံးပြုနိုင်ခြင်း
* Bugs များကို အလိုအလျောက် ပြင်ဆင်ပေးပြီး Draft PR များကို ဖွင့်ပေးသည့် Headless Webhook Daemons များကို Run နိုင်ခြင်း
* မျှဝေထားသော Sessions များမှတစ်ဆင့် Real-time ပူးပေါင်းလုပ်ဆောင်နိုင်ခြင်း
* MCP Servers များနှင့် Custom Plugins များဖြင့် လုပ်ဆောင်ချက်များကို တိုးချဲ့နိုင်ခြင်း

---

## အဓိက ပါဝင်သော အစိတ်အပိုင်းများ (The Core Components)

| အစိတ်အပိုင်း (Component) | ရည်ရွယ်ချက် (Purpose) | အဓိက နည်းပညာ (Key Technology) |
| --- | --- | --- |
| **CLI Layer** | Commands များကို စစ်ဆေးဖတ်ရှုပြီး TUI သို့မဟုတ် Headless modes များသို့ ပေးပို့သည် | Commander.js |
| **TUI Layer** | Agent loop၊ ခွင့်ပြုချက်များနှင့် Overlays များပါဝင်သော Interactive Terminal UI | Ink + React 19 |
| **Agent Layer** | Built-in/Custom agents များ၊ Rules များ၊ Subagents များနှင့် ခွင့်ပြုချက်များကို ထိန်းချုပ်သည် | TypeScript classes |
| **Tool Layer** | Built-in tools ၁၂ ခုထက်မက (File, Bash, Websearch, Git, စသည်) + Plugin hooks | Zod validation |
| **LLM Layer** | Provider ချိတ်ဆက်မှု၊ အလုပ် အမျိုးအစားခွဲခြားမှု၊ လမ်းကြောင်းပေးမှုနှင့် Fallback စနစ် | OpenAI-compatible API |
| **MCP Layer** | Model Context Protocol servers များမှ ပြင်ပ Tools များကို Load လုပ်သည် | stdio/HTTP MCP clients |
| **Session Layer** | စကားပြော မှတ်တမ်း၊ ဖိုင်ပြင်ဆင်ချက်များ၊ Token ပမာဏ၊ အနှစ်ချုပ်များ | SQLite |
| **Daemon Layer** | Autofix pipeline ပါရှိသော Headless Webhook Server | Bun.serve + GitHub/GitLab |
| **Enterprise Layer** | Licensing, SSO, RBAC, Audit logs, အဖွဲ့အစည်း စီမံခန့်ခွဲမှု၊ Dashboard | Proprietary modules |
| **Server Layer** | VS Code Extension ချိတ်ဆက်ရန်အတွက် WebSocket Server | Bun WebSocket |

---

## အသုံးပြုထားသော နည်းပညာများ (Tech Stack)

| အလွှာ (Layer) | နည်းပညာ (Technology) |
| --- | --- |
| Runtime | Bun 1.2+ |
| Language | TypeScript 7 (strict mode, ESNext, React JSX) |
| TUI Framework | Ink 7 + React 19 + @inkjs/ui |
| CLI Framework | Commander.js 15 |
| Validation | Zod 3 |
| State / Sessions | SQLite |
| Editor Integration | VS Code extension (WebSocket) |
| CI/CD | GitHub Actions |

---

## ကြိုတင် လိုအပ်ချက်များ (Prerequisites)

မစတင်မီ သင်၌ အောက်ပါတို့ ရှိမရှိ သေချာပါစေ -

* **Bun** v1.2 သို့မဟုတ် နောက်ပိုင်းထွက် Version ([https://bun.sh](https://bun.sh))
* **Git**
* **Node.js** 18+ (VS Code extension အတွက်)
* Code Editor တစ်ခု (VS Code ကို အကြံပြုပါသည်)
* TypeScript, REST APIs နှင့် Terminal Commands များကို အခြေခံ နားလည်ထားရှိမှု

---

## လျင်မြန်စွာ စတင်တပ်ဆင်ခြင်း (Quick Setup)

### ၁။ CLI ကို တပ်ဆင်ပါ

```bash
npm install -g @metateam/cli
mtc --version

```

သို့မဟုတ် Source Code မှ တည်ဆောက်ပါ -

```bash
git clone git@github.com:mtm-LazumLyntonTawngYung/metateam-code-agent.git
cd metateam-code-agent
bun install
bun run build

```

### ၂။ TUI ကို စတင်ပါ

```bash
mtc

```

### ၃။ LLM Provider ကို ပြင်ဆင်သတ်မှတ်ပါ

```bash
mtc llm status
mtc llm set-provider --id deepseek --key sk-...
mtc llm set-routing --simple deepseek-chat --default deepseek-chat --reasoning claude-sonnet-4-20250514

```

### ၄။ အလုပ်လုပ်ပုံကို စစ်ဆေးပါ

1. `mtc` ကို Run ပြီး TUI ပွင့်လာသည်ကို စစ်ဆေးပါ။
2. Agent များကို ပြောင်းလဲအသုံးပြု၍ ရမရ စစ်ဆေးရန် `Tab` ကို နှိပ်ပါ။
3. Command Palette ပွင့်မပွင့် စစ်ဆေးရန် `Ctrl+P` ကို နှိပ်ပါ။
4. ရိုးရှင်းသော မေးခွန်းတစ်ခုကို ရိုက်ထည့်ပြီး စာလုံးများ ဆက်တိုက် တုံ့ပြန်ထွက်ပေါ်လာခြင်း ရှိမရှိ စစ်ဆေးပါ။
5. သင်၏ Provider ပြင်ဆင်ပြီးမပြီး စစ်ဆေးရန် `mtc llm status` ကို Run ပါ။