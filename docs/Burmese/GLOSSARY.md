# Glossary (မြန်မာ)

MetaTeam Code Agent နှင့် သက်ဆိုင်သော ဝေါဟာရများအတွက် အလွယ်တကူ ကိုးကားကြည့်ရှုနိုင်သည့် အဓိပ္ပာယ်ဖွင့်ဆိုချက်များ ဖြစ်သည်။

---

# Glossary (အင်္ဂလိပ် အညွှန်း)

---

## A

**Agent**
မိမိဝန်းကျင်ကို သိမြင်နိုင်ခြင်း၊ ဆုံးဖြတ်ချက်များ ချမှတ်နိုင်ခြင်းနှင့် အရေးယူဆောင်ရွက်မှုများ ပြုလုပ်နိုင်ခြင်းတို့ရှိသော အလိုအလျောက် စနစ်တစ်ခု ဖြစ်သည်။ MetaTeam Code Agent တွင် Agents များ၌ ၎င်းတို့၏ ပြုမူဆောင်ရွက်ပုံများကို သတ်မှတ်ပေးသည့် System Prompts နှင့် Tool Permissions များ ပါရှိသည်။

**Agent Loop**
အေးဂျင့်ကို မောင်းနှင်ပေးသော ပင်မ သံသရာစက်ဝန်း ဖြစ်သည် - အသုံးပြုသူ၏ Input ကို လက်ခံခြင်း → Tools များ ရွေးချယ်ခြင်း → ခွင့်ပြုချက် စစ်ဆေးမှုများဖြင့် အကောင်အထည်ဖော်ခြင်း → LLM ကို ခေါ်ယူခြင်း → တုံ့ပြန်ချက်ကို တိုက်ရိုက်ထုတ်လွှင့်ခြင်း (Stream) → မူလအတိုင်း ထပ်မံပြုလုပ်ခြင်း။

**Alpha (Hybrid Alpha)**
Hybrid search တွင် တွက်ချက်အသုံးပြုသော အလေးချိန်သတ်မှတ်ချက် ကိန်းရှင် ဖြစ်သည်။ `combined_score = alpha * dense_score + (1 - alpha) * sparse_score`။

**Anthropic**
MetaTeam Code Agent မှ ထောက်ပံ့ပေးထားသော LLM Provider တစ်ခု ဖြစ်သည် (Claude models များ)။

**API Endpoint**
HTTP Requests များကို လက်ခံပြီး တုံ့ပြန်ချက်များ ပြန်လည်ပေးပို့သည့် သီးသန့် URL လမ်းကြောင်းတစ်ခု ဖြစ်သည်။

**Async / Await**
အချိန်ကိုက် မဟုတ်သော (Asynchronous) Code များကို ရေးသားရန်အတွက် အသုံးပြုသည့် TypeScript/JavaScript သော့ချက်စာလုံးများ ဖြစ်သည်။

---

## B

**Background Task**
ပင်မ တုံ့ပြန်ချက်ကို ပေးပို့ပြီးနောက်မှ နောက်ကွယ်တွင် ဆက်လက် အလုပ်လုပ်ဆောင်သည့် Code ဖြစ်သည်။

**Batch Embedding**
Model တစ်ကြိမ် ခေါ်ယူမှုအတွင်း စာသား အမြောက်အမြားအတွက် Embeddings များကို တစ်ပြိုင်နက်တည်း ထုတ်လုပ်ပေးခြင်း ဖြစ်သည်။

**Bi-encoder**
Query နှင့် Document များကို သီးခြားစီ သီးသန့် အဓိပ္ပာယ်ဖော်ဆောင်ပေးသည့် Embedding Model တစ်ခု ဖြစ်သည်။

**BM25**
Best Match 25။ သော့ချက်စာလုံး (Keyword) အခြေပြု ရှာဖွေမှုများအတွက် အသုံးပြုသည့် ဖြစ်နိုင်ခြေအလိုက် အဆင့်သတ်မှတ်ပေးသော လုပ်ဆောင်ချက် ဖြစ်သည်။

**Bun**
မြန်ဆန်သော JavaScript Runtime နှင့် Package Manager တစ်ခု ဖြစ်သည်။ MetaTeam Code Agent အတွက် မဖြစ်မနေ လိုအပ်သည်။

---

## C

