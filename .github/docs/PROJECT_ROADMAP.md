# PROJECT\_ROADMAP.md

## Working Title

QA Evidence Hub

---

## Vision

Build a persistent evidence and knowledge workspace for software testing, beta testing, UX/product observations, marketing observations, and related project collaboration.

The system should prevent valuable context from being lost across chats, screenshots, local files, spreadsheets, repeated AI conversations, and individual people's memory.

Instead of starting from the beginning each time, a project should maintain a structured history containing:

- testing sessions  
- screenshots and other evidence  
- findings  
- observations  
- claims  
- client instructions and requirements  
- retests  
- decisions and resolutions  
- reports  
- AI-derived summaries, tags, relationships, and interpretations

Screenshots and communications are first-class evidence rather than simple attachments.

The long-term goal is to create a shared project memory that humans and AI can both work with safely through the web portal, background AI processing, and external AI clients such as ChatGPT through MCP.

AI should help organize and reason over project knowledge, but it must never silently replace original evidence or become the sole authoritative source of project facts.

---

## Core Product Principle

The portal preserves the project memory.

Original evidence and human submissions remain traceable.

AI retrieves, analyzes, compares, and organizes that memory.

AI-generated information is derived data and must remain distinguishable from:

- source evidence  
- human claims and observations  
- accepted project decisions

---

## Core Knowledge Model

The long-term conceptual flow is:

Evidence → Claim / Observation → Reasoning / Analysis Record → Interpretation → Decision / Resolution

A Reasoning / Analysis Record is an explicit, auditable rationale artifact. It may record the question being investigated, evidence considered, alternatives, uncertainty, proposed interpretation, and resulting action or decision. It is not a dump of hidden model chain-of-thought.

Examples:

- a screenshot shows a failed checkout  
- one tester claims the issue affects Safari  
- another tester reports Safari works  
- a third tester identifies Apple Pay as the distinguishing condition  
- AI suggests that the reports may be conditionally consistent  
- a reviewer accepts a consolidated finding or requests more testing

The system must preserve the underlying submissions rather than deleting or overwriting them simply because later information differs.

The history of how a conclusion was reached is itself valuable project knowledge. Important rationale should therefore be persisted explicitly rather than existing only inside an AI conversation or a contributor's memory.

---

## Target Users

### Initial

- Solo freelance QA engineer  
- Beta tester  
- Tester contributing UX/product observations  
- Tester contributing marketing or messaging feedback

### Future

- Freelance QA professionals  
- Distributed beta-testing groups  
- Small QA/product teams  
- Product owners  
- Clients and stakeholders requiring structured testing visibility

---

## Product Goals

QA Evidence Hub should make it possible to:

1. Capture testing evidence quickly.  
2. Preserve screenshots and their context.  
3. Connect evidence to findings, observations, claims, retests, and decisions.  
4. Maintain history across repeated testing sessions.  
5. Retrieve previous knowledge without manually searching old chats or folders.  
6. Identify recurring issues and related evidence.  
7. Preserve and resolve contradictory observations from multiple contributors.  
8. Preserve explicit reasoning/rationale that connects evidence to interpretations and decisions.  
9. Allow AI to organize and reason over accumulated evidence.  
10. Allow ChatGPT and other AI clients to work with project knowledge through controlled interfaces.  
11. Eventually support multiple independent users and organizations safely.

---

## Product Non-Goals

The initial product is not intended to become:

- a generic project-management suite  
- a complete Jira replacement  
- a source-code repository  
- a general cloud-storage service  
- an autonomous AI decision-maker  
- a full test-case-management platform in Phase 1

The primary value is preserving and reusing evidence-backed project knowledge.

## Product Guardrail

Do not allow the project to become an AI platform before the evidence-management workflow itself is genuinely useful. Prefer the smallest testable slice that improves the real QA workflow.

---

## Evidence Capture Principle

For browser-based evidence, capture as much useful context as possible with minimal manual effort.

Preferred web evidence envelope:

Screenshot

+ Sanitized URL  
+ Page title  
+ Timestamp  
+ Viewport  
+ Browser/environment

The URL must be sanitized before persistence so that sensitive query parameters, tokens, credentials, personal data, or session identifiers are not stored by default.

Evidence capture should remain flexible enough for non-web sources where a URL does not exist.

---

## Efficiency & Abuse-Resistance Principles

### Client-Side First

Where practical and safe, computational work should be performed on the user's device before data is uploaded.

Candidate operations include:

- screenshot resize/compression  
- image format conversion  
- URL sanitization  
- page-title and browser metadata capture  
- preliminary sensitive-data redaction  
- content hashing for duplicate detection

This can reduce:

- server CPU usage  
- bandwidth  
- storage requirements  
- background processing  
- AI/API costs

Client-side processing is an optimization, not a security boundary.

The server remains responsible for:

- authorization  
- validation  
- quota enforcement  
- tenant isolation  
- data integrity

### Resource Attribution

