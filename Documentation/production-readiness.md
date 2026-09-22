# Levoks implementation and release readiness

The active requirement ledger is [completion-matrix.md](completion-matrix.md). The user confirmed `levoks.md` is the original PDF converted to Markdown. Prior passing checks establish only their tested subsets; every documented feature is tracked separately with execution and error-handling acceptance criteria. Implementation continues through the internal gaps; credentials block only the corresponding live integration.

Stage 1 adds explicit generated backend workflows and the Property Inspector controls for queries, transactions, policies, roles/permissions, conditions, bounded collection loops, error branches, transforms, functions and responses. `npm run test:integration` runs generated workflow/model code against a real temporary MongoDB replica set; tenant/owner isolation and transaction rollback passed. Full feature status remains PARTIAL pending the remaining semantics and UI/execution coverage recorded in the matrix.

Stage 2 adds a durable encrypted MongoDB secrets store, authenticated metadata/write/delete/rotation endpoints, and Project secrets UI. Values use AES-256-GCM with owner/project/name-bound authenticated data and per-record key IDs. Browser APIs never return saved values. Backend inspectors now reference secret names instead of accepting plaintext into project state. Real MongoDB tests passed for identity/project isolation, ciphertext storage, optimistic version checks, tampering and key rotation. Configure a server-only `LEVOKS_SECRET_KEYS` JSON keyring (base64 random 32-byte keys) and `LEVOKS_ACTIVE_SECRET_KEY`; retain old keys until records have been re-encrypted. The Google Cloud Secret Manager adapter and automated host secret injection are still missing, so this is not the complete secret-management requirement.

Browser verification is available through an isolated workspace Chromium installation. Autosave/reload/import/full ZIP and inspector → IR → emitted source passed. Generated backend HTTP verification also passed with actual Express, JWT middleware and MongoDB. Coverage does not yet establish complete editor or provider acceptance.

Stage 3 adds [durable GitHub Connections](github-operations.md): encrypted authorization, repository/branch discovery and creation, managed-file review, remote history, an authenticated versioned queue, and a separately supervised MongoDB worker. Saved cloud revisions can be committed every five minutes after the editor closes. The worker enforces leases, bounded retries, head conflicts and non-force updates; recoverable lost acknowledgements are identified by operation ID, parent and file hashes. Real MongoDB concurrency/restart tests and provider contract tests passed. Live GitHub authorization and pushes remain unverified; GitHub App/OAuth repository access and automatic token refresh are still internal gaps. Scoped PAT replacement is implemented.

Stage 4 adds generated server-side identity sessions with hashed rotating refresh tokens, replay-family revocation, absolute/idle expiry, session inventory/revocation, logout-all and password-change invalidation. Identity-service bindings in the Authentication inspector generate live introspection in resource services and Compose service origins. Real HTTP tests start two generated Express servers against separate MongoDB databases and verify that refresh replay and password changes revoke access in both. New templates expose the corresponding endpoints; existing templates need those endpoint blocks added. Email verification/recovery now use single-use hashed challenges and an encrypted durable outbox with a separate Resend worker. The generated responsive account UI and same-origin API gateway pass real Chromium lifecycle tests. See [identity-operations.md](identity-operations.md) for runtime settings and the live-email gate. Standalone JWT resource services without an identity binding still do not enforce revocation.

This document describes the implementation in this working tree. `levoks.md` remains the product vision. Levoks now has a connected editing, persistence, generation, and delivery workflow, but the complete vision is **not production complete**. In particular, live integrations, browser acceptance testing, application authorization, and backend execution beyond the supported subset remain release gates.

## Implemented workflows