**Chunk**
ကြီးမားသော စာရွက်စာတမ်းတစ်ခုမှ ထုတ်ယူထားသော စာသားအပိုင်းအစ တစ်ခု ဖြစ်သည်။

**Citation**
LLM ၏ အဖြေတွင် ထည့်သွင်းထားသော မူရင်း အချက်အလက် စာရွက်စာတမ်း၏ ကိုးကားချက် ဖြစ်သည်။

**Commander.js**
MetaTeam Code Agent မှ အသုံးပြုထားသော Node.js CLI Framework တစ်ခု ဖြစ်သည်။

**Context**
LLM မှ ခိုင်မာသော အဖြေများ ထုတ်ပေးနိုင်ရန် အထောက်အကူပြု ပေးအပ်ထားသည့် သတင်းအချက်အလက်များ ဖြစ်သည်။

**Context Window**
LLM တစ်ခုမှ Request တစ်ခုတည်းတွင် ပြုပြင်ဆောင်ရွက်နိုင်သည့် အများဆုံး Tokens ပမာဏ ဖြစ်သည်။

**Cosine Similarity**
Vectors နှစ်ခုကြားရှိ တူညီမှုကို တိုင်းတာသည့် စံနှုန်းတစ်ခု ဖြစ်သည်။

**Cross-encoder**
(Query, Document) တွဲတစ်ခုကို လက်ခံပြီး အကြောင်းအရာ ဆက်စပ်မှုရမှတ် (Relevance score) ကို ထုတ်ပေးသည့် Model တစ်ခု ဖြစ်သည်။

**CRDT**
Conflict-free Replicated Data Type။ ပဋိပက္ခမရှိဘဲ ပူးပေါင်းပြင်ဆင် ရေးသားနိုင်ရန်အတွက် မျှဝေထားသော Sessions များတွင် အသုံးပြုသည်။

---

## D

**Daemon**
TUI မပါဘဲ နောက်ကွယ်တွင် သီးသန့် အလုပ်လုပ်ဆောင်နေသည့် အစီအစဉ် (Process) တစ်ခု ဖြစ်သည်။

**DeepSeek**
MetaTeam Code Agent မှ ထောက်ပံ့ပေးထားသော LLM Provider တစ်ခု ဖြစ်သည်။

**Dense Retrieval**
Vector embeddings နှင့် တူညီမှု ရှာဖွေခြင်း (Similarity search) တို့ကို အသုံးပြု၍ သတင်းအချက်အလက် ရှာဖွေယူခြင်း ဖြစ်သည်။

**Docker**
တပ်ဆင်အသုံးပြုခြင်းအတွက် အသုံးပြုသည့် Containerization Platform ဖြစ်သည်။

**Dot Product**
Vectors နှစ်ခု၏ အစိတ်အပိုင်းတစ်ခုစီကို မြှောက်၍ ရရှိလာသော ရလဒ်များ၏ စုစုပေါင်း ပေါင်းလဒ် ဖြစ်သည်။

---

## E

**Embedding**
စာသား၏ သဘောတရားရေးရာ အဓိပ္ပာယ်ကို ပုံဖော်ပေးထားသော စာသား၏ Vector ကိုယ်စားပြုမှု ဖြစ်သည်။

**Embedding Model**
စာသားများကို Embeddings အဖြစ် ပြောင်းလဲပေးသည့် Neural Network ဖြစ်သည်။

**Enterprise Edition**
SSO, RBAC, Audit logs, Org management နှင့် Web dashboard များ ပါဝင်သော မူပိုင် စီးပွားရေးအဆင့် အဆင့် ဖြစ်သည်။

**Environment Variable**
Application ၏ ပြင်ပတွင် သတ်မှတ်ထားသော ပြင်ဆင်ချက် တန်ဖိုးတစ်ခု ဖြစ်သည်။

**Evaluation**
တိုင်းတာမှု စံနှုန်းများကို အသုံးပြု၍ အေးဂျင့် သို့မဟုတ် RAG စနစ်၏ စွမ်းဆောင်ရည်ကို တိုင်းတာခြင်း ဖြစ်သည်။

---

## F

**FAISS**
Facebook AI Similarity Search။ အစားထိုး အသုံးပြုနိုင်သော Vector Database တစ်ခု ဖြစ်သည်။