Every operation that consumes meaningful resources should be attributable, measurable, and limitable per workspace or user.

This includes:

- evidence storage  
- uploads  
- AI processing  
- embeddings  
- background jobs  
- MCP/API requests  
- report/export generation

The architecture should support quotas and rate limits without requiring a future redesign.

---

# Phase 1 — Personal Evidence Workspace MVP

## Goal

Prove that the system can replace scattered screenshots, notes, spreadsheets, and defect logs during one real testing engagement.

The first validation environment should be actual freelance/beta-testing work.

## Core Workflow

Client → Project → Test Session → Evidence → Finding / Observation → Report

## Capabilities

### Clients

Support:

- create client  
- edit basic client information  
- view associated projects

Only information necessary for testing engagements should initially be stored.

### Projects

A project represents one testing/product engagement.

Store basic information such as:

- project name  
- client  
- description  
- status  
- testing context  
- important instructions  
- created/updated timestamps

### Test Sessions

A test session records a specific period or activity of testing.

Initial data may include:

- project  
- date/time  
- purpose  
- environment  
- device  
- operating system  
- browser  
- application/build version  
- notes

### Evidence

Evidence is a first-class domain object.

Initial evidence types:

- screenshots  
- images  
- text notes  
- files  
- URLs

An evidence item may contain:

- project  
- optional test session  
- evidence type  
- original source  
- original filename  
- storage reference  
- MIME type  
- checksum  
- capture/upload timestamp  
- description  
- optional tags  
- sanitized URL where relevant  
- page title where relevant  
- viewport/browser metadata where relevant

Evidence should be reusable.

One screenshot may support:

- a defect  
- a UX observation  
- a product observation  
- a marketing observation  
- a later retest  
- a later decision

The physical file must not need to be duplicated for each relationship.

### Findings

A Finding represents a structured defect or quality problem.

Initial fields:

- title  
- description  
- severity  
- environment  
- device  
- browser  
- reproduction steps  
- expected result  
- actual result  
- linked evidence  
- created timestamp  
- current status

Initial lifecycle:

- Open  
- Awaiting Retest  
- Verified Fixed  
- Rejected

Exact terminology may evolve after real-world usage.

### Observations

Not every valuable piece of information is a defect.

Support lightweight observations such as:

- UX issue  
- usability concern  
- product idea  
- messaging problem  
- marketing insight  
- confusing behavior  
- improvement opportunity

Observations may reference the same evidence as findings.

### Reports

Generate a basic project/testing report containing relevant:

- project information  
- session information  
- findings  
- statuses  
- severities  
- observations  
- screenshots/evidence

The first report format may be HTML/printable rather than a complex document generation system.

## Phase 1 Storage

Structured information:

- PostgreSQL

Original evidence:

- Private Cloudflare R2 Standard bucket  
- served only through authenticated NestJS evidence endpoints  
- accessed through an application storage abstraction

PostgreSQL owns project structure and evidence metadata; object keys do not define project identity. The R2 adapter must verify conditional-create, SHA-256 recovery, cancellation and deletion safety. Google Drive remains the home for project documents and handoff.

## Phase 1 AI

No embedded AI is required.

No embeddings are required.

No MCP integration is required.

Phase 1 must prove that the evidence workflow itself provides value.

## Success Signal

Complete at least one real freelance/beta-testing engagement using the system without requiring a separate:

- defect spreadsheet  
- screenshot folder  
- testing notes document

Returning to the project later should make previous testing evidence easy to understand and locate.

---

# Phase 2 — Structured Project Knowledge & Traceability

## Goal

Turn accumulated testing evidence into reusable project knowledge.

Move beyond storing individual findings toward understanding relationships between evidence, claims, historical context, and decisions.

## Claims / Knowledge Items

Introduce a concept representing statements derived from human submissions or evidence.

Examples:

- "Login fails on Safari."  
- "Button text is unclear."  
- "Checkout succeeded on iPhone 15."  
- "Client requested this behavior."  
- "Users appear confused by this wording."

A claim should retain provenance.

Possible provenance:

- contributor  
- source evidence  
- test session  
- communication  
- timestamp  
- source type

Claims should not automatically overwrite one another.

## Reasoning / Analysis Records

Introduce an explicit record for important rationale that connects evidence, claims, interpretations, and decisions.

A reasoning/analysis record may include:

- question or issue being investigated  
- evidence and claims considered  
- relevant assumptions or conditions  
- alternative explanations considered  
- uncertainty / missing evidence  
- proposed interpretation  
- recommended next test or action  
- author/source (human, AI, or mixed)  
- review state  
- timestamp

The purpose is auditability and continuity, not storage of hidden AI chain-of-thought. The record should contain a concise, reviewable rationale that can survive beyond the original conversation.

### Phase 2 design note — keep the knowledge model small

Evaluate Claim plus one auditable ReasoningRecord before splitting Interpretation and Decision into separate entities. Preserve provenance, review state and a clear distinction between a proposal and an accepted decision, with recorded actor/time and amendment history. Split approval records only when governance requires it; this is a design option to evaluate, not an approved schema change.

