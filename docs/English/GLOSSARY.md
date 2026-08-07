# Glossary

Quick-reference definitions for MetaTeam Code Agent and related terminology.

---

## A

**Agent**
An autonomous system that can perceive its environment, make decisions, and take actions. In MetaTeam Code Agent, agents have system prompts and tool permissions that define their behavior.

**Agent Loop**
The core cycle that drives the agent: receive user input → select tools → execute with permission checks → call LLM → stream response → repeat.

**Alpha (Hybrid Alpha)**
The weighting parameter in hybrid search. `combined_score = alpha * dense_score + (1 - alpha) * sparse_score`. Higher alpha favors semantic similarity; lower alpha favors keyword matching.

**Anthropic**
An LLM provider supported by MetaTeam Code Agent (Claude models).

**API Endpoint**
A specific URL path that accepts HTTP requests and returns responses. Example: `POST /api/chat` in a backend API.

**Async / Await**
TypeScript/JavaScript keywords for writing asynchronous code that can handle multiple operations concurrently without blocking.

---

## B

**Background Task**
Code that runs after the primary response is sent. In FastAPI, used for slow operations like document processing.

**Batch Embedding**
Generating embeddings for multiple texts in a single model call. Faster than one-at-a-time generation.

**Bi-encoder**
An embedding model that encodes query and document independently. SentenceTransformer is a bi-encoder. Faster but less accurate than cross-encoders for ranking.

**BM25**
Best Match 25. A probabilistic ranking function for keyword-based (sparse) retrieval.

**Bun**
A fast JavaScript runtime and package manager. Required for MetaTeam Code Agent.

---

## C

**Chunk**
A segment of text extracted from a larger document. Chunks are the unit of storage and retrieval in RAG.

**Citation**
A reference to a source document included in the LLM's answer.

**Commander.js**
A Node.js CLI framework used by MetaTeam Code Agent to define commands and parse arguments.

**Context**
The information provided to the LLM to ground its answer. In RAG, this is the retrieved chunks.

**Context Window**
The maximum number of tokens an LLM can process in a single request.

**Cosine Similarity**
A measure of similarity between two vectors, computed as the dot product of normalized vectors. Values range from -1 (opposite) to 1 (identical).

**Cross-encoder**
A model that takes a (query, document) pair and outputs a relevance score. Unlike bi-encoders, cross-encoders see both inputs simultaneously.

**CRDT**
Conflict-free Replicated Data Type. Used in shared sessions for conflict-free collaborative editing.

---

## D

**Daemon**
A headless process that runs without a TUI. MetaTeam Code Agent's daemon listens for webhooks and runs the autofix pipeline.

**DeepSeek**
An LLM provider supported by MetaTeam Code Agent.

**Dense Retrieval**
Retrieval using vector embeddings and similarity search. Captures semantic meaning rather than exact keyword matches.

**Docker**
Containerization platform used for deployment.

**Dot Product**
The sum of element-wise products of two vectors. For normalized vectors, dot product equals cosine similarity.

---

## E

**Embedding**
A vector representation of text that captures semantic meaning.

**Embedding Model**
The neural network that converts text into embeddings.

**Enterprise Edition**
Proprietary tier with SSO, RBAC, audit logs, org management, and a web dashboard.

**Environment Variable**
A configuration value set outside the application, typically in a `.env` file or system settings.

**Evaluation**
Measuring agent or RAG system performance using metrics like precision, recall, faithfulness, and answer relevance.

---

## F

**FAISS**
Facebook AI Similarity Search. An alternative vector database to ChromaDB.

**Fallback Chain**
A sequence of alternative providers tried when the primary provider fails.

**FastAPI**
A Python web framework used for backend APIs.

**Fetch-k**
The number of candidates retrieved from the vector database before reranking.

**Frontmatter**
YAML metadata at the top of Markdown files (e.g., `.mtc/agents/*.md`) used to configure agents.

---

## G

**Generation**
The LLM step that produces an answer based on retrieved context or tools.

**GitHub Actions**
CI/CD platform used for testing, building, and releasing MetaTeam Code Agent.

**Grounding**
The practice of ensuring LLM answers are based on retrieved documents or tool results rather than training data.

---

## H

**HNSW**
Hierarchical Navigable Small World. The indexing algorithm used by vector databases for approximate nearest neighbor search.

**Hybrid Search**
Retrieval that combines dense (vector) and sparse (keyword) methods.

---

## I

**Ingestion**
The process of loading documents into a system: extract, chunk, embed, store.

**Ink**
A React renderer for building terminal user interfaces. Used for the MetaTeam Code Agent TUI.

**In-prompt Learning**
Providing information to the LLM via the prompt (context) rather than via fine-tuning.

---

## J

**JSON**
JavaScript Object Notation. The format used for API request and response bodies, and for many config files.

---

## K

**Keyword Search**
Search that matches exact words or phrases in the text. Also called sparse retrieval or lexical search.

---

## L

**LLM**
Large Language Model. The generative AI model (e.g., GPT-4o, Claude, DeepSeek) that produces answers or drives the agent.

**LLaMA.cpp**
A tool for running LLM inference locally. MetaTeam Code Agent supports connecting to a local llama-server.

**Local LLM**
An LLM running on your own machine via llama.cpp, Ollama, or similar.

---

## M

**Markdown (MD)**
A lightweight markup format. Used for agent definitions, skills, and rules.

**Max Tokens**
The maximum number of tokens the LLM can generate in a single response.

