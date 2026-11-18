# QA Evidence Hub — project\_sheet.md

Status: Phase 1 specification revised; application code, tests and deployment remain unverified.

Version: 0.4.2 · 24 October 2026 · Audit evidence and release-decision alignment.

Sources: PROJECT\_ROADMAP; [Scrum-XP\_expanded\_unified\_dev\_ops\_guide](https://docs.google.com/document/d/1wdQgNWYnrpKPyZypOVWySKeaDMcjQxG7bKYpJcVPc3w); [Audit](https://docs.google.com/document/d/14PZ6hYQ0GPVgU3xV-qmy23v7RoNsyuW2CJAm1lsIC6s); accepted stack/storage/security decisions and the 24 October 2026 Foundation/workflow and audit-alignment updates.

This document defines the Phase 1 implementation contract. The confirmed stack is Next.js, NestJS and PostgreSQL on VPS. The accepted storage, security, upload-recovery, integrity and testing refinements are incorporated below. Supporting tools and tuning values remain working defaults to verify during implementation. All repository paths are proposed until the repository is established. Specification acceptance does not mean implementation: record executable test evidence and as-built behavior after each delivered slice.

## 1\. Phase 1 action and scope

**Action:** Enable one QA practitioner to capture evidence, record findings and observations, revisit testing history, and produce a useful report during one real engagement without a separate defect spreadsheet or screenshot folder.

Core journey: **Client → Project → Test session → Evidence → Finding or observation → Printable report.** Findings belong to projects and can be retested in later sessions.

| Slice | Included | Status |
| :---- | :---- | :---- |
| S1 — first usable journey | Single-owner access; client/project/session setup; PNG/JPEG upload and clipboard paste; evidence linking; finding creation; project report; upload failure recovery; deliberate evidence deletion | Draft |
| S2 — complete Phase 1 | Basic editing/archiving; text, URL, PDF and text-file evidence; observations; finding lifecycle and retests; list filters; complete report handling and operational validation | Draft |

S1 may use synthetic data while being built. All Phase 1 privacy, recovery, and operational gates below apply before storing real client evidence. S1 alone does not satisfy the roadmap's complete Phase 1 exit criteria.

No AI, embeddings, MCP, public registration, billing, teams, tenant framework, browser extension, automatic page capture, test-case management, or public report sharing is included. Later roadmap phases are not implementation inputs for these slices.

## 2\. Phase 1 decisions and implementation defaults

| Decision | Phase 1 default | Consequence |
| :---- | :---- | :---- |
| Capture method | File chooser or drag-and-drop, plus clipboard image paste where supported | No browser extension. URL, title, viewport and tested-browser information are optional supplied context; the hub does not claim to infer another application's context. |
| Initial access | One provisioned owner account; login required throughout | No signup, invitations, role editor or account recovery email. Owner password reset is an operator command. A hosted deployment uses HTTPS. |
| File identity | The source is the exact file the user submits | Store accepted file bytes unchanged and hash those bytes. No automatic compression or conversion. Redaction is performed before submission in this version. A redacted submission must not be described as the unredacted original. |
| Finding ownership | Finding belongs to one project; creation and retest sessions supply historical context | The same finding continues across sessions. Retesting does not duplicate it. |
| Reports | Authenticated HTML view with browser printing; project scope | Each generation reflects current saved state and shows its generation time. No persisted report versions, signed reports, or independent PDF generator. |
| Evidence storage | PostgreSQL metadata plus private Cloudflare R2 Standard storage through EvidenceStorage | Google Drive holds project documents and handoff only. R2 avoids dependence on a personal Drive owner's OAuth token and supports conditional creation. NestJS owns private object access; database IDs define projects. Keep the storage port independent of the provider; no public-link fallback. |
| History versus deletion | Preserve source material and status/retest history unless the owner deliberately deletes evidence | Deletion requires an impact warning and leaves a minimal tombstone. Automatic merging or silent source replacement is forbidden. |

## 3\. Data contract

Use generated opaque identifiers, foreign keys and UTC timestamps. Display times in the owner's configured timezone; use Europe/Bratislava as the initial setting. Required text is trimmed and must remain non-empty. Suggested validation limits: names/titles 200 characters, a URL 2,048, and each long-text field 20,000. These are configurable implementation defaults. Render all user text as escaped plain text.

| Record | Required values | Optional values and rules |
| :---- | :---- | :---- |
| Owner | id, login identifier, password hash, timezone, created\_at | Exactly one provisioned account for Phase 1\. Credentials and storage secrets are never evidence metadata. |
| Client | id, name, created\_at, updated\_at | Notes. Archive/unarchive; no destructive client deletion in this phase. |
| Project | id, client\_id, name, status, created\_at, updated\_at | Description, testing context, instructions. Status: Active or Archived. An archived client cannot receive a new project. |
| TestSession | id, project\_id, started\_at, purpose, created\_at, updated\_at | ended\_at, environment, device, OS, browser, build/version, notes. End cannot precede start. |
| Evidence | id, project\_id, kind, title, state, submitted\_at, created\_by | session\_id, captured\_at, description, supplied source label, tags, sanitized\_url, page\_title, viewport, tested\_browser. Kind: Screenshot, Image, Text, URL or File. Session, if present, must belong to the project. |
| File-backed Evidence | storage\_key, accepted MIME type, byte\_size, SHA-256 after validation | provider\_file\_id (the R2 object key) and original\_filename are private metadata. Never use a supplied filename as a storage path. Screenshot/Image accepts PNG or JPEG; File accepts PDF or UTF-8 TXT. |
| Text/URL Evidence | Text requires body; URL requires sanitized\_url | Text/URL has no blob. A URL is a reference, not a fetched or archived page. Optional body for a URL is a user note. |
| Finding | id, project\_id, origin\_session\_id, title, description, severity, steps, expected\_result, actual\_result, status, created\_by, created\_at, updated\_at | At least one ready evidence link on creation. Origin session must be in the project. Copy environment/device/browser/build context from that session at creation; later session edits do not rewrite this copy. |
| Observation | id, project\_id, category, title, body, created\_by, created\_at, updated\_at | session\_id and evidence links optional. Categories: UX, Product, Marketing, Other. No defect severity or finding lifecycle. |
| EvidenceLink | project\_id, evidence\_id and exactly one finding\_id, observation\_id or retest\_id | Same-project composite foreign keys cover all three target types. Exactly one target is non-null; unique target/evidence pairs make repeat link requests a no-op. See section 6.3 for database constraints. |
| Retest | id, project\_id, finding\_id, session\_id, outcome, notes, created\_by, created\_at | Finding and session must belong to project\_id. At least one Ready evidence link. Outcome: Pass, Fail or Blocked. Records are append-only; created\_by references the authenticated owner. |
| FindingEvent | id, finding\_id, actor\_id, event\_type, occurred\_at | Status changes contain old/new status and reason. Content edits retain prior field values in protected history. Evidence bytes never enter this history. |

File-backed evidence has states Pending, Ready, Failed, DeletionPending or Deleted. Text/URL evidence is Ready immediately after successful validation. Only Ready evidence can receive new links. Deleted evidence retains only the minimum id/project/state/deletion-time information needed to explain existing links; remove its body, filename, URL, title, description and capture metadata.

Evidence may support several findings, observations and retests without copying its file. An identical checksum is information, not permission to merge: separate captures remain separate records. Physical deduplication is deferred.

Upload-operation bookkeeping is separate from evidence display state: unique operation\_id, evidence\_id, owner\_id, storage\_key, quota reservation, immutable validated SHA-256/byte size/MIME type, cancellation state, and tracked provider attempts. Store a renewable owner upload lease with lease\_expires\_at and an increasing attempt generation. Bind validated content identity before any provider write. Keep only the minimal cancellation/deletion marker needed to reject stale retries; never retain erased content in operation logs. created\_by on Evidence, Finding, Observation and Retest references Owner and is set by the server.

### Editing and archival

Allow editing client details, project details, session details, finding content and observation content. A finding's project and origin session are fixed. Do not replace evidence bytes, text bodies or captured URL/context; submit a new evidence item instead. Evidence title, description and tags may be corrected, recording the editor and time.

Archiving a client also archives its active projects. An archived project is read-only except for privacy deletion; viewing and printing remain possible. Unarchiving a client does not automatically reactivate its projects. Reject creation or edits against archived projects on the server, not only in the UI.

## 4\. Behavior and acceptance contract

### Capture and file storage — AC02

Accept one file per submission, up to **10 MiB (10,485,760 bytes)**. Accept PNG/JPEG only when server-side type detection and image decoding agree; limit decoded images to 25 megapixels. Reject SVG, HTML, executable files and unknown types. For File evidence, accept detected PDF or valid UTF-8 TXT only. Serve these as downloads; do not render PDFs or arbitrary files inline. No automated malware-free claim is made.

Before upload, show a reminder to remove secrets/personal data and confirm the selected project/session. Clipboard paste follows the same validation as file upload. If paste is unsupported, the file chooser remains available. An uploaded screenshot does not acquire the hub's URL or browser as if those describe the tested application.

The server assigns an upload operation ID and creates a Pending record before calling storage. Preserve that ID across retries. Validate the full file, compute SHA-256 over the submitted bytes and persist the expected hash, byte size and MIME type before the first provider write; these values are immutable for that operation. Upload outside the database transaction. Mark Ready only after provider reconciliation and guarded metadata finalization. Failed or uncertain attempts stay Failed/Pending with a retry action and cannot receive links. Reject a retry whose server-computed content identity differs from the stored operation with 409 Conflict; never overwrite the existing object.

If storage succeeds but database finalization fails, locate the original object by the recorded storage key. R2 putOnce uses conditional PUT (If-None-Match: \*) with server-generated SHA-256 metadata. On 412 Precondition Failed or recovery HEAD, compare the object's byte size and SHA-256 with both the original database operation and the retried bytes. Missing or mismatching metadata cannot finalize Ready; report a conflict and retain the item for reconciliation. Treat ETags as opaque. A HEAD 404 is only current absence and does not prove an earlier uncertain PUT will never commit. Prove these cases with fault injection; provide synchronous retry and an operator reconciliation command.

Enforce one active upload per owner with an atomic database lease, renewed throughout receiving, validation and storage work. A 60-second initial lease with a 15-second heartbeat is a tunable starting point; use database time and verify slow uploads. Pending/Failed rows without a live lease do not occupy the active slot. Each new attempt gets an increasing generation; every finalization checks the current generation, lease and non-canceled state in a short transaction. An expired or superseded attempt cannot mark Ready. Keep tracking any outstanding provider write even after its application lease expires.

Offer Discard for Pending/Failed uploads. Atomically record cancellation, invalidate its generation, prevent further PUTs and use DeletionPending while cleanup runs. Stop the local attempt, reconcile all outstanding provider writes, then delete any resulting object and temporary bytes. Do not release the quota reservation or mark Deleted merely because a request was aborted, timed out or HEAD returned 404: prove no tracked write can still commit and confirm removal. If the outcome remains uncertain, retain DeletionPending and the reservation with an operator-reconciliation action. Late completions cannot resurrect canceled evidence; repeat discard is idempotent and the operation ID is not reusable.

### URL context — AC02

Apply the same policy to URL evidence and screenshot URL context. Accept absolute HTTP/HTTPS URLs only. The default persisted context is **scheme \+ host \+ optional port \+ path**; always strip username/password, the entire query and the fragment. Empty paths normalize to `/`. Client preview shows the exact value that will be saved, and the server recomputes it from the submission.

Paths and hostnames can themselves be sensitive. The UI must allow replacing the path with `/` or omitting optional URL context, and must show a privacy reminder. This is deliberately limited sanitization, not a promise to detect all personal data. Store only the confirmed sanitized result. Raw submissions must not appear in request logs, error tracking, audit events or validation-error echoes. Optional capture time is user-supplied; upload time is generated by the server. Do not fetch submitted URLs.

### Findings and retests — AC03 / AC04

Create findings as Open. Severity choices: Critical (core workflow unavailable/no practical workaround), High (major impact), Medium (limited impact or workaround), Low (minor impact). Severity is the tester's assessment and is not a release decision.

| Operation | Starting state | Result | Required information |
| :---- | :---- | :---- | :---- |
| Request retest | Open | Awaiting Retest | Note explaining the reported fix/change or why another check is needed |
| Record Pass | Awaiting Retest | Verified Fixed | Retest session, notes, ready evidence |
| Record Fail | Awaiting Retest | Open | Retest session, notes, ready evidence |
| Record Blocked | Awaiting Retest | Awaiting Retest | Retest session, blocker notes, ready evidence |
| Reject | Open or Awaiting Retest | Rejected | Rejection reason; no evidence deletion |
| Reopen | Verified Fixed or Rejected | Open | Reopening reason; prior history retained |

All other transitions are rejected with no partial event/retest saved. A pass is the only route to Verified Fixed. Save a retest and its resulting status/event atomically. An incorrect historical retest is explained through a later event and, where needed, reopening and a new retest; it is not overwritten. Use a unique operation ID for retest and status submissions so a repeated request does not create duplicate events.

### Observations — AC05

Allow an observation with no evidence when it is explicitly a human note. Linked evidence must be Ready and from the same project. A screenshot can support a finding and an observation concurrently. Conversion of an observation into a finding is deferred; the owner may create a finding and link the existing evidence.

### Reports and retrieval — AC06

The report contains client/project names, description, testing context/instructions, selected session details, finding count by severity/status, full finding details, retest notes/outcomes, observations, and linked evidence. Include screenshot previews with captions, source/session context and timestamps; text evidence as escaped text; sanitized URL references; and authenticated download links for File evidence. Failed/pending unlinked uploads are omitted.

Default scope is the whole project and all statuses, with observations included. Optional session filtering includes a finding if its origin session or a retest session is selected; include its full retest history, clearly labeled. Include observations assigned to selected sessions. Project-wide observations with no session are included and labeled project-wide. Include all evidence linked to included records even if captured in another session, labeling its source session. Standalone unlinked evidence is available in the evidence list, not automatically included in the report.

Take one consistent database snapshot per report request. Print the generation time, selected scope, build/environment information and an explicit note that the report reflects saved state at that time. Regeneration may change the content; do not imply an immutable historical report. Include a human-readable warning for Deleted, DeletionPending or temporarily inaccessible linked evidence. Do not mark missing evidence as successfully embedded or discard the supported finding. Authenticated report rendering uses application-controlled evidence URLs; never expose bucket URLs or provider sharing links. Browser printing remains owner initiated and can create a local file outside the hub.

Initial retrieval is deliberately basic: client/project navigation; project evidence list filtered by session/kind; findings filtered by status/severity; observations filtered by category; case-insensitive title search within the selected project; newest-first pagination, 50 items per page. Advanced full-text, semantic and cross-project search are deferred.

### Access and deletion — AC07 / AC08

Every data-bearing application route, including images, downloads, reports and mutations, requires the provisioned owner. Public exceptions are the login flow and its CSRF bootstrap, non-sensitive health responses and non-sensitive static UI assets. Anonymous protected pages redirect to login; protected API/file endpoints return 401 without data or file bytes. NestJS owns authentication and authorization. Use an opaque PostgreSQL-backed session and a host-only HttpOnly/Secure/SameSite=Lax cookie with Path=/, password hashing and login throttling. Create/rotate sessions at login or an explicit browser auth endpoint; invalidate them on logout. Browser mutations, including login/logout and discard, require the allowed Origin and an X-CSRF-Token header. Authenticate and check CSRF before the multipart interceptor/parser writes or buffers uploads. Services enforce project consistency even when IDs bypass the UI. Database and R2 credentials remain in the API service; the bucket stays private.

Before evidence deletion, show the counts of affected findings, observations and retests. Require explicit confirmation. Move the item to DeletionPending, invalidate upload attempts and revoke application access immediately. Reconcile outstanding provider writes, remove the object and sensitive metadata, and confirm cleanup before marking Deleted. If removal or write reconciliation is uncertain, display incomplete deletion and retry the same operation; retain the quota reservation. Keep existing links pointing to a minimal tombstone so reports explain missing support. Do not automatically reject or close a finding because its evidence was deleted; no new links may target a tombstone.

Delete related previews and temporary uploads too. Sanitized logs and minimal status events may retain IDs/time/outcome, never erased evidence content. Document actual provider configuration, backup retention and restoration handling before real data; do not promise erasure from backups or provider retention. Keep R2 public access disabled and avoid retention locks that prevent required evidence deletion. Project/account-wide purge and configurable retention remain later-phase work; an operator must still be able to remove all project evidence needed for the initial engagement.

## 5\. UI, accessibility and limits

Use Next.js App Router with React and TypeScript. Render page structure on the server and use focused client components for forms, clipboard paste, upload progress and dialogs. Forms call the NestJS API; native links and an ordinary file chooser remain available. Provide labeled inputs, keyboard access, visible focus, meaningful image captions/alt text, status text in addition to color, an error summary linked to invalid fields, and announced asynchronous upload results. Move focus to the error summary on failure and back to the invoking control after a canceled dialog. Printing hides navigation/buttons and keeps evidence captions with their images where practical.

On invalid forms, preserve non-sensitive entered values; clear raw URLs and explain that the sanitized preview must be re-entered or confirmed. Do not persist an invalid partial finding. File inputs may need reselection after failure. Give errors that distinguish validation failure, expired login and temporary storage failure without revealing credentials or provider internals.

Initial capacity budget: 10 MiB/file, 25 megapixels/image, 1 GiB of stored or reserved file bytes, one owner and one active upload lease per owner. Dormant Pending/Failed records do not block the active slot but retain reservations while storage outcomes are unresolved. Reserve capacity atomically before receiving bytes, reconcile it to validated size and reacquire released capacity before a retry can write. DeletionPending objects count until cleanup and outstanding writes are resolved. Keep quotas and lease timing configurable. For 500 findings and 2,000 evidence items, target ordinary list/detail pages within 2 seconds and report metadata HTML within 5 seconds. Record actual results; measure external R2 transfers and browser image loading separately.

## 6\. Architecture, implementation tasks and interfaces

Selected architecture: one TypeScript monorepo with a Next.js web application, a NestJS API and PostgreSQL, deployed together on the confirmed VPS. Keep the API as a modular monolith. Start with synchronous, bounded evidence-storage operations and explicit reconciliation; a separate worker or queue is not a Phase 1 prerequisite.

### 6.0 Phase 1 Foundation

**Purpose and status:** establish a reproducible build, test and release path within Phase 1\. F01–F02 must pass before business-feature work; F03–F04 must pass before real client data. All are planned checks, not completed work. Repository documentation follows .github/docs/ (the guide’s /docs/ equivalent); ADRs use .github/docs/adr/ and audit evidence uses .github/docs/audit/.

**F01 — Containers and configuration:** create apps/web/Dockerfile, apps/api/Dockerfile, .dockerignore, compose.yaml, compose.dev.yaml, compose.test.yaml, .env.example and infra/nginx/default.conf. Use multi-stage builds; pin every external Dockerfile base image by immutable digest, install dependencies from the pinned lockfile, and run application containers as non-root users. compose.yaml describes production services with all application and third-party images pinned by digest, health checks, restart policies, private API/database ports and a persistent PostgreSQL volume; compose.dev.yaml adds local build/hot-reload mounts only. Keep production secrets and client data out of development. Acceptance: a clean checkout starts with documented prerequisites, CI rejects unpinned external base or production-service image references, CI boots production images through Nginx, and container recreation preserves a synthetic database record.

**F02 — CI and repository controls:** create .github/workflows/ci.yml and .github/workflows/release.yml, .github/CODEOWNERS, .github/pull\_request\_template.md and .github/dependabot.yml. Gate PRs on lint, types/OpenAPI consistency, unit/integration tests, current-slice BDD, browser smoke and security scans. Start with 80% line and branch coverage for implemented API auth/domain services; document exclusions, and require critical scenarios regardless of percentage. Block secrets, unresolved high/critical security findings and unreviewed license-policy violations. Generate an SBOM and record image digests for releases. Record the license policy/exceptions in the runbook. Publish tested images from trusted refs to a private GHCR package; untrusted PRs receive no deployment/R2 secrets. Acceptance: required status checks demonstrably block a failing PR; a release digest maps to its commit, tests and SBOM.

**F03 — Provisioning and secrets:** create infra/ansible/site.yml and infra/ansible/inventory.example.yml for repeatable supported-OS setup, Docker/Compose, operator SSH access, firewall, TLS renewal and service directories. Test actual Docker-published ports; only HTTPS/redirect and restricted administration are public. Use Ansible Vault for encrypted provisioning variables, with its key outside the repository; materialize runtime secrets outside the checkout in protected host files and grant read-only Compose-secret mounts only to the required service. Mounts do not encrypt host files; protect them and their backups. Acceptance: a second provision run makes no unintended changes, production has no source-code bind mounts, secret values are absent from images/browser bundles/logs, and auth, port isolation and credential rotation are checked.

**F04 — Release and recovery:** implement scripts/deploy.sh, scripts/smoke.sh, scripts/backup.sh, scripts/restore.sh and scripts/rollback.sh; document commands and evidence in .github/docs/runbook.md. The owner starts a release of the tested digest, drains uploads/pauses writes, takes a verified backup, runs migrations once and checks health plus a synthetic authenticated smoke flow. Revert the application only with a compatible schema; otherwise use the rehearsed recovery procedure. Configure external HTTPS monitoring and host/container disk, memory, error/latency, TLS-expiry and backup-freshness alerts to the owner. Record thresholds, backup destination/retention and recovery-time/data-loss targets. Acceptance: rehearse off-VPS restore, deletion handling after restore, failed-release recovery and alert delivery; record resource measurements before real use.

**Phase 1 delivery simplification:** use an isolated CI environment with synthetic data to smoke-test the same production image digests; provider contract checks use a separate private R2 test bucket. Use a controlled single-VPS release with a documented maintenance window. Ansible Vault plus protected runtime files replaces a dedicated secrets-manager service. Record these choices and their trade-offs in .github/docs/adr/015-phase1-delivery-profile.md.

**Deferred delivery facilities:** persistent staging, blue/green or canary rollout, traffic-ramp feature flags and a dedicated secrets-manager service. Revisit before shared-user operation or when availability/secrets-management requirements exceed this profile.

*Will be considered before Phase 4 or earlier if operational needs require; outside the initial Phase 1 infrastructure scope.*

**Deferred assurance facilities:** artifact signing and a full tracing/dashboard/SLO burn-rate platform. Phase 1 retains tested image digests, SBOMs, required CI, bounded logs, basic metrics and working alerts.

*Will be considered in later phases, before broader artifact distribution or operational complexity requires them; outside the initial Phase 1 infrastructure scope.*

### 6.1 Repository and working tool defaults

Use pnpm workspaces: apps/web for Next.js App Router; apps/api for NestJS with the Express adapter; packages/api-client for generated OpenAPI client/types; specs/features for Gherkin scenarios. Keep project documentation in .github/docs/, ADRs in .github/docs/adr/, and audits in .github/docs/audit/. Enable strict TypeScript. Keep auth, clients, projects, sessions, evidence, findings, observations, retests and reports within the API. The Foundation in section 6.0 supplies the build/deployment skeleton.

Use Prisma for PostgreSQL access and migrations as the working default. Choose supported, mutually compatible Next.js, NestJS, Node.js LTS, PostgreSQL, Prisma and test-tool versions when initializing the repository. Pin them with the lockfile and deployment images; verify the actual generated setup rather than assuming an unpinned latest release. These supporting-tool defaults can be revised with a documented reason without reopening the selected three-part stack.

### 6.2 Web/API boundary and private access

Expose one HTTPS origin through a reverse proxy: /api/v1/\* routes to NestJS; application pages and static assets route to Next.js. PostgreSQL and internal application ports are private. Run Next.js and NestJS as separate processes/containers, with no custom server combining the frameworks. Browser uploads and mutations go directly to the same-origin API.

NestJS owns runtime DTO validation, authorization, business rules, persistence, R2 access and report-scope calculation. Next.js owns presentation, interaction state and the printable view. Do not give Next.js a database client or storage credentials, or duplicate business rules in Server Actions. Server Components forward only the requesting owner's session cookie to the fixed internal API; never use a global privileged token or a caller-supplied upstream URL. SSR reads are session-read-only: no identifier rotation, cookie refresh or Set-Cookie propagation during rendering. Session issuance, renewal/rotation and logout use direct browser-to-NestJS /api/v1/auth/\* endpoints. NestJS remains authoritative if a Next.js route check is bypassed.

Publish an OpenAPI contract from the API and generate the web client/types from it. Validate DTOs at runtime with an allowlist and rejection of undeclared fields; use explicit conversion for IDs, enums and numbers. TypeScript types alone do not validate requests. Return stable error codes and field errors without raw URL submissions, secrets or provider internals. Keep API documentation private in production.

Render authenticated pages, report data and evidence dynamically with private/no-store responses and no shared result cache. Use ordinary \<img\> elements (or next/image with unoptimized) pointing to /api/v1/evidence/:id/content. Return Cache-Control: private, no-store, no-transform and X-Content-Type-Options: nosniff; authorize every request. Keep private evidence out of the default /\_next/image optimizer, public URLs and shared proxy caches. Public static UI assets may use immutable caching. Verify logout, direct-file requests and SSR reads against the same access boundary.

Trust only the actual ingress topology. NestJS uses explicit trusted Nginx addresses/subnets; trust proxy \= 1 is acceptable only after proving every relevant public request traverses exactly one restricted proxy and internal SSR reads cannot supply untrusted forwarding headers. Nginx must overwrite X-Forwarded-For, X-Forwarded-Proto and X-Forwarded-Host from trusted connection/canonical-host data. Keep API ports private; do not trust arbitrary forwarded headers arriving from the browser or forwarded by Next.js. Verify Secure-cookie issuance and login throttling through the deployed proxy.

For the upload location, explicitly set proxy\_request\_buffering off and proxy\_http\_version 1.1, keep proxy caching off, cap request size including bounded multipart overhead, and set receive/upstream timeouts. This lets NestJS guards reject before its multipart processing rather than after Nginx has spooled the complete body. Early rejection cannot promise zero network buffers; verify bounded proxy/API temporary storage and cleanup on rejected, chunked and disconnected requests.

### 6.3 Persistence, uploads and reports

PostgreSQL enforces the section 3 relationships, uniqueness and check constraints; use reviewed SQL migrations when Prisma cannot express a rule. EvidenceLink.project\_id and evidence\_id are NOT NULL; CHECK (num\_nonnulls(finding\_id, observation\_id, retest\_id) \= 1). Add composite foreign keys (project\_id, evidence\_id), (project\_id, finding\_id), (project\_id, observation\_id) and (project\_id, retest\_id) to their respective tables. Provide UNIQUE(project\_id, id) on each referenced table, including TestSession. Retest has NOT NULL project\_id with composite foreign keys to its Finding and TestSession; apply equivalent project/session constraints to Finding.origin\_session\_id and optional Evidence/Observation.session\_id. Preserve uniqueness per evidence/target using three partial unique indexes for non-null targets. Test all target types and rejected cross-project retests against real PostgreSQL. Keep atomic finding/retest events and a bounded API connection pool; web components never write around services.

Receive multipart uploads in NestJS only after authentication, Origin and X-CSRF-Token checks. Enforce one file, 10 MiB and bounded multipart fields while receiving; apply the section 6.2 proxy policy. Use a private temporary directory with bounded space, random names and cleanup on success, rejection, disconnect and restart. Check type/dimensions, then actually decode/validate the image with strict truncated/corrupt-input rejection, a 25,000,000-pixel limit and bounded decoder concurrency. Sharp with limitInputPixels: 25000000 and sequentialRead: true is the working choice; header checks alone are insufficient. Stream validation output to a bounded sink rather than collecting a full raw-pixel buffer. Hash and upload the unchanged submitted file, not decoder output. Measure total RSS/native allocations for worst-case accepted files; do not promise a fixed sub-15 MB footprint. Keep transactions short and outside R2 transfers; never proxy bodies through Next.js Server Actions.

The NestJS report builder creates a response DTO from one consistent PostgreSQL snapshot, including the selected scope, generation time and missing-evidence indicators. Next.js renders that response as authenticated HTML and a print stylesheet. Evidence retrieval remains separately authorized; browser printing is owner initiated. No PDF engine, permanent report artifact or background report worker is added to Phase 1\.

### 6.4 VPS deployment and operations

Use Docker Compose for local development and the initial single-VPS deployment: reverse proxy with HTTPS, production Next.js, production NestJS and PostgreSQL with a persistent volume. Nginx is the reverse-proxy default. Keep secrets out of images, the repository, browser bundles and logs; grant each service only the credentials it requires. Provision the owner through an operator command rather than public registration.

Build and test production images in CI outside the VPS; deploy pinned artifacts and run migrations once as an explicit release step. Use Next.js output: 'standalone', include public/.next/static assets as required and verify monorepo file tracing in the built image. Include health/readiness checks, graceful shutdown, a pre-deployment backup and recovery/rollback compatible with schema changes. Keep full builds and browser suites off production. Rotate Docker json-file logs (initial max-size: 10m, max-file: 3), bound Nginx logs and upload-temporary space, and retain only needed container images without pruning database volumes. Standalone packaging is no guarantee of image size or idle memory.

The 2 vCPU / 4 GB RAM / 32 GB SSD profile is an initial hypothesis for light single-owner use. Confirm purchased resources and measure RSS, CPU, disk and latency for the whole stack, including image validation and report rendering. Keep evidence in private R2 and backups off the VPS, with OS/database/log/image headroom. Tune container memory limits from measured peaks and leave host headroom; \--max-old-space-size=512 is only a candidate V8 old-generation heap ceiling, not a total-process memory limit. PostgreSQL starting candidates are shared\_buffers=512MB, work\_mem=8MB and max\_connections=30, with the API pool below that limit; validate combined usage since work\_mem may multiply per query/connection. Consider 2 GB swap only after disk/host review, never as usable application RAM. Redis, queues, local AI and a second full environment are not assumed.

Use one dedicated private Cloudflare R2 Standard bucket for evidence and a separate synthetic test bucket. Disable r2.dev/public-domain access; NestJS serves authenticated content rather than browser bearer URLs. Use bucket-scoped Object Read & Write credentials only in the API/operator environment, not account-admin keys. Record account, bucket, endpoint and jurisdiction before provisioning; an EU-jurisdiction bucket is the working preference for this engagement, subject to its actual requirements. Verify retention/deletion settings and current account prerequisites/costs; the design must not depend on free-tier pricing or assume configurable S3 versioning exists in R2. Google Drive remains the collaboration-document store.

### 6.5 Future MCP boundary

Design NestJS application services to accept an explicit authenticated actor and enforce authorization independently of HTTP controllers. A later MCP adapter should call those services or the authenticated API, never bypass them with direct database/object-storage access. MCP transport, client authentication, resources, prompts and tools remain outside Phase 1\. Any separately approved early post-MVP slice is read-only: it must omit create\_reasoning\_record and all domain writes, expose only Phase 1 data that actually exists, and enforce project authorization on every retrieval.

*Will be considered in Phase 5, or a separately approved post-MVP slice; outside Phase 1 scope.*

### 6.6 Ordered implementation work

Every implementation row follows section 7.1: tests/BDD, documentation and review accompany that row. Task 6 validates the completed system; it is not the starting point for test bindings or documentation.

| Order | Task and proposed paths | Observable result |
| :---- | :---- | :---- |
| 1 | Deliver Foundation F01–F02 (§6.0); initialize pnpm-workspace.yaml, package.json, apps/web/, apps/api/ and packages/api-client/; add apps/api/src/auth/ and scripts/provision-owner.ts with their tests; start .github/docs/adr/001-next-nest-postgres-vps.md and ADR-015 | Containerized development/CI, owner login/session/CSRF, protected routes, health checks, migrations and isolated PostgreSQL tests work with synthetic fixtures; F01–F02 evidence is recorded. |
| 2 | Add apps/api/prisma/schema.prisma and migrations/; client/project/session modules under apps/api/src/; corresponding routes and forms under apps/web/app/ | Owner can establish and revisit the testing context; invalid relationships cannot be saved. |
| 3 | Add evidence-storage.port.ts, r2-evidence-storage.adapter.ts, evidence.service.ts and url-sanitizer.ts under apps/api/src/evidence/; API upload/content/discard endpoints and web evidence screens | S1 capture, immutable bytes, SHA-256 recovery, renewable leases, stale-attempt protection, quotas, discard and private retrieval work. Add scripts/reconcile-evidence.ts and safe deletion handling. |
| 4 | Add apps/api/src/findings/findings.service.ts and reports/report-builder.service.ts; implement Next.js finding forms and authenticated printable report pages | Complete S1: evidence → finding → report is demonstrable. |
| 5 | Add apps/api/src/retests/ and observations/; complete evidence-kind validation, editing/archiving and filters in API services and web screens | Complete the remaining Phase 1 behavior without introducing later-phase models. |
| 6 | Run the complete AC01–AC08 regression and Foundation F03–F04 checks; complete real-engagement validation and reconcile .github/docs/project\_sheet.md, .github/docs/runbook.md and affected ADRs with the delivered system | Cross-slice regression, recovery and deployment evidence supports Phase 1 completion; test bindings, docs and reviews were already delivered with each preceding slice. |

NestJS application services authorize the actor and validate project ownership. Controllers, scripts and future adapters call these services rather than writing around them. A finding, its initial evidence links and creation event are one PostgreSQL transaction. Enforce unique links and operation IDs in the database as well as in application validation.

EvidenceStorage exposes asynchronous putOnce(storageKey, byteStream, mimeType, checksum) \-\> StoredFile, locate(storageKey) \-\> StoredFile\|null, read(providerFileId) \-\> readable stream, and delete(providerFileId). StoredFile includes provider ID, SHA-256 and byte size; delete is idempotent. R2 uses a stable opaque key per operation, single-object PUT with If-None-Match: \*, and x-amz-meta-sha256 set from the server hash. HTTP multipart receipt does not require provider multipart upload for these 10 MiB files. An existing object is accepted only after expected hash/size checks; HEAD absence never settles an outstanding write by itself. Guard all database finalization with operation state and current attempt generation. Inject the port through NestJS; keep provider types out of DTOs. Use a fake for most tests and a dedicated private test bucket for the adapter contract.

Decision rationale for ADR-001: VPS removed the shared-hosting constraint; Next.js/NestJS supports the TypeScript/API/QA portfolio goal and reusable authorized services for future MCP, at the cost of operating separate web/API applications. TypeScript is a project preference, not an MCP requirement. ADR-004 records private R2 Standard, avoidance of personal Drive owner-token dependency, conditional writes, SHA-256 recovery and deletion semantics. Other candidate ADRs cover first-class evidence, single-owner access and submitted-source immutability. No repository ADR, application code or deployment is claimed to exist from this specification revision.

### 6.7 Implementation references

Implementation references: Next.js cookies, private images and standalone output; NestJS validation/uploads/testing; Express proxy trust; Nginx request buffering; Cloudflare R2 S3 compatibility, consistency, credentials and jurisdiction; PostgreSQL constraints; Sharp constructor limits; Node.js heap options. Use the official sources linked below and pin compatible supported versions when implementation starts. These documents establish API behavior, not this application's measured performance.

Next.js: [https\://nextjs.org/docs/app/api-reference/functions/cookies](https://nextjs.org/docs/app/api-reference/functions/cookies) · [https\://nextjs.org/docs/app/api-reference/components/image](https://nextjs.org/docs/app/api-reference/components/image) · [https\://nextjs.org/docs/app/api-reference/config/next-config-js/output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)

Proxy: [https\://expressjs.com/en/guide/behind-proxies/](https://expressjs.com/en/guide/behind-proxies/) · [https\://nginx.org/en/docs/http/ngx\_http\_proxy\_module.html\#proxy\_request\_buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_request_buffering)

R2: [https\://developers.cloudflare.com/r2/api/s3/api/](https://developers.cloudflare.com/r2/api/s3/api/) · [https\://developers.cloudflare.com/r2/reference/consistency/](https://developers.cloudflare.com/r2/reference/consistency/) · [https\://developers.cloudflare.com/r2/api/tokens/](https://developers.cloudflare.com/r2/api/tokens/) · [https\://developers.cloudflare.com/r2/reference/data-location/](https://developers.cloudflare.com/r2/reference/data-location/)

Database/runtime: [https\://www\.postgresql.org/docs/current/ddl-constraints.html](https://www.postgresql.org/docs/current/ddl-constraints.html) · [https\://sharp.pixelplumbing.com/api-constructor/](https://sharp.pixelplumbing.com/api-constructor/) · [https\://nodejs.org/api/cli.html\#--max-old-space-sizesize-in-mib](https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-mib)

Foundation references: Docker Compose production configuration; multi-stage builds; Compose secrets; Ansible Vault; GitHub protected branches; Docker SBOM attestations and GitHub Container Registry. Recheck against the pinned implementation tools.

[https\://docs.docker.com/compose/how-tos/production/](https://docs.docker.com/compose/how-tos/production/) · [https\://docs.docker.com/build/building/multi-stage/](https://docs.docker.com/build/building/multi-stage/) · [https\://docs.docker.com/compose/how-tos/use-secrets/](https://docs.docker.com/compose/how-tos/use-secrets/)

[https\://docs.ansible.com/projects/ansible/latest/vault\_guide/index.html](https://docs.ansible.com/projects/ansible/latest/vault_guide/index.html) · [https\://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) · [https\://docs.docker.com/build/metadata/attestations/sbom/](https://docs.docker.com/build/metadata/attestations/sbom/)

[https\://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

## 7\. Acceptance and test plan

Keep the existing eight Gherkin feature files and AC01–AC08 intent; the baseline has 46 scenarios before the new refinements. Bind ordinary domain and validation scenarios through Cucumber.js TypeScript steps to NestJS services or HTTP/Supertest, with isolated real PostgreSQL and a fake storage adapter. Keep Vitest/@nestjs/testing for targeted unit/integration coverage. Use Playwright only for @smoke/@browser scenarios that need a browser, including the real login → upload → finding → report journey. Avoid duplicate browser execution of every field rule. Preserve existing names/tags; add the recovery/security/constraint cases below and update the inventory when feature files are edited. No executable suite or new feature-file edits are claimed by this document change; measure runtime rather than promising all cases in seconds.

Disposable PostgreSQL tests: use a dedicated compose.test.yaml and scripts/test-db.sh (up/reset/down) locally and in CI, with a unique Compose project per run/job and a test-only volume. Use the same pinned PostgreSQL image digest as production, apply actual migrations and seed only synthetic fixtures; reset database state between independent test cases. Run scoped teardown after success or failure, with cleanup hooks for cancellation, removing only that run’s test containers, network and volume. Never reuse or delete development/production volumes. Keep the fake storage adapter for ordinary tests and the separate private R2 bucket for provider contract checks. Acceptance: fresh runs reproduce the same fixture state, parallel jobs stay isolated, and an induced test failure leaves no run-owned database resources after teardown.

| Acceptance ID | Required outcome | Feature file |
| :---- | :---- | :---- |
| AC01 | Valid client/project/session context and safe archive behavior | `engagement-context.feature` |
| AC02 | Validated evidence, sanitized context and recoverable uploads | `evidence-upload.feature` |
| AC03 | Valid project-owned findings and reusable evidence links | `finding-management.feature` |
| AC04 | Explicit lifecycle and retained retest history | `retesting.feature` |
| AC05 | Lightweight observations and shared evidence | `observation-management.feature` |
| AC06 | Useful, accurately scoped project reports and basic retrieval | `testing-report.feature` |
| AC07 | Private application and file access | `private-access.feature` |
| AC08 | Explicit evidence deletion with honest failure reporting | `evidence-deletion.feature` |

BDD files live under `specs/features/`. Implement behavior tests at the lowest useful level; do not turn every field rule into a slow browser test.

| Level | Named cases to implement |
| :---- | :---- |
| Unit | url-sanitizer.spec.ts: removes credentials/query/fragment and rejects non-HTTP schemes. evidence-validator.spec.ts: MIME, byte/pixel and UTF-8 limits. finding-lifecycle.spec.ts: allowed transitions, pass-only verification and required reasons. report-scope.spec.ts: origin/retest session inclusion and project-wide observations. |
| Integration | evidence-upload-recovery.spec.ts: uncertain PUT/412/HEAD, DB failure after storage, SHA/size mismatch against original operation, renewable lease on slow transfer, stale-generation completion, dormant Pending, and cancel-before-late-PUT. evidence-link.spec.ts: all three composite targets, duplicate no-op and cross-project retest finding/session rejection. retest-transaction.spec.ts: atomic events/status and idempotency. evidence-deletion.spec.ts and storage-quota.spec.ts: immediate denial, delayed writes, repeat discard, reservations and restore cleanup. auth-api.spec.ts: read-only SSR sessions, CSRF rejection before multipart, invalid DTOs and protected content. report-snapshot.spec.ts: consistent reads. Use actual PostgreSQL migrations/constraints. |
| Browser | Production-build @smoke journey through Nginx: login → upload → finding → report. Use @browser for clipboard fallback, focus/input preservation, retry/discard and print preview. Check SSR does not rotate cookies, spoofed forwarding headers do not bypass controls, invalid upload auth/CSRF is rejected early, and private images remain inaccessible after logout and bypass /\_next/image/shared caches. |
| Manual/operational | Keyboard/visual/print checks; private R2 contract tests (conditional create, uncertain write, SHA/size checks, idempotent delete, credential denial); proxy/API temporary-file cleanup including chunked uploads; off-VPS restore and post-restore deletion handling; worst-case image decoding and full-stack resource measurements; real-engagement validation. |

Required CI starts in Foundation F02 and grows with each slice: formatting/lint, strict types and OpenAPI consistency, unit/integration coverage, current-slice BDD, production builds, browser smoke, static/dependency/container security and secret/license checks. Release jobs retain the SBOM and tested image digests. Test migrations against isolated PostgreSQL; use protected credentials only for dedicated provider contract tests. CI failure blocks merging; parsing Gherkin alone does not satisfy acceptance.

### 7.1 Mandatory workflow for every feature slice

**Definition of Ready:** select one small Phase 1 outcome with acceptance IDs, relevant Gherkin scenarios, exact affected paths/interfaces, named tests, risks and UI accessibility/security/performance checks. Establish test fixtures and dependencies. Give the implementation context only this slice and relevant ADRs; omit later-phase material.

**Build and review:** PLAN → DRAFT → SPECIFY → EXECUTE → AUDIT → INTEGRATE. Bind the relevant scenarios and write meaningful failing behavior tests before implementation, then use Red → Green → Refactor at the lowest useful level. Infrastructure changes use executable configuration/recovery checks. Run relevant browser/manual checks for UI changes. Each slice receives a separate review pass, fixes and recorded owner disposition; tests, documentation and review are never postponed to the final task.

**Audit scope and safety:** use the reusable [Audit prompt](https://docs.google.com/document/d/14PZ6hYQ0GPVgU3xV-qmy23v7RoNsyuW2CJAm1lsIC6s) for the areas relevant to each slice; section 8 requires the complete applicable review before real client data. Keep audit execution to inspection, safe verification and reporting; fixes and deployment are separate implementation/release tasks. Start read-only and verify effective targets, credentials and side effects before running checks. Production write checks require explicitly authorized synthetic targets; restore checks require an authorized isolated destination and cleanup. Apply the prompt’s full safety rules without duplicating them here.

**Audit evidence:** preserve each run under .github/docs/audit/ using the Audit report/index conventions. Identify the reviewed commit, relevant uncommitted changes and image digest; verify deployed versions/configuration separately and record drift. Include a coverage matrix and sanitized validation ledger with criterion, environment, method/command, tool version, observation time, result/exit code and evidence link. Use PASS, FAIL, NOT VERIFIED and NOT APPLICABLE with reasons, distinguishing documentation/static review, CI and runtime evidence. Retain stable finding IDs; separate confirmed defects, verification gaps, accepted limitations and optional improvements. Reconcile prior findings and reverify fixes.

**Definition of Done:** acceptance scenarios and required CI/coverage/security gates pass; the relevant production-image smoke check and manual QA pass; findings that block the slice’s acceptance or required gates are resolved and reverified; remaining findings have a recorded type, state and owner disposition. Update .github/docs/project\_sheet.md and affected ADR/runbook sections in the same PR; record test evidence, risks and rollback notes in the PR template. Use small Conventional Commits; version releases with SemVer and update .github/docs/CHANGELOG.md. Verify branch-protection support and enforce required checks; the solo owner records the review/sign-off without requiring an unavailable second human reviewer. A merged slice is not a verified production release; F03–F04 and the section 8 audit verdict gate real-data deployment.

After merge, synchronize affected Drive planning/as-built sections to the merged commit and mark remaining proposals explicitly. At phase completion, review actual test results, timings, incidents and user feedback before planning the next phase; apply the handoff cleanup rule only after preserving decisions and unfinished work.

## 8\. Readiness, validation and remaining prerequisites

Before business-feature work, satisfy Foundation F01–F02 and the slice Definition of Ready. Before real data, satisfy F03–F04 and prove owner-only HTTPS, read-only SSR sessions, proxy/CSRF boundaries, private R2 credentials, conditional-create/checksum recovery, renewable leases and cancellation/deletion safety. Keep actual resource limits, deployment, alerting, backup/retention/restore, migration, cleanup and reconciliation procedures in .github/docs/runbook.md. Rehearse with synthetic data, including a late provider write after cancellation and deletion after restore.

**Audit release decision:** before real client data and when confirming Phase 1 completion, apply all applicable Audit areas to the release baseline, reusing evidence that still matches it. Record separate code/artifact and production conclusions where evidence differs. A confirmed blocker means NO-GO; otherwise missing essential evidence means INSUFFICIENT EVIDENCE. CONDITIONAL GO requires all essential checks to pass and the owner to explicitly accept bounded conditions, with mitigations and closure checks recorded. GO requires essential checks to pass with no blocking conditions. Only GO or an explicitly accepted CONDITIONAL GO permits real-data use. Recording a blocker in the backlog does not clear it, and unknown essential controls cannot be accepted away. Explain material NOT VERIFIED items and distinguish optional gaps from missing essential proof.

VPS hosting and private R2 Standard evidence storage are the selected direction. Actual server resources, domain/TLS, operator access, R2 account/buckets/jurisdiction/credentials, and the first representative engagement remain prerequisites. Google Drive stores planning documents and handoff; moving those documents does not provision application storage. No delivery date or unmeasured capacity guarantee is committed.

Phase 1 is complete only when AC01–AC08 are implemented and verified, the owner can complete a real engagement using the hub for the core workflow without a separate defect spreadsheet or screenshot folder, and a later return can locate a finding, inspect its source evidence and understand its retest history. Record the engagement, test evidence, linked audit run and final verdict, unresolved limitations and user feedback in the project sheet; update implemented sections to as-built status. Retain the roadmap as the strategic source and revise this draft as evidence from implementation warrants.