*Will be considered in Phase 2; outside Phase 1 scope.*

## Relationships

Support relationships such as:

- evidence supports finding  
- evidence supports observation  
- evidence supports claim  
- claim supports claim  
- claim contradicts claim  
- reasoning record considers evidence / claims  
- reasoning record proposes interpretation  
- interpretation supports decision  
- finding relates to finding  
- requirement relates to finding  
- retest verifies finding  
- decision resolves conflict

## Project Timeline

Maintain chronological history containing relevant:

- test sessions  
- evidence uploads  
- findings  
- observations  
- claims  
- reasoning / analysis records  
- status changes  
- retests  
- important decisions  
- client instructions

## Search

Support structured searching/filtering by:

- client  
- project  
- session  
- finding  
- severity  
- status  
- environment  
- device  
- browser  
- evidence type  
- tags  
- contributor  
- reasoning/analysis records  
- date  
- text content

## Historical QA Knowledge

The system should begin answering questions such as:

- Has this problem occurred before?  
- Was this functionality previously tested?  
- Was this defect previously fixed?  
- Which screenshots relate to checkout?  
- Which observations keep recurring?  
- Why was a particular decision made?  
- What evidence and alternatives were considered?  
- What changed between two test sessions?

## Semantic Retrieval

Evaluate PostgreSQL `pgvector`.

Embeddings may represent derived textual information such as:

- screenshot descriptions  
- extracted visible text  
- finding descriptions  
- claims  
- observations  
- reasoning / analysis summaries  
- communication summaries

The original screenshot does not need to become the primary vector record.

A dedicated vector database is not required initially.

## Success Signal

A later testing session can reuse historical evidence and determine whether an issue is:

- new  
- recurring  
- related to previous evidence  
- previously resolved

without manually searching old conversations or screenshot folders.

---

# Phase 3 — AI Knowledge Processing

## Goal

Use AI to reduce the manual work involved in organizing increasing quantities of evidence and project communication.

AI becomes a processing layer over the knowledge model rather than the source of truth.

## AI Architecture Principle

Original material remains canonical.

AI-generated content is derived information.

AI-derived information should retain provenance such as:

- source evidence  
- processing operation  
- processing timestamp  
- model/provider  
- model version where available  
- prompt/workflow version where useful  
- confidence where meaningful  
- human confirmation state where applicable

## Screenshot Processing

When a screenshot is uploaded, AI may propose:

- description  
- visible text  
- application area  
- feature name  
- tags  
- UX/product observation  
- possible finding title  
- possible related existing finding

The original screenshot remains stored unchanged.

## Communication Processing

AI may identify possible:

- requirements  
- decisions  
- testing instructions  
- requested changes  
- unresolved questions  
- product observations  
- marketing observations

These should be linked back to the original communication/evidence.

## Duplicate Detection

AI may identify potentially duplicate:

- findings  
- observations  
- claims  
- screenshots  
- issues reported in different sessions

The system should propose relationships rather than automatically delete or merge source information.

## Agreement and Contradiction Detection

Multiple testers may report different outcomes.

Example:

Tester A: "Checkout fails on Safari."

Tester B: "Checkout works on Safari."

Tester C: "Checkout fails when Apple Pay is enabled."

AI may identify:

- possible contradiction  
- missing distinguishing condition  
- related evidence  
- additional testing required

The system should preserve every original claim.

## Knowledge Consolidation

AI may propose a consolidated interpretation such as:

"Available evidence suggests the failure may be specific to Safari sessions using Apple Pay."

This remains an interpretation until accepted through the appropriate project workflow.

## AI Reasoning Artifacts

For important analyses, AI may create or update a structured Reasoning / Analysis Record containing a concise rationale such as:

- question investigated  
- evidence/claims considered  
- alternatives or competing explanations  
- uncertainty and missing evidence  
- proposed interpretation  
- recommended next action or test

The product must not depend on hidden model chain-of-thought. Persisted reasoning should be a reviewable explanation with provenance that can be inspected, challenged, superseded, or accepted.

## Human Review

Important AI-generated conclusions should be:

- reviewable  
- editable  
- confirmable  
- rejectable

Significant accepted decisions should be stored separately from raw AI suggestions.

## AI Cost Control

AI processing must be measurable.

Track where practical:

- workspace/tenant  
- user  
- project  
- operation  
- model  
- input usage  
- output usage  
- estimated/actual cost

Prefer:

- inexpensive models for routine extraction/classification  
- stronger models only for complex reasoning  
- processing evidence once when practical  
- storing derived information  
- retrieving only relevant project context  
- avoiding repeated submission of entire project histories

## Success Signal

AI meaningfully reduces time spent:

- describing screenshots  
- categorizing evidence  
- finding related material  
- identifying duplicates  
- recognizing possible contradictions  
- preparing consolidated findings