**MCP (Model Context Protocol)**
An open protocol for connecting LLMs to external tools and data sources. MetaTeam Code Agent acts as an MCP client.

**Metadata**
Structured data attached to a chunk or document (e.g., `{"meeting_id": 5}`). Used for filtering and attribution.

**Model Context Protocol**
See MCP.

**Multi-modal**
Support for multiple input/output types (text, images, audio).

---

## O

**OCR**
Optical Character Recognition. Used to extract text from scanned PDFs or images.

**OpenAI**
An LLM provider supported by MetaTeam Code Agent.

**OpenRouter**
An LLM aggregator provider that gives access to multiple models through a single API.

---

## P

**PDF**
Portable Document Format.

**Permission**
A control that restricts which tools an agent can use. Levels: `allow`, `ask`, `deny`.

**Plugin**
A module that extends MetaTeam Code Agent with custom tools, hooks, or commands.

**PostgreSQL**
A relational database used for metadata, conversation history, and user data in RAG projects.

**Precision**
The fraction of retrieved chunks that are relevant. High precision = few irrelevant results.

**Prompt**
The text input given to an LLM, typically including system instructions, context, and the user question.

**Prompt Engineering**
The practice of designing prompts to elicit desired behavior from LLMs.

**Provider**
An LLM service (e.g., OpenAI, DeepSeek, Anthropic) that MetaTeam Code Agent can connect to.

**Pydantic**
A Python validation library. Used in backend RAG projects for settings and schemas.

---

## Q

**Qdrant**
An open-source vector database. Alternative to ChromaDB.

**Query**
A user question or request submitted to the agent or RAG system.

---

## R

**RAG**
Retrieval-Augmented Generation. A technique that combines document retrieval with LLM generation.

**RAGAS**
A framework for evaluating RAG systems on faithfulness, answer relevance, and context relevance.

**RAG Pipeline**
The sequence of stages: ingest, embed, store, retrieve, rerank, generate.

**Re-ranking**
Re-scoring retrieved candidates using a more accurate (but slower) model.

**Recall**
The fraction of all relevant chunks that are retrieved. High recall = few missed relevant chunks.

**Recursive Chunking**
A chunking strategy that splits text hierarchically on natural boundaries (paragraphs, sentences, words).

**Reranker**
A model or function that re-scores retrieved candidates to improve ranking quality.

**Retrieval**
The process of finding relevant chunks for a query from the vector database.

**REST API**
Representational State Transfer API. The communication pattern used between frontend and backend.

---

## S

**Scoring**
Assigning a numerical relevance value to a chunk for a given query.

**Secret Redaction**
The process of masking sensitive values (API keys, tokens) in logs and output.

**Semantic Search**
Search that understands the meaning of words, not just exact matches.

**SentenceTransformer**
A Python library for generating sentence embeddings.

**Server-Sent Events (SSE)**
A protocol for streaming text data from server to client over HTTP.

**Session**
A conversation session identified by `session_id`. Groups related turns for context and history.

**Skill**
A reusable bundle of instructions and behaviors that can be activated by the agent.

**Source Citation**
A reference to the original document or tool result used to generate an answer.

**Sparse Retrieval**
Retrieval using keyword matching (e.g., BM25). Captures exact term matches but not semantic similarity.

**SQLAlchemy**
A Python SQL toolkit and ORM.

**SSE**
See Server-Sent Events.

**Streaming**
Sending the LLM response in chunks as it is generated, rather than waiting for the complete response.

**Subagent**
A specialized agent spawned by the main agent to handle a specific task.

**System Prompt**
The initial instruction given to the LLM that sets its behavior and constraints.

---

## T

**Tailwind CSS**
A utility-first CSS framework used for frontend styling in the Meeting Note Assistant project.

**Temperature**
An LLM parameter controlling randomness. `0.0` = deterministic, `1.0` = very random.

**Terminal UI (TUI)**
A text-based user interface that runs in the terminal. MetaTeam Code Agent uses Ink to build its TUI.

**Token**
The basic unit of text processed by an LLM. Roughly 4 characters or 0.75 words for English text.

**Tool**
A function the agent can call to interact with the world (read files, run bash, search the web, etc.).

**Top-k**
The number of top-scoring results to return after retrieval (and optionally reranking).

**TypeScript**
A typed superset of JavaScript used for the MetaTeam Code Agent codebase.

---

## U

**UUID**
Universally Unique Identifier. Used to generate unique filenames, session IDs, and meeting IDs.

---

## V

**Vector**
A list of floating-point numbers representing text semantics. Also called an embedding.

**Vector Database**
A database optimized for storing and searching high-dimensional vectors.

**Vector Search**
Searching for similar vectors using distance metrics like cosine similarity or Euclidean distance.

**VS Code Extension**
A plugin for Visual Studio Code that connects to MetaTeam Code Agent via WebSocket for editor integration.

---

## W

**Webhook**
An HTTP callback triggered by an event (e.g., a GitHub issue being created). MetaTeam Code Agent's daemon listens for webhooks.

**WebSocket**
A protocol for full-duplex communication. Used by the VS Code extension to connect to `mtc serve`.

**Weaviate**
An open-source vector database. Alternative to ChromaDB.

---

## Z

**Zod**
A TypeScript-first schema validation library. Used by MetaTeam Code Agent to validate tool inputs and configuration.

**Zero-shot**
The ability of an LLM to perform a task without task-specific fine-tuning.

---

## Acronyms Quick Reference

| Acronym | Full Form |
|---------|-----------|
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