| Area                | Current behavior                                                                                                                                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace           | Versioned, bounded, runtime-validated project document containing all pages, global elements, backend services, routing, and optional edited source.                                                                                                                                                      |
| Saving              | IndexedDB autosave after editing pauses, visible save/error state, manual save, project switch flushing, and revision checks that reject overwriting another tab's changes. Up to 20 checkpoints per project.                                                                                             |
| Recovery            | Project list, checkpoint restore, JSON import/export, and recovery from a save conflict after downloading the current working copy. Browser storage can still be cleared or evicted; keep independent backups.                                                                                            |
| Cloud projects      | Optional authenticated MongoDB saves and restores, scoped to the signed-in owner with revision conflicts. Cloud sync is explicit; browser autosave does not imply a cloud backup.                                                                                                                         |
| Canvas              | Existing visual editing, pages and routes, nested templates, global elements, shortcuts, history, and uploaded raster images. Uploaded assets are inline and limited to 1 MB each within a 5 MB project document.                                                                                         |
| Routing and IR      | All-page flow resolution, global element flows, dangling connection cleanup, and actionable compiler diagnostics. Form inputs map to request fields by name; numbers and checkboxes preserve their types. URL parameters consume matching form fields.                                                    |
| AI                  | Hugging Face and OpenRouter bring-your-own-key requests. Visual proposals pass schema and graph validation, are reviewed before applying, and preserve a checkpoint. Source proposals use a separate review path. Cancellation and stale-proposal checks prevent accidental application over newer edits. |
| Source              | Searchable file list, editable generated text, persisted source overrides, and an explicit regeneration boundary after canvas changes. Arbitrary source cannot be converted back into the visual IR.                                                                                                      |
| Export              | Full multi-page Next.js frontend, supported Express services, Docker artifacts, environment examples, visual project JSON and resolved IR in one ZIP. Unsupported configurations block delivery instead of silently disappearing.                                                                         |
| GitHub              | Connections stores encrypted scoped PAT authorization, repository/branch settings, queue state and recent results. Discovery/setup, file-change review and explicit queued commits are implemented. A standalone worker discovers saved cloud revisions for opt-in five-minute commits independently of the browser. Remote-head conflicts pause work; updates are non-force and managed-path-only. |
| Deployment          | Vercel frontend preview deployment, required public API origins, queued/building/ready/error status, and a link when ready. Express services and MongoDB require separate hosting.                                                                                                                        |
| Identity generation | Auth templates generate bcrypt registration/login, revocable server-side sessions, single-use refresh rotation, session inventory/revocation, password change and logout-all. Resource services can select an identity service for live session checks. Verification, password recovery, generated account UI and encrypted email delivery are implemented and locally tested. Alternate strategies, administrative lifecycle and live provider verification remain incomplete. |
| CRUD generation     | Explicit endpoint/model binding and workflow queries support multiple models, bounded reads, scoped policies and transactions. Legacy inferred CRUD remains for simple templates. Field validation, operator rejection, CORS, rate limiting and graceful shutdown are emitted. Aggregate queries and relationships remain incomplete. |

Preview is a design simulation. It does not execute a deployed database or prove backend correctness. Source and AI output are not executed in the Levoks server, but building or deploying an export executes that project's build scripts and code. Review the source before delivery.

## Run Levoks

Use Node.js 22 or later and the committed lockfile:

```sh
npm ci
npm run dev
```

Local editing, saving, JSON backup, and ZIP export work without provider credentials. Copy `.env.example` to `.env.local` when enabling OAuth or cloud storage. Configure `NEXTAUTH_URL`, a randomly generated `NEXTAUTH_SECRET`, and the selected OAuth provider's client ID and secret. Register `/api/auth/callback/github` or `/api/auth/callback/google` as the callback on the Levoks origin. Set `MONGODB_URI` with a database name to enable cloud projects.

AI and Vercel tokens currently remain in component memory for the current tab. GitHub Connections encrypts repository credentials on the server, and clears the input after connecting. GitHub login does not grant repository write access. Use a separate fine-grained token scoped to the intended repository with Contents read/write permission. Connections can create a private repository or branch, and initialize an empty repository. Run `npm run worker:github` with the same database and vault keyring as the web server; see [worker configuration and recovery](github-operations.md). Queued snapshots and saved cloud revisions persist after the tab closes; unsent local edits do not.

Declared backend secret fields are removed from saved/exported snapshots and replaced with configuration placeholders in generated services. This is not a general secret scanner: credentials pasted into ordinary source text or content are not automatically identified. Do not embed them there.

Production editor builds use `npm run build` and `npm start`, or the root Dockerfile, which uses standalone Next.js output and a non-root runtime user. Provide configuration at runtime through the host's secret manager. Put HTTPS and appropriate request limits in front of the service. Process-local provider rate limiting is not a distributed abuse-control system. OAuth callbacks and MongoDB access must be exercised in the actual target environment.