while preserving traceability to original evidence.

---

# Phase 4 — Shared Multi-User Knowledge Hub

## Goal

Allow multiple contributors to work safely within shared project knowledge.

This phase transforms the personal tool into a collaborative hub.

## Users and Workspaces

Introduce:

- multi-user authentication and membership management; Phase 1 already requires private single-owner access  
- user accounts  
- workspaces/tenants  
- workspace membership  
- project membership

## Authorized Use

For public use, project creation should require the user to confirm that they:

- own/control the tested system, or have authorization from its owner/operator  
- have the right to upload the evidence and communications stored in the hub

More intrusive activities such as security testing, load testing, authenticated probing, or automated scanning should require explicit written authorization and a defined scope.

A checkbox or disclaimer is not a substitute for technical controls, clear terms, or appropriate legal review.

## Roles and Permissions

Potential roles may include:

- workspace owner  
- project manager  
- tester/contributor  
- reviewer  
- client/read-only user

Exact role definitions should be validated before implementation.

## Contributions

Multiple users should be able to submit:

- screenshots  
- findings  
- observations  
- claims  
- retest results  
- comments/context

Every contribution should retain authorship and timestamp information.

## Conflict Handling

Conflicting information is expected.

The application must distinguish between:

- original contribution  
- interpretation  
- accepted decision

No participant's evidence should disappear merely because a later conclusion differs from it.

## Decision / Resolution Workflow

Introduce explicit project decisions.

A decision may record:

- issue being resolved  
- related claims/evidence  
- accepted conclusion  
- who made/approved the decision  
- timestamp  
- rationale  
- status

This provides the authoritative project conclusion while preserving the history leading to it.

## Tenant Isolation

Every relevant subsystem must respect tenant/workspace boundaries.

This includes:

- PostgreSQL records  
- evidence files  
- search  
- vector retrieval  
- AI processing  
- reports  
- background jobs  
- MCP access

## Abuse Resistance

The shared hub should support:

- workspace-level quotas  
- upload limits  
- storage limits  
- AI usage limits  
- API/MCP rate limits  
- auditability of costly operations  
- protection against automated abuse

## Success Signal

Multiple contributors can work on the same project while preserving:

- authorship  
- conflicting evidence  
- accepted decisions  
- complete testing history

Two unrelated tenants must be unable to access one another's information.

Tenant isolation must be covered by automated tests.

---

# Phase 5 — MCP and External AI Access

## Goal

Expose controlled project knowledge and operations to external AI clients such as ChatGPT.

MCP is an interface to the application, not the application core.

## Architecture Principle

ChatGPT / AI Client → MCP → Application Services → PostgreSQL / Search / Evidence Storage

MCP should not receive unrestricted direct database access.

MCP operations should use the same:

- authentication  
- authorization  
- tenant checks  
- validation  
- business rules

as the web application.

## MCP Context Modes

The MCP integration should support two complementary context modes.

### Explicit Mode

Use deliberate, user-driven MCP calls for a particular prompt or operation.

Examples:

- load a project when the user wants project context  
- fetch fresh retest results when current data is needed  
- save a summary, reasoning record, or decision when explicitly requested

This mode minimizes unnecessary retrieval and is useful for one-off or privacy-sensitive work.

### Project-Attached Mode

Allow an AI conversation/session to be explicitly bound to a selected project. For relevant turns, the AI client may retrieve fresh project context through MCP without requiring the user to repeat a manual call every time.

Project-attached mode must:

- remain scoped to the selected project/workspace  
- retrieve relevant slices rather than dump the whole project  
- distinguish cached conversation context from freshly retrieved hub data  
- respect authorization and tenant boundaries on every retrieval  
- allow the user to detach/switch project context deliberately  
- avoid silent cross-project context leakage

The purpose is continuity of reasoning, not permanent automatic synchronization of all project data into every prompt.

### Phase 5 design note — resources, prompts and project binding

Evaluate an authenticated project binding, a compact timestamped project-context resource and an optional QA-session prompt. Binding selects context; it never grants access, and every retrieval must recheck authorization. Resource inclusion and prompt use require client participation; an MCP server cannot ensure retrieval on every turn. A separately approved early post-MVP slice would be read-only, expose only implemented Phase 1 data, and omit create\_reasoning\_record and other domain writes. Persistence prompts belong with an authorized write-capable milestone. No earlier slice is scheduled by this specification update.

*Will be considered in Phase 5, or a separately approved post-MVP slice; outside Phase 1 scope.*

## Reasoning Persistence Rule

Important reasoning must not exist only inside an AI conversation. When analysis affects project understanding or a decision, the system should be able to persist a structured Reasoning / Analysis Record with provenance and links to the evidence/claims considered.

The hub should preserve explicit rationale, alternatives, uncertainty, and resulting decisions where useful, but should not attempt to store hidden model chain-of-thought.

The MCP layer should expose structured project evidence and application operations rather than forcing AI clients to infer project state from large document dumps.