**Fallback Chain**
ပင်မ Provider အလုပ်မလုပ်တော့သည့်အခါ အစားထိုး စမ်းသပ်အသုံးပြုမည့် အခြား Provider များ၏ အစီအစဉ် ဖြစ်သည်။

**FastAPI**
Backend APIs များအတွက် အသုံးပြုသော Python Web Framework တစ်ခု ဖြစ်သည်။

**Fetch-k**
မွမ်းမံအဆင့်သတ်မှတ်ခြင်း (Reranking) မပြုလုပ်မီ ရှာဖွေဖတ်ရှုထားသော လျာထားချက် ပမာဏ ဖြစ်သည်။

**Frontmatter**
Markdown ဖိုင်များ၏ ထိပ်ဆုံးတွင် ပါရှိသော YAML Metadata ဖြစ်သည်။

---

## G

**Generation**
ရှာဖွေရရှိထားသော Context သို့မဟုတ် Tools များအပေါ် အခြေခံ၍ LLM မှ အဖြေတစ်ခု ထုတ်လုပ်ပေးသည့် အဆင့် ဖြစ်သည်။

**GitHub Actions**
MetaTeam Code Agent ကို စမ်းသပ်ခြင်း၊ တည်ဆောက်ခြင်းနှင့် ထုတ်လုပ်ခြင်းတို့အတွက် အသုံးပြုသည့် CI/CD Platform ဖြစ်သည်။

**Grounding**
LLM ၏ အဖြေများသည် ရှာဖွေရရှိထားသော စာရွက်စာတမ်းများ သို့မဟုတ် Tool ရလဒ်များပေါ်တွင် သေချာစွာ အခြေခံထားကြောင်း စိစစ်သည့် အလေ့အကျင့် ဖြစ်သည်။

---

## H

**HNSW**
Hierarchical Navigable Small World။ Vector databases များမှ အသုံးပြုသော Indexing Algorithm ဖြစ်သည်။

**Hybrid Search**
Dense (Vector) နှင့် Sparse (Keyword) နည်းလမ်းနှစ်ခုစလုံးကို ပေါင်းစပ်အသုံးပြုထားသော ရှာဖွေမှုစနစ် ဖြစ်သည်။

---

## I

**Ingestion**
စနစ်တစ်ခုအတွင်းသို့ စာရွက်စာတမ်းများ ထည့်သွင်းပေးသည့် လုပ်ငန်းစဉ် ဖြစ်သည်။

**Ink**
Terminal User Interfaces များ တည်ဆောက်ရန်အတွက် အသုံးပြုသည့် React Renderer တစ်ခု ဖြစ်သည်။

**In-prompt Learning**
LLM ကို သီးသန့် မွမ်းမံသင်ကြားခြင်း (Fine-tuning) မပြုလုပ်ဘဲ Prompt မှတစ်ဆင့် သတင်းအချက်အလက်များ ပေးအပ်ခြင်း ဖြစ်သည်။

---

## J

**JSON**
JavaScript Object Notation။ API Request နှင့် Response Bodies များအတွက် အသုံးပြုသည့် Format ဖြစ်သည်။

---

## K

**Keyword Search**
စာသားအတွင်းရှိ တိကျသော စကားလုံးများ သို့မဟုတ် စာကြောင်းများကို တိုက်ရိုက် ရှာဖွေသည့် စနစ် ဖြစ်သည်။

---

## L

**LLM**
Large Language Model။ အဖြေများ ထုတ်လုပ်ပေးသည့် သို့မဟုတ် အေးဂျင့်ကို မောင်းနှင်ပေးသည့် Generative AI Model ဖြစ်သည်။

**LLaMA.cpp**
LLM ကို စက်တွင်း (Locally) Run ရန် အသုံးပြုသည့် Tool တစ်ခု ဖြစ်သည်။

**Local LLM**
မိမိ၏ စက်ပေါ်တွင် သီးသန့် Run ထားသော LLM ဖြစ်သည်။

---

## M

**Markdown (MD)**
ပေါ့ပါးသော အမှတ်အသားပြု Format တစ်ခု ဖြစ်သည်။ အေးဂျင့် သတ်မှတ်ချက်များ၊ Skills နှင့် Rules များတွင် အသုံးပြုသည်။

**Max Tokens**
LLM မှ တုံ့ပြန်ချက် တစ်ခုတည်းတွင် ထုတ်လုပ်ပေးနိုင်သည့် အများဆုံး Tokens ပမာဏ ဖြစ်သည်။