## Run and deliver an exported application

1. In `frontend/`, install dependencies, copy `.env.example` to `.env.local`, and run `npm run dev`. Set each server-only `API_ORIGIN_<port>` to its backend origin and `APP_ORIGIN` to the frontend public origin at runtime. The generated same-origin gateway forwards only declared application routes and the selected identity cookies.
2. In each `backend/<service>/`, configure its environment example. Authenticated services require a cryptographically random `JWT_SECRET` of at least 32 characters. Configure `CORS_ORIGINS` to the exact frontend origin. Do not use wildcard credentialed origins.
3. The generated backend Compose file starts MongoDB and services for local development. It does not provide a production database backup, replica set, secret manager, TLS, or operational monitoring.
4. Build the frontend with `npm run build`, or build its Dockerfile. Supply `APP_ORIGIN` and `API_ORIGIN_<port>` to the running frontend process/container; origins no longer need to be bundled into browser code.
5. Vercel delivery publishes only `frontend/`. Deploy backend containers separately, then supply their HTTPS origins in the Ship panel. Test the generated gateway and Secure cookies on the final HTTPS domain. Separately supervise identity email workers using the configuration in [identity-operations.md](identity-operations.md).
6. Generate and review lockfiles for every exported package, audit dependencies, and commit the lockfiles before release. The export contains package manifests; its initial Docker build resolves a lockfile when one is absent, so dependency resolution is not reproducible until a reviewed lockfile is retained.

Workflow queries enforce explicitly configured role, permission, owner and tenant policies using the authenticated principal. Legacy inferred CRUD does not automatically enforce those policies. Identity sessions now revoke on logout, refresh replay and password change; bound resource services check that state through the identity service. Password recovery, email verification and account UI now have real local runtime/browser evidence. Administrative lifecycle, tenant membership and coverage of every access path remain internal release work. Generated session cookies use HttpOnly, Secure in production and SameSite=Lax. The exported Next.js gateway handles same-origin transport with service-specific cookie names and an endpoint allowlist.

## Verification

```sh
npm run check
npm run test:integration
npm run test:e2e
npm run test:generated-e2e
npm run build
npm audit --audit-level=high
node --import tsx scripts/generate-fixture.ts
node node_modules/next/dist/bin/next build .verification/frontend
```

The baseline 22 tests are retained. Added suites exercise backend program generation/execution, managed-file hashing and GitHub operation recovery. Real MongoDB suites execute generated Express queries and transactions, encrypted secret storage, and durable GitHub queue concurrency/recovery. Playwright executes the editor in real Chromium. Provider contract tests use controlled HTTP responses and are explicitly not live GitHub/Vercel/AI verification. The matrix records the tested subsets and remaining acceptance work.

The standalone production server returned HTTP 200 for the editor and provider discovery, and HTTP 401 for unauthenticated cloud project access, with a temporary runtime auth secret. Security response headers were present. Without a production auth secret, NextAuth correctly refused the auth request. The local environment file was removed from Git tracking while retained on disk.

The root production build and exported two-page frontend build were exercised in earlier stages; rerun after changes. The generated backend package now overrides vulnerable transitive `qs` versions with `>=6.16.0`; its separate dependency installation reports zero advisories. ESLint warnings remain in existing editor code. Browser verification covers a limited set of workflows; comprehensive visual/accessibility acceptance remains. Docker is unavailable. OAuth, cloud saving through real sign-in, AI responses, GitHub pushes and actual Vercel deployments remain unverified with live credentials.

## Remaining product and release work