## Candidate MCP Read Operations

Examples:

- search\_projects  
- get\_project\_context  
- search\_evidence  
- get\_evidence  
- search\_findings  
- get\_finding  
- get\_project\_history  
- find\_related\_evidence  
- search\_claims  
- get\_decisions  
- get\_reasoning\_records  
- compare\_test\_sessions

## Candidate MCP Write Operations

Possible controlled actions:

- create\_test\_session  
- create\_finding  
- create\_observation  
- create\_claim  
- link\_evidence  
- update\_finding  
- record\_retest  
- propose\_relationship  
- create\_reasoning\_record  
- update\_reasoning\_record

Sensitive or destructive operations may require stronger controls or explicit confirmation.

## Example Interactions

- "Show me everything we previously found about onboarding."  
- "Find screenshots related to mobile registration."  
- "Has this issue already been reported?"  
- "Compare today's checkout testing with the previous session."  
- "Create a finding using these screenshots."  
- "What contradictory reports exist around Safari?"  
- "What decisions were made about this issue, and why?"  
- "Show me the evidence and rationale behind the current conclusion."  
- "What should I know before beginning the next regression session?"

## Success Signal

A new AI conversation can reconstruct useful project context through MCP without requiring the user to manually re-explain project history.

In project-attached mode, relevant ongoing reasoning can remain grounded in fresh hub context across the conversation without loading the entire project on every turn.

Retrieved information and persisted reasoning must remain traceable to evidence stored by the hub.

---

# Phase 6 — Commercial & Scale Validation

## Goal

Determine whether QA Evidence Hub can operate sustainably as a hosted product without weakening privacy, evidence integrity, or tenant isolation.

Commercialization is optional until the product has demonstrated genuine workflow value.

## Initial Business Model Hypothesis

The preferred initial commercial model is prepaid usage credit rather than a mandatory subscription.

### Starter Credit

A new verified workspace may receive a small promotional balance.

Initial hypothesis:

- \$5 promotional credit

The exact amount may change after real cost data is available.

### Pay-As-You-Go

After promotional credit is exhausted, users may purchase additional prepaid credit.

Potential top-up amounts may be introduced later based on payment fees and actual usage patterns.

No negative balance should be required for early versions.

When credit is depleted:

- paid AI/resource-heavy processing should stop gracefully  
- existing project data should remain accessible  
- the user may purchase additional credit to resume paid processing

### What Credits May Cover

Credits should primarily apply to operations with real marginal cost, such as:

- AI screenshot analysis  
- AI extraction/classification  
- AI duplicate/contradiction detection  
- AI knowledge consolidation  
- embedding generation  
- heavy MCP/API automation  
- unusually expensive exports or background processing

Ordinary database-backed operations should remain outside the credit system where practical.

Examples:

- creating projects  
- creating test sessions  
- browsing evidence  
- creating findings  
- updating statuses  
- viewing reports  
- ordinary structured search

### Trial Abuse Protection

Promotional credit must not turn the service into a free AI/storage proxy.

The system should support:

- verified signup requirements  
- one-trial-per-user/workspace rules where appropriate  
- rate limits  
- storage limits  
- restricted trial API/MCP automation  
- auditability of costly operations

### Future Commercial Flexibility

Subscriptions may be introduced later if actual user behavior justifies them, for example for:

- predictable monthly allowances  
- team features  
- larger storage quotas  
- higher support levels

Prepaid usage credit remains the preferred initial hypothesis for a bootstrapped launch.

## Cost Attribution

Resource usage should be measurable by:

- tenant/workspace  
- project  
- user where appropriate  
- feature/operation

The service should be able to determine whether AI and storage features are economically sustainable.

## Evidence Storage Scale and Portability

R2 Standard is used from Phase 1\. Evaluate measured cost, capacity, retention and provider portability as scale grows; there is no planned Drive-to-object-storage migration.

Possible providers to compare only if a measured need arises:

- S3-compatible storage  
- AWS S3  
- Cloudflare R2  
- equivalent managed object storage

Storage-provider replacement must not require redesigning the Evidence domain.

## Scaling Search

Evaluate whether PostgreSQL \+ pgvector remains sufficient.

A dedicated vector/search platform should only be introduced if actual usage demonstrates a need.

## Client Access

Potential capabilities:

- client read-only portal  
- controlled evidence sharing  
- project summaries  
- report access  
- approval/review flows

## Success Signal

The system demonstrates that:

- hosting costs are measurable  
- storage costs are measurable  
- AI costs are measurable  
- tenant resource usage is measurable  
- abuse can be controlled  
- prepaid credit can cover variable-cost operations at a sustainable margin

without weakening privacy or project isolation.

---

# Future Exploration

Potential later capabilities:

- reusable QA engagement templates  
- reusable testing checklists  
- test-plan libraries  
- team collaboration  
- comments/discussions  
- release-readiness summaries  
- regression suggestions  
- risk summaries  
- project dashboards  
- evidence analytics  
- cross-session quality trends  
- structured beta-testing campaigns  
- client portals  
- notifications  
- integrations with issue trackers  
- integrations with Git repositories  
- configurable AI workflows  
- mobile evidence capture