**MCP (Model Context Protocol)**
LLMs များကို ပြင်ပ Tools များ၊ Data sources များနှင့် ချိတ်ဆက်ပေးသည့် ပွင့်လင်း စံနှုန်း protocols ဖြစ်သည်။

**Metadata**
Chunk သို့မဟုတ် စာရွက်စာတမ်းတစ်ခုနှင့် တွဲဆက်ထားသည့် စနစ်တကျ အချက်အလက်များ ဖြစ်သည်။

**Model Context Protocol**
MCP ကို ကြည့်ပါ။

**Multi-modal**
Input/Output အမျိုးအစား အများအပြားကို (စာသား၊ ရုပ်ပုံ၊ အသံ) ထောက်ပံ့ပေးနိုင်မှု ဖြစ်သည်။

---

## O

**OCR**
Optical Character Recognition။ ရုပ်ပုံများထဲမှ စာသားများကို ထုတ်ယူရန် အသုံးပြုသည်။

**OpenAI**
MetaTeam Code Agent မှ ထောက်ပံ့ပေးထားသော LLM Provider တစ်ခု ဖြစ်သည်။

**OpenRouter**
LLM အများအပြားကို စုစည်းပေးထားသော Provider တစ်ခု ဖြစ်သည်။

---

## P

**PDF**
Portable Document Format။

**Permission**
အေးဂျင့်တစ်ခု အသုံးပြုနိုင်သည့် Tools များကို ကန့်သတ်ပေးသော ထိန်းချုပ်မှု ဖြစ်သည်။ အဆင့်များ - `allow`, `ask`, `deny`။

**Plugin**
MetaTeam Code Agent ကို စိတ်ကြိုက် Tools များ၊ Hooks သို့မဟုတ် Commands များဖြင့် တိုးချဲ့ပေးသည့် Module တစ်ခု ဖြစ်သည်။

**PostgreSQL**
Metadata နှင့် မှတ်တမ်းများအတွက် အသုံးပြုသည့် Relational Database ဖြစ်သည်။

**Precision**
ရှာဖွေရရှိထားသော Chunks များထဲမှ ဆက်စပ်မှုရှိသော ပမာဏ အချိုးအစား ဖြစ်သည်။

**Prompt**
LLM ထံ ပေးပို့လိုက်သော စာသား Input ဖြစ်သည်။

**Prompt Engineering**
LLM ထံမှ လိုလားသော ပြုမူဆောင်ရွက်ချက်များ ရရှိရန် Prompts များကို စနစ်တကျ ရေးဆွဲသည့် အလေ့အကျင့် ဖြစ်သည်။

**Provider**
LLM ဝန်ဆောင်မှုတစ်ခု ဖြစ်သည် (ဥပမာ - OpenAI, DeepSeek, Anthropic)။

**Pydantic**
Python အချက်အလက် စစ်ဆေးအတည်ပြုသည့် Library တစ်ခု ဖြစ်သည်။

---

## Q

**Qdrant**
Open-source Vector Database တစ်ခု ဖြစ်သည်။

**Query**
အေးဂျင့်ထံ ပေးပို့လိုက်သော အသုံးပြုသူ၏ မေးခွန်း သို့မဟုတ် တောင်းဆိုချက် ဖြစ်သည်။

---

## R

**RAG**
Retrieval-Augmented Generation။ စာရွက်စာတမ်း ရှာဖွေမှုနှင့် LLM ထုတ်လုပ်မှုတို့ကို ပေါင်းစပ်ထားသော နည်းပညာတစ်ခု ဖြစ်သည်။

**RAGAS**
RAG စနစ်များကို အကဲဖြတ်ရန်အတွက် Framework တစ်ခု ဖြစ်သည်။

**RAG Pipeline**
အဆင့်ဆင့် စီးဆင်းမှု - Ingest, Embed, Store, Retrieve, Rerank, Generate။

**Re-ranking**
ပိုမိုတိကျသော Model ကို အသုံးပြု၍ ရှာဖွေရရှိထားသော လျာထားချက်များကို ရမှတ်များ ပြန်လည်သတ်မှတ်ခြင်း ဖြစ်သည်။