- Complete backend relations, remaining loop/function scopes, advanced aggregation beyond the bounded grouped-metric implementation, and richer typed response-to-view bindings. The explicit workflow subset is implemented and tested; unsupported combinations report export errors. The chat template is still an architecture starter, not a functioning real-time system.
- Complete authorization coverage and identity lifecycle, add the specified cloud secret-manager adapter and host injection, and isolate generated-code execution.
- Add queues, schedules, real-time collaboration, WebSocket execution, payments and verified webhooks, transactional notifications, object storage, and caching as tested platform capabilities.
- Finish the remaining advanced frontend acceptance: arbitrary breakpoints, nested components/structural overrides, transformed grouping/vector editing, cross-page/cross-canvas history, full property/export parity and live-data widgets. Fixed breakpoint editing, linked libraries, Bézier authoring, multi-track motion and executable basic widgets now have the continuation evidence below.
- Add a sandboxed IDE/runtime preview, source-to-IR reconciliation, incremental/streaming AI changes, stronger generated-code analysis, and cost controls.
- Add durable asset storage, background sync, collaboration conflict resolution, and account/team project permissions. Local IndexedDB is not a disaster-recovery strategy.
- Extend hosting to backend orchestration, domains/TLS, environment management, logs, rollbacks, and health checks. Finish GitHub App/OAuth authorization and verify the durable worker against a live test repository.
- Implement actual plans, usage metering and billing. Existing profile information is informational, not a billing integration.
- Expand real browser/accessibility and real-database concurrency coverage; run live provider tests, load tests, monitoring/alerting and backup restoration drills before a production launch.

These are explicit implementation boundaries, not evidence that the full vision has shipped.

Stage 5 adds [configured health readiness](observability-operations.md). Health Check inspector settings compile into real database/service probes, bounded timeouts, shared concurrent probes, cache policy, readiness/liveness separation and shutdown draining. Real MongoDB/HTTP tests and the editor inspector → reload → source/ZIP browser workflow passed. Exported Docker health commands and Compose dependency origins are emitted; Docker execution, storage-specific probes and full deployment health gates remain unverified/incomplete.

Stage 5 also implements Error Handler classifications/response rules, metadata-only request/error logging and scoped durable Audit Log start/outcome records with retention and fail-closed controls. Generated JWT/Express/MongoDB verification and all three inspector persistence/export checks pass. Business-event transaction atomicity, crash reconciliation, background-event auditing and hosted log operations remain internal gaps; see [observability guarantees](observability-operations.md).

Atomic audit follow-through: workflow Transaction blocks now write audit events using their MongoDB transaction session when enabled in Audit Log. Real replica-set tests verify joint commit and rollback in both failure directions. Standalone CRUD/custom code and HTTP completion reconciliation remain separate internal requirements.

Stage 6 adds [incremental AI proposal controls](ai-operations.md): bounded IR patches with preconditions, affected-field review, atomic schema/graph/compiler validation and stale checks that include project identity/name. Input bytes are checked before a provider request, output tokens are capped, and reported usage is displayed. Real browser review/save tests use controlled model output; live inference, durable budgets and source analysis remain unfinished. Streaming is now implemented with bounded parsing, cancellation, final validation and HTTP/browser regression coverage.


## UI quality stage - 2026-09-20

The active priority is now the dedicated UI/UX pass. [UI quality evidence](ui-quality.md) records the per-surface audit, screenshots, interaction checks, keyboard model and remaining internal work. The shared design rules are in [DESIGN.md](../DESIGN.md).

Implemented this stage: central graphite/violet editor tokens; coherent header, tools rail, sub-tray, inspector and dock; readable canvas onboarding; honest save states at narrow widths; screen presets and off-artboard visibility; group movement/clipboard/alignment with undo; context-aware shortcuts and help; accessible page and context-menu actions; shared canvas navigation; movable persisted backend services; source tabs/gutter/status; a movable non-modal AI proposal panel; consistent Connections/Deploy surfaces and an explicitly labelled design preview. New projects default to the specified 1920x1080; imported/saved project dimensions are retained. Selection, zoom, clipping and panel preferences are editor state and do not contaminate application IR. Optional backend service position is validated project layout data.

Browser QA caught and fixed an AI rename bug: applyDesign previously preserved the old name even after accepting a name patch. Accepted names now persist through the same checkpoint/save boundary, with stale-proposal protection retained. It also caught duplicate accessible labels, clipped footer controls, zoom-scaled onboarding, and canvas framing occurring before asynchronous project restore. Pointer cancellation, final drag samples, group paste selection and locked context-menu actions were corrected.