These ideas are not commitments.

They should be reconsidered after evidence from real usage.

---

# Cross-Project Knowledge

Cross-project learning may eventually provide value.

Examples could include:

- recurring generic UX patterns  
- reusable testing knowledge  
- common defect categories  
- generalized testing heuristics

However:

Confidential client/project information must never automatically become shared cross-client knowledge.

Cross-project knowledge requires an explicit data-governance model before implementation.

---

# Security & Privacy Principles

## Private by Default

Project evidence must be private by default.

## Sensitive Screenshots

Screenshots may contain:

- credentials  
- personal information  
- email addresses  
- internal URLs  
- authentication tokens  
- customer information  
- confidential client data

Redaction workflows may therefore become necessary.

## URL Sanitization

Sensitive URL parameters, authentication data, tokens, personal identifiers, and similar values must not be persisted by default.

Sanitization may begin client-side, but server-side validation remains mandatory.

## Authorization

Authorization must be enforced at the application/service level.

UI hiding alone is never sufficient.

## File Access

Evidence files must not become publicly accessible simply because their storage provider supports public links.

Access should be controlled by the application wherever practical.

## AI Processing

Client evidence must not be sent to external AI services without an appropriate authorization and privacy model.

AI processing should be configurable where required.

## AI Provenance

AI-derived information should remain linked to its source material.

## Tenant Isolation

Tenant isolation applies equally to:

- relational data  
- files  
- search  
- embeddings  
- background jobs  
- reports  
- AI prompts/context  
- MCP operations

## Public-Launch Legal & Privacy Readiness

Before accepting real external customer evidence, prepare and review as applicable:

- Terms of Service  
- Privacy Notice  
- Data Processing Agreement  
- subprocessor list  
- international data-transfer arrangements

For customer project evidence, the likely GDPR roles should be evaluated carefully; a common model may be customer as controller and QA Evidence Hub as processor, while the service may act as controller for account, billing, security, and operational data.

## Deletion and Retention

Before public multi-user operation, define:

- evidence deletion  
- project deletion  
- account deletion  
- retention rules  
- AI-derived-data deletion  
- vector/embedding deletion  
- file-storage cleanup

---

# Key Product Assumptions

1. Screenshots contain substantial reusable project knowledge.

2. Valuable QA information is currently lost because it is distributed across multiple tools.

3. Preserving context around a defect is often more valuable than storing the defect record alone.

4. Evidence may support several interpretations simultaneously.

5. Multiple testers may produce apparently contradictory but individually valid reports.

6. Preserving disagreement and provenance is valuable.

7. AI can reduce organizational work but should not become the sole source of project truth.

8. Historical project knowledge makes future AI conversations significantly more useful.

9. Preserving explicit rationale, not only final decisions, improves continuity, auditability, and later re-evaluation.

10. Semantic retrieval may improve access to large evidence collections.

11. A useful personal QA tool should be validated before building a complete public SaaS product.

12. Resource-heavy operations can be monetized more naturally through prepaid usage credit than through mandatory subscription in the initial bootstrap stage.

These assumptions should be treated as hypotheses and validated through actual usage.

---

# Key Risks

## Privacy

Real testing evidence may contain confidential or personal information.

## Screenshot Sensitivity

Screenshots may unintentionally expose secrets or personal data.

## Incorrect AI Interpretation

AI may:

- misclassify evidence  
- invent relationships  
- incorrectly identify duplicates  
- incorrectly characterize contradictions  
- produce incorrect summaries

Therefore AI-derived information must remain distinguishable from original evidence and accepted human/project decisions.

## Knowledge Contamination

Incorrect conclusions may propagate if derived information loses its provenance or if decisions are preserved without the rationale and evidence that produced them.

## Tenant Leakage

Multi-tenant search, vector retrieval, file access, AI context, or MCP access could expose another tenant's information if incorrectly implemented.

This is a critical security risk.

## AI Cost

Uncontrolled AI usage could make the service economically unsustainable.

## Storage Growth

Screenshot-heavy projects may generate large storage requirements.

## Abuse

The service could be abused for:

- free file storage  
- excessive AI processing  
- automated API/MCP consumption  
- account farming for promotional credit

Quotas, rate limits, verification, and resource attribution are therefore first-class requirements for public use.

## Premature Complexity

MCP, vector databases, complex AI agents, billing, and collaboration features could distract from validating the evidence workflow.

Future architecture should only be introduced when the preceding phase proves the need.

---

# Transparency & Public Repository

The project should be developed publicly where practical as part of the portfolio and trust model.

Principles:

- public source code may be used to make architecture and security decisions inspectable  
- production secrets must never be committed  
- real client evidence and private tenant data must never be published  
- public demos and tests must use synthetic data  
- open-source/public-code licensing must be chosen deliberately  
- proprietary components may remain private later if there is a concrete reason