**Recall**
ဆက်စပ်မှုရှိသော Chunks အားလုံးထဲမှ ရှာဖွေဖတ်ရှုရရှိခဲ့သည့် အချိုးအစား ဖြစ်သည်။

**Recursive Chunking**
စာသားများကို သဘာဝကျသော အပိုင်းအစများအဖြစ် အဆင့်ဆင့် ခွဲခြမ်းစိတ်ဖြာသည့် Chunking နည်းဗျူဟာ ဖြစ်သည်။

**Reranker**
ရှာဖွေရရှိထားသော လျာထားချက်များကို ရမှတ်များ ပြန်လည်သတ်မှတ်ပေးသည့် Model သို့မဟုတ် Function ဖြစ်သည်။

**Retrieval**
Query တစ်ခုအတွက် ဆက်စပ်မှုရှိသော Chunks များကို ရှာဖွေပေးသည့် လုပ်ငန်းစဉ် ဖြစ်သည်။

**REST API**
Representational State Transfer API။

---

## S

**Scoring**
ပေးထားသော Query တစ်ခုအတွက် Chunk တစ်ခုသို့ ကိန်းဂဏန်းအလိုက် ဆက်စပ်မှု တန်ဖိုး သတ်မှတ်ပေးခြင်း ဖြစ်သည်။

**Secret Redaction**
Logs များ နှင့် Output များထဲရှိ အရေးကြီးသော တန်ဖိုးများကို ဖုံးကွယ်ပေးသည့် လုပ်ငန်းစဉ် ဖြစ်သည်။

**Semantic Search**
တိကျသော စကားလုံး တူညီရုံမျှမက စကားလုံးများ၏ အဓိပ္ပာယ်ကိုပါ နားလည်သော ရှာဖွေမှုစနစ် ဖြစ်သည်။

**SentenceTransformer**
Sentence Embeddings များ ထုတ်လုပ်ရန်အတွက် အသုံးပြုသော Python Library တစ်ခု ဖြစ်သည်။

**Server-Sent Events (SSE)**
HTTP မှတစ်ဆင့် Server မှ Client ထံသို့ စာသား အချက်အလက်များကို တိုက်ရိုက် ထုတ်လွှင့်ပေးသည့် Protocol တစ်ခု ဖြစ်သည်။

**Session**
`session_id` ဖြင့် ခွဲခြားထားသော စကားပြောဆိုမှု Session တစ်ခု ဖြစ်သည်။

**Skill**
ပြန်လည်အသုံးပြုနိုင်သော ညွှန်ကြားချက်များနှင့် ပြုမူဆောင်ရွက်ချက်များ စုစည်းမှု ဖြစ်သည်။

**Source Citation**
အဖြေတစ်ခု ထုတ်လုပ်ရန် အသုံးပြုခဲ့သော မူရင်း စာရွက်စာတမ်း သို့မဟုတ် Tool ရလဒ်အား ကိုးကားညွှန်းဆိုချက် ဖြစ်သည်။

**Sparse Retrieval**
သော့ချက်စာလုံး တိုက်ဆိုင်မှုဖြင့် ရှာဖွေသည့် စနစ် ဖြစ်သည်။

**SQLAlchemy**
Python SQL Toolkit နှင့် ORM တစ်ခု ဖြစ်သည်။

**SSE**
Server-Sent Events ကို ကြည့်ပါ။

**Streaming**
LLM တုံ့ပြန်ချက်ကို ထုတ်လုပ်ပေးနေစဉ်အတွင်း အပိုင်းလိုက် အချိန်နှင့်အမျှ ပေးပို့ခြင်း ဖြစ်သည်။

**Subagent**
ပင်မ Agent မှ ခွဲထွက်ဖန်တီးလိုက်သော သီးသန့် အထူးပြု Agent တစ်ခု ဖြစ်သည်။

**System Prompt**
LLM ထံ ပထမဦးစွာ ပေးအပ်ထားသည့် မူလ ညွှန်ကြားချက် ဖြစ်သည်။

---

## T

**Tailwind CSS**
Utility-first CSS Framework တစ်ခု ဖြစ်သည်။

**Temperature**
LLM ၏ ကျိန်းသေမှုမရှိဘဲ ရွေးချယ်နိုင်စွမ်း (Randomness) ကို ထိန်းချုပ်ပေးသည့် သတ်မှတ်ချက် ကိန်းရှင် ဖြစ်သည်။