Verification: 42 unit tests; 10 real Chromium editor workflows; the generated Next.js/Express account workflow in Chromium; root and exported two-page Next.js production builds; two generated backend build checks; dependency audit with zero advisories. The integration run passed 8 of 9, with identity service startup reaching the existing 10-second wait while builds ran concurrently; that unchanged test passed in isolation. This scheduling sensitivity is recorded rather than hidden by weakening assertions. Docker is unavailable on this host, so Docker image/runtime acceptance remains unverified. Live GitHub, AI and Vercel credentials were not exercised. Lint has zero errors and 50 warnings, mostly existing legacy editor/codegen issues.

At the end of that earlier stage, advanced design tools, graph wiring, conversations and IDE tooling remained open. The September 21 continuation below supersedes those implementation gaps where it provides evidence; full specification acceptance remains incomplete. The latest request keeps these UI priorities ahead of unrelated backend expansion. After UI acceptance, resume generated-source analysis/reconciliation, background services/assets, deployment orchestration and the identity/authorization boundaries already recorded above.


## Frontend continuation — 21 September 2026

See `ui-quality.md` for the current advanced-editor evidence. The new IR fields (`responsive`, `vector`, `motion`, component references, project `tokens`, `components`, and `assets`) are optional for compatibility, validated on restore/import, included in persistence and dirty tracking, and consumed by frontend generation. Token deletion freezes references, component publication preserves wired node IDs and local overrides, and image deletion freezes placed content. Vector coordinates/keyframes are finite and bounded; nested repeater output is bounded before generation.

Completed implementation stages now cover advanced design controls, keyboard layers/routing, resizable panels, executable basic widgets, source syntax diagnostics, AI conversation/focus controls, project asset libraries and an isolated generated-HTML frontend preview. These stages do not establish full-stack runtime/deployment readiness. In particular, semantic analysis/source reconciliation, arbitrary server-side preview, hosted asset management, browser-wide identity/provider lifecycle, orchestration and live provider acceptance remain governed by the existing boundaries. Final verification results are tracked in the UI evidence document; no prior tests have been removed or weakened.


The workflow/grouping continuation adds executable service graph editing (including cycle errors and branch-reference cleanup), stable-ID responsive grouping, correct global ordering, pointer-mode cycling and shared primitive-shape export. Backend block `position.placed` is optional UI metadata preserving intentional placement at the origin; older projects retain automatic layout. The latest exported Next.js production frontend passed actual browser execution for widgets, responsive CSS, SVG and reduced motion. This is separate from the editor's isolated HTML preview and does not establish an isolated full-stack preview service. See the current verification section in `completion-matrix.md`; an attempted fresh registry audit failed to reach the advisory endpoint, and Docker remains unavailable.


## Production recovery and scoped aggregation — 22 September 2026

The active scope is again the entire product. Shared project history now restores UI, pages/settings, backend blocks/services and routing together. Page navigation preserves history; deleting a service/page/element and undoing restores its routing links. Backend/routing drag operations commit as one change and cancel on interruption. History is session-only and limited to 50 entries; importing/opening/replacing a project resets it. Existing durable checkpoints remain the recovery path after a browser restart. This does not yet unify manual source text, reviewed AI application and persistent collaborative history.

Endpoint policy inheritance is validated against every reachable query model. Ownership/tenant field collisions and missing model fields now fail closed in the generated runtime; no policy silently overwrites an earlier scope. All existing CRUD and identity boundaries elsewhere in this document still apply.

Query aggregation now provides count/sum/average/min/max metrics, optional scalar grouping, sorting and bounded results through the Inspector, IR and generated runtime. Authorization filters run before aggregation. Mongoose does not automatically cast pipeline stages, so the emitted runtime casts the scoped filter with the model before constructing the pipeline; sessions/deadlines are retained and disk spilling is disabled ([Mongoose 7 aggregation API](https://mongoosejs.com/docs/7.x/docs/api/aggregate.html)). Real Mongo replica-set tests verify ownership, tenant isolation, typed ObjectId matches and execution inside transactions. Arbitrary aggregation stages, joins, expressions and write stages are not supported.

A fresh root dependency audit succeeded with zero advisories (`production-audit.json`), resolving the earlier registry-access verification blocker. Docker and authorized live-provider acceptance remain separate gates. See the current completion matrix for full verification results and outstanding internal requirements.