A core trust message is:

**Evidence remains authoritative and traceable; AI creates derived knowledge without silently replacing the evidence.**

Where reasonably practical, processing and architectural decisions should be inspectable and transparent.

---

# Initial Technical Direction

Technical decisions — 22–24 October 2026: Next.js \+ NestJS \+ PostgreSQL on VPS, with private R2 Standard for application evidence and Google Drive for collaboration documents. project\_sheet v0.4.1 defines the Phase 1 Foundation, container/test-isolation requirements and mandatory per-slice testing, documentation and review. Phase goals, product scope and exit criteria remain unchanged.

Document the selected architecture in ADR-001 when the repository is created. The project\_sheet is the detailed Phase 1 implementation contract; this roadmap remains the strategic phase plan.

## Backend

- Node.js with TypeScript  
- NestJS modular monolith; application services own authorization, validation, transactions, storage and report data

## Frontend

- Next.js App Router  
- React with TypeScript  
- Server-rendered pages with focused client components for forms and evidence capture

Next.js calls the NestJS API through a generated OpenAPI client; it has no direct PostgreSQL or object-storage access. NestJS services own authorization and business rules for future MCP reuse. Server rendering reads sessions without rotating browser cookies; private evidence bypasses the image optimizer. These refinements do not add MCP to Phase 1 or reorder phases.

## Database

- PostgreSQL; Prisma is the working access/migration default, with reviewed SQL constraints where needed

Potential later extension:

- pgvector

## Evidence Storage

Initial:

- Private Cloudflare R2 Standard  
- Bucket-scoped object credentials; authenticated API downloads  
- NestJS accesses R2 through EvidenceStorage, with conditional creation, server SHA-256 verification and explicit recovery/deletion semantics. Google Drive remains the project-document and handoff store.

Later portability review, if needed:

- Compare compatible providers without redesigning Evidence.

## AI

Portal-side AI:

- OpenAI API

Used only when portal-side/background AI capabilities are introduced.

External interactive AI:

- MCP  
- ChatGPT or other compatible clients

## Background Processing

Introduce asynchronous workers only when measured workload or reliability needs justify them. Select a supported NestJS/Node.js queue integration at that point; no queue or Redis service is required for the initial MVP.

Possible background jobs:

- screenshot analysis  
- OCR/text extraction  
- AI classification  
- embedding generation  
- duplicate detection  
- contradiction analysis  
- report generation

A queue infrastructure should not be introduced before it is needed.

## Search

Initial:

- PostgreSQL filtering  
- PostgreSQL full-text search where appropriate

Later:

- pgvector semantic retrieval if validated

A dedicated search/vector platform is not initially required.

## VPS Deployment

Hosting is confirmed as VPS. Deploy the Next.js web application, NestJS API, PostgreSQL and an HTTPS reverse proxy with Docker Compose. Use one public origin: /api/v1/\* goes to NestJS and application pages go to Next.js; keep database and internal application ports private. Build production artifacts in CI, then deploy them with explicit migrations, health checks and documented recovery.

The 2 vCPU / 4 GB RAM / 32 GB SSD profile remains an initial estimate. Verify provisioned resources and measure full-stack memory, CPU, disk and latency, including image validation. Keep evidence in private R2 and backups off-VPS. Use standalone web packaging, bounded logs/temp files and measured process/container/database limits; no fixed RAM or image-size claim is accepted. Verify supported dependencies, credentials, TLS and restore/deletion behavior during implementation.

## Development Environment

Initial direction:

- Docker-based local development  
- pnpm workspaces: apps/web, apps/api and packages/api-client  
- PostgreSQL  
- Vitest for unit/integration tests  
- NestJS testing utilities and Supertest; isolated PostgreSQL for persistence tests  
- Cucumber.js service/API bindings with real test PostgreSQL and fake storage; selective Playwright @smoke/@browser journeys

## CI

Initial direction:

- GitHub Actions; build and test deployment images outside the production VPS

Required Phase 1 CI includes:

- coding standards  
- static analysis  
- unit tests  
- integration tests  
- static/dependency/container security, secret/license checks and release SBOMs  
- current-slice BDD, coverage gates and production-image browser smoke

---

# Development Method & Governance

The project should serve as a practical demonstration of the Scrum-XP workflow used for planning, implementation, testing, and adaptation.

Emphasize:

- phased roadmap and explicit acceptance criteria  
- bounded implementation context  
- TDD/BDD where they add value  
- manual QA for visual/usability behavior  
- security/privacy review  
- ADRs for significant decisions  
- CI quality gates  
- documentation kept synchronized with the implemented system

Keep the process proportional to risk and complexity. Small changes should not require ceremony that adds no value.

The goal is not manual typing of every line of code; it is being able to define, direct, understand, verify, correct, and stand behind the delivered system.