**Terminal UI (TUI)**
Terminal အတွင်း Run သော စာသားအခြေပြု အသုံးပြုသူ စနစ် ဖြစ်သည်။

**Token**
LLM မှ ပြုပြင်ဆောင်ရွက်သည့် စာသား၏ အခြေခံ အစိတ်အပိုင်း ဖြစ်သည်။

**Tool**
အေးဂျင့်မှ ပြင်ပကမ္ဘာနှင့် ဓာတ်ပြုလုပ်ဆောင်နိုင်ရန် ခေါ်ယူနိုင်သော Function တစ်ခု ဖြစ်သည်။

**Top-k**
ရှာဖွေပြီးနောက် ပြန်လည်ပေးပို့ရမည့် ရမှတ် အမြင့်ဆုံး ရလဒ်များ၏ ပမာဏ ဖြစ်သည်။

**TypeScript**
အမျိုးအစား သတ်မှတ်ချက်များ ပါဝင်သော JavaScript ၏ အဆင့်မြင့် စနစ် ဖြစ်သည်။

---

## U

**UUID**
Universally Unique Identifier။

---

## V

**Vector**
စာသား၏ အဓိပ္ပာယ် သဘောတရားများကို ပုံဖော်ထားသော ကိန်းဂဏန်း စာရင်း ဖြစ်သည်။

**Vector Database**
Dimensions မြင့်မားသော Vectors များကို သိမ်းဆည်းရန်နှင့် ရှာဖွေရန် သီးသန့် ပိုမိုကောင်းမွန်အောင် ပြုလုပ်ထားသော Database ဖြစ်သည်။

**Vector Search**
အကွာအဝေး တိုင်းတာမှုများကို အသုံးပြု၍ ဆင်တူသော Vectors များကို ရှာဖွေခြင်း ဖြစ်သည်။

**VS Code Extension**
MetaTeam Code Agent နှင့် ချိတ်ဆက်ပေးသည့် Visual Studio Code အတွက် Plugin တစ်ခု ဖြစ်သည်။

---

## W

**Webhook**
ဖြစ်ရပ်တစ်ခုခုကြောင့် စတင်အလုပ်လုပ်သော HTTP Callback တစ်ခု ဖြစ်သည်။

**WebSocket**
နှစ်ဦးနှစ်ဖက် တိုက်ရိုက် ဆက်သွယ်နိုင်သော (Full-duplex) ဆက်သွယ်ရေး Protocol တစ်ခု ဖြစ်သည်။

**Weaviate**
Open-source Vector Database တစ်ခု ဖြစ်သည်။

---

## Z

**Zod**
TypeScript အခြေပြု Schema စစ်ဆေးအတည်ပြုသည့် Library တစ်ခု ဖြစ်သည်။

**Zero-shot**
LLM တစ်ခုမှ သီးသန့် လေ့ကျင့်ပေးထားခြင်း မရှိဘဲ လုပ်ဆောင်ချက်တစ်ခုကို ဆောင်ရွက်နိုင်စွမ်း ဖြစ်သည်။

---

## အတိုကောက် စကားလုံးများ အလွယ်တကူ ကိုးကားချက် (Acronyms Quick Reference)

| အတိုကောက် စကားလုံး | အပြည့်အစုံ |
| --- | --- |
| API | Application Programming Interface |
| BM25 | Best Match 25 |
| CLI | Command Line Interface |
| CPU | Central Processing Unit |
| CRDT | Conflict-free Replicated Data Type |
| CRUD | Create, Read, Update, Delete |
| FK | Foreign Key |
| GPU | Graphics Processing Unit |
| HNSW | Hierarchical Navigable Small World |
| HTTP | Hypertext Transfer Protocol |
| JSON | JavaScript Object Notation |
| LLM | Large Language Model |
| MCP | Model Context Protocol |
| MD | Markdown |
| OCR | Optical Character Recognition |
| ORM | Object-Relational Mapping |
| PDF | Portable Document Format |
| PG | PostgreSQL |
| PK | Primary Key |
| RAG | Retrieval-Augmented Generation |
| REST | Representational State Transfer |
| SSE | Server-Sent Events |
| SQL | Structured Query Language |
| TUI | Terminal User Interface |
| TXT | Text |
| UUID | Universally Unique Identifier |
| UX | User Experience |
| VS Code | Visual Studio Code |