Phase 1 Foundation: implement [project\_sheet §6.0](https://docs.google.com/document/d/14IhWxfyRFiKdIq4ZA9bskWDB9xR6kkMoqvftRW_ESBc#heading=h.fjzsm7y5ivox) within the existing first phase, with local/CI acceptance before business-feature work and VPS/security/recovery acceptance before real data. Every slice follows [§7.1](https://docs.google.com/document/d/14IhWxfyRFiKdIq4ZA9bskWDB9xR6kkMoqvftRW_ESBc#heading=h.69i3b1324lk7): meaningful tests before behavior changes, a separate review pass and owner disposition, and documentation/ADRs updated with the code. Keep repository documents in .github/docs/, with ADRs and audits in its adr/ and audit/ directories. Record the single-VPS release profile and guide simplifications in ADR-015; required CI blocks failed merges. Reassess the next phase from delivered evidence.

Handoff maintenance: keep active recommendations in handoff. Before removing a resolved discussion, put the decision and useful rationale in project\_sheet, this roadmap or an ADR; keep unfinished implementation in the project sheet/backlog. Retain at most one dated outcome/link line when useful. At each completed phase, purge resolved discussions and redundant register lines after checking that decisions, pending work and deferred proposals remain recorded in their canonical locations. Acceptance, specification updates and verified implementation are separate statuses; version history is a recovery aid, not the decision record.

---

# Candidate ADRs

Potential early ADRs:

- ADR-001: Next.js \+ NestJS \+ PostgreSQL on VPS; web/API responsibilities and deployment  
- ADR-002: PostgreSQL as primary data store  
- ADR-003: Evidence as a first-class domain object  
- ADR-004: Private R2 Standard evidence adapter; credentials, conditional creation, checksum recovery and deletion  
- ADR-005: Evidence-storage abstraction  
- ADR-006: Client-side evidence preprocessing boundaries  
- ADR-007: AI-derived data provenance model  
- ADR-008: Claims versus accepted project decisions  
- ADR-009: pgvector adoption criteria  
- ADR-010: MCP application-service boundary  
- ADR-011: Multi-tenant isolation strategy  
- ADR-012: Prepaid credit accounting model  
- ADR-013: Reasoning / Analysis Record model and provenance  
- ADR-014: MCP explicit vs project-attached context modes  
* ADR-015: Phase 1 Foundation and solo-VPS delivery profile; guide adaptations and revisit triggers

Only create an ADR when the corresponding decision becomes relevant.

---

# Candidate Phase 1 BDD Feature Seeds

Potential feature files:

- client-management.feature  
- project-management.feature  
- test-session.feature  
- evidence-upload.feature  
- screenshot-evidence.feature  
- finding-management.feature  
- observation-management.feature  
- evidence-linking.feature  
- testing-report.feature

These are seeds only.

The actual scenarios should be written when the corresponding slice enters the development loop.

---

# Phase 1 Exit Criteria

Phase 1 is complete when:

1. A real client/project can be created.  
2. A testing session can be recorded.  
3. Screenshots/evidence can be uploaded and retrieved.  
4. Browser evidence can retain sanitized context where available.  
5. Evidence can be linked to a finding.  
6. Evidence can be linked to an observation.  
7. A finding can move through its initial lifecycle.  
8. A basic testing report can be produced.  
9. The system is successfully used during at least one real testing engagement.  
10. That engagement does not require a separate spreadsheet or screenshot evidence folder for the core workflow.

---

# First Action

Proceed only with:

**Phase 1 — Personal Evidence Workspace MVP**

Do not implement yet:

- AI processing  
- embeddings  
- pgvector  
- MCP  
- public registration  
- billing/credit accounting  
- multi-tenant SaaS functionality  
- complex collaboration  
- dedicated vector databases

After Foundation F01–F02, the first usable product slice remains:

Client → Project → Test Session → Screenshot / Evidence → Finding or Observation → Report

Next steps within Phase 1:

1. Validate the existing Phase 1 specification in `project_sheet.md` and the current slice’s acceptance criteria/BDD scenarios; refine unresolved details.  
2. Complete Foundation F01–F02 ([project\_sheet §6.0](https://docs.google.com/document/d/14IhWxfyRFiKdIq4ZA9bskWDB9xR6kkMoqvftRW_ESBc#heading=h.fjzsm7y5ivox)): reproducible containers and disposable test services, with required CI gates.  
3. Implement the smallest usable vertical slice with tests, documentation and review in every slice ([project\_sheet §7.1](https://docs.google.com/document/d/14IhWxfyRFiKdIq4ZA9bskWDB9xR6kkMoqvftRW_ESBc#heading=h.69i3b1324lk7)).  
4. Before real client data or an actual testing engagement, satisfy Foundation F03–F04 and the privacy/security/readiness checks in [project\_sheet §8](https://docs.google.com/document/d/14IhWxfyRFiKdIq4ZA9bskWDB9xR6kkMoqvftRW_ESBc#heading=h.3tx0c9oazhyo); then validate the workflow during a real engagement.