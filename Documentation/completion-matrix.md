# Levoks completion matrix

Sources: `levoks.md` (the user-confirmed conversion of the original PDF), `production-readiness.md`, and the current code. This is an implementation ledger, not a launch declaration. Baseline audit: 2026-09-13.

COMPLETE means UI → persisted state → validated IR → emitted implementation → execution → error handling has evidence where applicable. PARTIAL means some of that chain exists. MISSING means required behavior has no implementation. EXTERNAL DEPENDENCY is reserved for an otherwise implemented, independently verifiable integration awaiting external access; missing internal code never becomes an external blocker. The original audit marked no full product feature COMPLETE. Later entries identify narrowly verified requirements; they do not imply that their containing product area is complete. The original baseline’s 22 tests included substantial mocks and cannot establish full execution coverage.

Evidence shorthand: E = `src/store/editorStore.ts`, `src/components/Canvas.tsx`, `Renderer.tsx`, `PropertyInspector.tsx`; B = `src/types/backend.ts`, `src/components/backend`, `src/lib/codegen/express.ts`; R = `src/store/routingStore.ts`, `src/components/routing`, `src/lib/graphResolver.ts`; W = `src/components/WorkspaceHub.tsx`, `src/store/workspaceStore.ts`; C = `src/lib/project/schema.ts`, `compiler.ts`; T = `tests/`. All paths are relative to the repository.

## Editor structure and interaction requirements

| ID | Specification requirement | Status | Evidence and remaining acceptance criteria |
|---|---|---|---|
| UX01 | Header logo/home navigation, Files menu | PARTIAL | Files menu now exposes project creation/opening, rename, import, checkpoint, backup and ZIP through actual workspace actions. Home navigation and full documented hierarchy acceptance remain. |
| UX02 | Header Connections workflow | PARTIAL | Dedicated GitHub Connections with durable credentials, discovery, review and queue; header layout parity and other provider lifecycles remain. |
| UX03 | Small floating AI chat window | PARTIAL | Movable assistant, streaming/proposal review, project/page/selection focus, suggestions and bounded per-project IndexedDB conversation history implemented. Browser checks retain stale-proposal/cancellation safety; live inference and provider accounting still require acceptance. |
| UX04 | Fullscreen play preview | PARTIAL | Design simulation plus isolated generated-HTML frontend preview. Real browser tests verify opacity of iframe origin, responsive CSS and executable widgets. Full-stack runtime/source overrides are not executed in this preview. |
| UX05 | Expandable Deploy / ZIP / Commit actions | PARTIAL | Files and expandable Deploy menus now expose project/checkpoint/import/backup, complete ZIP and GitHub commit entry points. Complete provider deployment still depends on the infrastructure ledger. |
| UX06 | Account/profile/settings | PARTIAL | `UserMenu`, `ProfileModal`, NextAuth; real profile management, account lifecycle and preference persistence incomplete. |
| UX07 | HDE off-screen visibility toggle | COMPLETE | Header Hide off-screen elements toggles artboard clipping without changing project content. Browser tests verify clipping and its session-only boundary; generated application visibility is unaffected. |
| UX08 | Tray with Elements, Assets, Pages, Backend, Routing, Code, Secrets, Settings | PARTIAL | Labelled rail and contextual panels include Assets, Secrets, Settings and Library. Project raster/font libraries now persist and export; hosted assets and richer account/team settings remain. |
| UX09 | Contextual searchable Sub-Tray; drag/drop and double-click insertion | PARTIAL | Searchable element/backend libraries have empty states, keyboard insertion and close controls. Backend insertion creates an initial service when needed. Full drag/drop catalog coverage remains unverified. |
| UX10 | Pages, per-page layers, globals | PARTIAL | Page/global layer trees, positioned-sibling grouping, ordering and clipboard are implemented. Shared project history now restores pages, their nodes and routing links together across page navigation. Transformed/flow grouping and broad hierarchy acceptance remain. |
| UX11 | Granular property inspector: style/layout/type/borders/fonts | PARTIAL | Tokenized inspector, named fields, collapsible sections, multi-selection alignment/distribution, text editing and context guards. Browser evidence covers numeric/text editing and multi-selection; full property-to-export coverage remains. |
| UX12 | Floating Dock: screen device picker, default 1920×1080 | PARTIAL | Floating dock now includes screen presets for desktop/tablet/phone and custom dimensions in Canvas settings. New projects use the specified 1920x1080 default; existing sizes are retained. Brand-specific device catalog and multiple screens remain. |
| UX13 | Pointer/hand/marquee tool cycling | COMPLETE | Single button cycles Select → Hand → Marquee; V/H/M direct selection and temporary Space-pan remain. Browser test verifies each cycle state and existing selection/pan/marquee workflows. |
| UX14 | Zoom-to-cursor, pan, fit, snap | PARTIAL | Shared zoom-to-cursor, wheel/Space/middle-button pan, fit/reset/selection centering across all canvases. UI browser tests cover pan/fit/lock, group movement and undo; all touch, graph wiring and snapping edge cases are not yet accepted. |
| UX15 | Dock lock freezes zoom and movement | PARTIAL | Shared viewport lock now blocks wheel, zoom/fit commands and hand panning, with disabled zoom controls. UI browser regression passes; explicit backend/routing lock and touch coverage remain before marking the whole requirement complete. |
| UX16 | Pen, editable vector curves, closed reusable shapes | PARTIAL | Persisted open/closed Bézier paths support authoring, anchor/handle editing and reusable shapes. Browser draw/edit/save/reuse/reload and exported production SVG pass. Transformed handle and broader vector editing acceptance remain. |
| UX17 | Motion workspace with multiple-object timeline | PARTIAL | Multiple tracks, scrub/play, timing/easing and keyframes persist and generate CSS. Browser multi-track editing/reload passes; exported production browser verifies final transform and reduced motion. Trigger/rotation composition and advanced timeline semantics remain. |
| UX18 | Per-element animations and triggers | PARTIAL | `animationCodegen.ts`, `AnimationPanel`; full trigger, reduced-motion and exported runtime parity unverified. |
| UX19 | Responsive overrides and breakpoint-specific editing | PARTIAL | Independent desktop/tablet/mobile overrides persist and emit cascading media queries. Browser confirms desktop preservation, reload and generated mobile computed styles. Arbitrary custom breakpoints and transformed hierarchy coverage remain. |
| UX20 | Design tokens and reusable component instances | PARTIAL | Project tokens and linked component definitions/instances now persist, publish, detach, preserve stable IDs/local overrides and support undo. Browser token binding/reuse/reload/generated CSS and unit publication tests pass; nested component/structural override semantics remain bounded. |
| UX21 | Advanced widgets: tabs, repeater, gallery | PARTIAL | Tabs now switch distinct panels with keyboard controls, repeaters emit configured copies, galleries apply columns/gap, and icon paths emit SVG. Isolated browser execution and generated Next production build pass; live data binding and broad nested widget acceptance remain. |
| UX22 | Asset library: images, icons, fonts | PARTIAL | Project image/font library, WOFF/WOFF2 upload/application, built-in icons, reuse and embedded export implemented. Browser raster upload/delete/reuse/reload/generated image passes. Hosted object storage/CDN and lifecycle permissions remain infrastructure work. |
| UX23 | Full IDE: files, editing, diagnostics, export | PARTIAL | File search/tabs/line gutter, editable source/export, worker syntax/JSON analysis, clickable diagnostics, find/replace and line navigation implemented and browser verified. Full semantic analysis, reconciliation and server runtime remain. |
| UX24 | Undo/redo, keyboard, selection and errors | PARTIAL | Shared bounded undo/redo spans UI, page settings, backend services/blocks and routing. Drag gestures are one entry; cancel restores the full document, project changes clear history, and all canvas modes expose keyboard/header undo. Browser deletion/restoration and generated-source equivalence pass. Saved source/native text history, persisted history beyond checkpoints and broad accessibility acceptance remain. |

## Backend configuration and execution

| ID | Requirement | Status | Evidence and remaining acceptance criteria |
|---|---|---|---|
| BE01 | Logical services, editable containers and ordinary blocks | PARTIAL | Services now open real workflow graphs with saved positions, keyboard ports/movement, ordered execution edges, branch/loop/try-catch paths, cycle errors and deletion cleanup. Unit tests execute emitted branch outcomes; browser connects/drags/reloads. Multi-service topology/orchestration and complete block catalog remain. |
| BE02 | Endpoints: five methods and routes | PARTIAL | Five endpoint methods and routes have inspector configuration; connected operation steps now drive generated runtime execution. Basic CRUD inference remains for endpoints without explicit steps. Comprehensive endpoint contracts and all method/browser combinations need acceptance. |
| BE03 | Endpoint path/query/header/body/response contracts, statuses, errors | PARTIAL | Request/body schema fields exist; query/header/response/status execution incomplete. |
| BE04 | Models: identity, types, required, uniqueness, defaults, indexes | PARTIAL | B models and basic fields; unique/index controls and emitted constraints incomplete. |
| BE05 | Model timestamps and soft-delete behavior | PARTIAL | Timestamps emitted; soft delete blocked by C. |
| BE06 | Relations, foreign keys, cardinality, update/delete behavior | PARTIAL | Relation type/state exists but no inspector/execution; C blocks export. |
| BE07 | Query: model binding, CRUD, count, filter, sort, aggregation, outputs | PARTIAL | Query inspector and validated runtime now support grouped count/sum/average/min/max aggregation as well as scoped CRUD/count/filter/sort. Owner/tenant match precedes grouping; typed filters, sessions, result/time limits and read-only pipelines are enforced. Real Mongo aggregation and transaction tests pass. Joins, arbitrary pipelines and richer result bindings remain unsupported. |
| BE08 | Atomic transaction groups and rollback | PARTIAL | Ordered transaction steps emit session-aware runtime; real replica-set duplicate-write rollback passed. Broader browser/error acceptance remains. |
| BE09 | JWT auth: secure refs, identity/model, expiry, endpoint attachment | PARTIAL | Real generated HTTP verifies login, hashed refresh rotation/replay, logout, password invalidation and cross-service introspection. Generated account UI, email verification/recovery and gateway pass real browser tests with MongoDB/local email transport. Administrative lifecycle, alternate strategies and live deployment acceptance remain. |
| BE10 | OAuth auth: providers, callbacks, identity mapping | PARTIAL | Strategy selector exists, generation blocked. Editor OAuth is separate. |
| BE11 | Session authentication | PARTIAL | JWT identity templates now persist sessions and enforce revocation/expiry with inspector controls; separate session strategy selection and full account lifecycle remain incomplete. |
| BE12 | API-key authentication | PARTIAL | Strategy selector exists, generation blocked. |
| BE13 | Roles and granted capabilities | PARTIAL | Role inspector, schema and runtime grants are implemented; identity lifecycle and administrative role management remain. |
| BE14 | Resource/action permissions | PARTIAL | Permission definitions and policy enforcement execute in generated programs; all application access paths remain to be covered. |
| BE15 | Access policies: roles, actions, ownership, conditional rules | PARTIAL | Policy inspector, IR and generated query scopes; real owner/tenant enforcement passed. Arbitrary policy conditions remain. |
| BE16 | Tenant isolation on reads, writes, aggregates and relationships | PARTIAL | Endpoint and query scopes are checked across reachable branches/functions/transactions. Conflicting owner/tenant scopes and missing model fields block generation and fail closed at runtime. Real Mongo negative tests and scoped CRUD/aggregation pass. Complete authorization coverage of legacy inferred/custom source and administrative lifecycle remain. |
| BE17 | Password reset, verification, refresh rotation, revocation | MISSING | Identity generator lacks these lifecycle operations. |
| BE18 | If/Else conditions and executable branches | PARTIAL | String config/inspector exists; C blocks export. |
| BE19 | Collection/conditional loops and execution bounds | PARTIAL | String config/inspector exists; C blocks export. |
| BE20 | Try/Catch/Finally, retry and error branches | PARTIAL | String config/inspector exists; C blocks export. |
| BE21 | Validation: types, required, range, format, pattern, custom conditions | PARTIAL | Subset emitted globally to mutations; rule scope, editable bounds and custom conditions incomplete. |
| BE22 | Transform: data mapping, output filtering, sensitive-field removal | PARTIAL | Inspector mappings emit bounded interpreted transforms with sensitive output stripping; broader mapping semantics remain. |
| BE23 | Functions: inputs, workflow, outputs, reusable service/app scope | PARTIAL | Service functions accept inputs and execute ordered steps/outputs; cross-service/app scope remains. |
| BE24 | Events: names, payloads, producers, consumers | MISSING | No event execution model. |
| BE25 | Durable queues, retries and failure handling | MISSING | No queue blocks or durable dispatcher. |
| BE26 | Jobs: payloads, bounds, retry/backoff, failures | MISSING | No job runtime. |
| BE27 | Workers: queue binding, concurrency, leases and failures | MISSING | No worker process/lease implementation. |
| BE28 | Schedulers: interval/cron, timezone, jobs | MISSING | No scheduler runtime. |
| BE29 | WebSockets: auth, schemas, endpoints, events | MISSING | Chat template contains models/HTTP endpoints only. |
| BE30 | SSE with disconnect/backpressure and authorization | MISSING | No generated SSE runtime. |
| BE31 | Subscribe/channel membership | MISSING | No subscriptions. |
| BE32 | Publish and event routing | MISSING | No publishers. |
| BE33 | Broadcast by channel/user/role | MISSING | No scoped broadcast runtime. |
| BE34 | HTTP requests: contracts, auth, timeout, retry, response mapping | MISSING | Editor provider proxy is not a generated HTTP Request block. |
| BE35 | Webhooks: receiving route, raw signature verification, replay safety | MISSING | No generated webhook runtime. |
| BE36 | Email: provider, sender, recipients, templates, attachments, delivery | PARTIAL | Identity email has encrypted durable Resend delivery and real local transport tests. General Email block inspector, recipients/templates/attachments and live delivery remain missing. |
| BE37 | SMS: recipient, message, provider, delivery | MISSING | Internal adapter absent; credentials not sole blocker. |
| BE38 | Payments: customer, amount/currency, flows, metadata, webhooks | MISSING | No implementation; provider test account needed after implementation. |
| BE39 | Upload: types, size, authentication, names, destinations | MISSING | Editor image upload is not a generated application upload endpoint. |
| BE40 | Download: policies, expiring access, disposition | MISSING | No storage download block. |
| BE41 | Storage: provider/location/access/secret refs | MISSING | No durable generated storage adapter. |
| BE42 | Storage deletion and access checks | MISSING | No delete block. |
| BE43 | Cache: provider, scoped key, TTL, strategy | MISSING | No cache block/runtime. |
| BE44 | Invalidation: exact/pattern keys, event triggers | MISSING | No invalidation block/runtime. |
| BE45 | Middleware: global/service/endpoint scopes | PARTIAL | B applies service middleware; endpoint middlewareIds not respected. |
| BE46 | CORS origins/methods/headers/credentials | PARTIAL | Origin/credentials subset emitted; complete controls and runtime coverage absent. |
| BE47 | Rate limits: key strategy/window/limit/error | PARTIAL | Express process-local limit; distributed limit/scope configuration missing. |
| BE48 | Request/error/metadata logging with redaction | PARTIAL | Logger emits selected request metadata without bodies/headers/query strings; Error Handler logs classifications and Audit Log adds durable retention. Hosted aggregation and all response paths remain. |
| BE49 | Custom middleware extension | PARTIAL | Raw string setting, export blocked; trusted extension contract absent. |
| BE50 | Environment development/production configuration | PARTIAL | Env blocks/examples; per-environment model and management missing. |
| BE51 | Secrets by reference, Google Cloud Secret Manager | PARTIAL | Encrypted durable owner/project vault, metadata-only access and key rotation pass real MongoDB tests. GCP adapter, host injection and live provider acceptance remain. |
| BE52 | Error Handler: classification/logging/status/exposure | PARTIAL | Error Handler inspector emits per-class HTTP status/client-message rules and metadata-only logging; generated Mongo duplicate errors and workflow failures reach it. All identity/validation response paths and hosted logs remain. |
| BE53 | Health Check: database/storage/dependency readiness | PARTIAL | Health Check inspector/IR emits configurable readiness, real MongoDB and service liveness probes, bounds/cache/concurrency and shutdown draining. Real runtime and browser export tests passed. Storage probes and deployed-container acceptance remain. |
| BE54 | Audit Log: actor/event/context/persistence/retention | PARTIAL | Inspector scopes durable Mongo request-start/outcome records, actor/tenant metadata, TTL retention and fail-closed behavior. Real generated JWT/Express/Mongo tests pass. Transaction blocks now insert audit events in the same MongoDB session, with real rollback/failed-audit tests. Standalone CRUD transaction conversion, background events, completion reconciliation and audit browsing remain. |
| BE55 | Editable Auth template | PARTIAL | Ordinary blocks; lifecycle/authorization/live tests incomplete. |
| BE56 | Editable CRUD template | PARTIAL | Ordinary blocks; explicit query binding/access policies missing. |
| BE57 | Functional editable Chat template | PARTIAL | Static architecture; no real-time runtime, multimodel export blocked. |
| BE58 | Future e-commerce/blog/SaaS/booking/file/social templates | MISSING | Marked future in source; requested full coverage still tracked. |

## IR, synchronization and AI

| ID | Requirement | Status | Evidence and remaining acceptance criteria |
|---|---|---|---|
| IR01 | Complete UI/backend/routing validated IR | PARTIAL | C structural schema, R frontend flows; backend execution/data flow absent. |
| IR02 | Every configuration changes generated behavior | PARTIAL | Unsupported configurations blocked, several controls ignored; compile coverage required. |
| IR03 | Live generation at reasonable latency | PARTIAL | W compiles when panel is open; no incremental dependency-aware compiler/background scheduling. |
| IR04 | Source edits/canvas changes follow regeneration model | PARTIAL | Fingerprint blocks stale exports; granular reconciliation absent. |
| IR05 | All-page Next.js generation, navigation and globals | PARTIAL | C and T build fixture; browser behavior/parity unverified. |
| IR06 | Full Express/container ZIP and project restore | PARTIAL | C and T; generated backend execution/Docker unverified. |
| RT01 | Page/service trays, draggable freely placed nodes | PARTIAL | R canvas exists; browser interaction verification pending. |
| RT02 | Page→page, page→service, service→service flow | PARTIAL | R resolves navigation/API calls; typed data/output bindings missing. |
| RT03 | Wire selection and context-specific inspector/disabled options | PARTIAL | R basic wire state; complete context-sensitive mapping absent. |
| AI01 | BYOK model selection/Hugging Face inference | PARTIAL | `/api/ai`; live responses/model capability discovery unverified. |
| AI02 | Specialized/fine-tuned IR agents | MISSING | Generic completion prompting is not trained specialized agents. Model selection/training artifacts required; internal orchestration missing. |
| AI03 | Robust complete IR-to-code generation | PARTIAL | Validated JSON/proposals; backend IR and source semantic analysis incomplete. |
| AI04 | Incremental proposals, streaming, cancellation | PARTIAL | Bounded incremental IR patches, preconditions, field review and cancellation are implemented. Streaming and contextual selection remain missing; live model output is unverified. |
| AI05 | Generated source syntax/security/dependency analysis | PARTIAL | File-path/size validation only; arbitrary proposals not built/analyzed. |
| AI06 | Review, diff, checkpoint, stale-proposal protection | PARTIAL | Incremental field before/after review, checkpoints and stale identity/name/design/source checks pass browser review/save tests with controlled model output. Rich source diffs and live-model acceptance remain. |
| AI07 | Usage/cost budgets and inference controls | PARTIAL | Configurable input-size preflight and provider output token caps; reported token usage shown in proposals. Durable spend/usage ledger and monetary budgets remain missing. |
| AI08 | Paid plans/profile billing/metering | MISSING | Informational profile only; provider credential needed after internal implementation. |

## Persistence, connections and deployment

| ID | Requirement | Status | Evidence and remaining acceptance criteria |
|---|---|---|---|
| PS01 | Local autosave/history/recovery/conflict handling | PARTIAL | W, IndexedDB, T; browser tests and eviction/recovery acceptance missing. |
| PS02 | Authenticated cloud storage and ownership | PARTIAL | Mongo API uses owner/revision; actual database and concurrency execution unverified. |
| PS03 | Durable assets with lifecycle/access/quotas | MISSING | Inline images only. |
| PS04 | Background/offline synchronization and conflict resolution | MISSING | Debounced foreground save is not durable background sync. |
| PS05 | Teams, collaboration, permissions, conflict reconciliation | MISSING | Account-owned single-user snapshots only. |
| GH01 | Repository authorization / Connections / token expiry | PARTIAL | Encrypted PAT connection records, authenticated APIs, expiry/error states and replacement; GitHub App/OAuth and automatic token refresh missing; live authorization unverified. |
| GH02 | Repository/branch discovery and selection | PARTIAL | Paginated writable-repository/branch discovery and selection UI/API; live GitHub acceptance awaits test authorization. |
| GH03 | Initial repository and branch setup | PARTIAL | Explicit private-repository creation, branch creation and empty-repo initialization; live provider verification pending. |
| GH04 | Changed-file review and commit history/status | PARTIAL | Git blob hash comparison lists added/modified/deleted managed files; remote history and durable worker results. Hunk-level review and live acceptance remain. |
| GH05 | Conflict detection/non-force safe updates | PARTIAL | Head checks, non-force ref update, operation recovery and lease fencing tested; arbitrary remote-to-IR merge and live GitHub race verification remain. |
| GH06 | Durable periodic commits with closed browser | PARTIAL | Standalone Mongo worker scans saved cloud revisions, schedules commits, retries outages and pauses conflicts; real Mongo restart/concurrency tests passed. Live closed-tab commit and worker container verification pending. |
| DP01 | Full application deployment model: frontend/backend/database | PARTIAL | Vercel frontend only; backend Compose export is not orchestration. |
| DP02 | Hosting selection/region/resources/scaling/container settings | MISSING | No deployment plan/provider capability model. |
| DP03 | Per-environment configuration and secret references | PARTIAL | API origins and examples; managed environments absent. |
| DP04 | Domains and TLS | MISSING | Button opens Ship; no domain verification/certificate workflow. |
| DP05 | Deployment status/progress/failures | PARTIAL | Vercel polling only; fullstack durable status missing. |
| DP06 | Build/runtime logs and redaction | MISSING | External dashboard instruction only. |
| DP07 | Health checks/readiness/rollout gates | MISSING | No deployed-application health gates. |
| DP08 | Versioned releases and rollback | MISSING | No deployment release/history/rollback implementation. |
| DP09 | Monitoring, metrics, alerts | MISSING | No operational integration. |
| DP10 | Database backups/restore and storage durability | MISSING | Local Compose volume only. |
| SB01 | Isolated generated-app build/runtime preview | PARTIAL | Generated frontend HTML uses an opaque-origin sandbox and restrictive CSP, verified against parent-document access. Full-stack build/runtime worker and edited-source execution remain missing internal infrastructure. |
| QA01 | Browser E2E and accessibility workflows | PARTIAL | Real Chromium suite verifies persistence, ZIP, inspector-to-source and unauthenticated Connections behavior; broad visual/accessibility coverage remains. |
| QA02 | Real database/provider/runtime integration tests | PARTIAL | Actual Mongo replica set, generated Express HTTP, vault and durable queue tests. Live external provider tests remain gated. |
| QA03 | Types/lint/unit/editor/frontend export build/audit | PARTIAL | Current root dependency audit succeeds with zero vulnerabilities. Types/lint/units and builds are rerun per stage; results appear in the latest verification ledger. Remaining lint warnings and broad generated feature acceptance prevent a product-wide completion claim. |
| QA04 | Backend build/generated-project tests/Docker runtime/load | PARTIAL | Generated modules execute with actual Express and MongoDB; container runtime, load and broad generated feature acceptance remain. |

## External verification gates (do not change internal feature status)

| Gate | Current evidence | Required external action | Verification after access |
|---|---|---|---|
| Docker runtime | `Get-Command docker` returned no executable | Install/start Docker Desktop or provide a reachable isolated Docker host; OS installation requires user authorization | Build exported/frontend/backend images, start dependency stack, readiness/rollback/isolation tests |
| MongoDB | `Get-Command mongod` returned no executable | Local test binary may be provisioned within workspace; Atlas verification needs a test URI via local environment, never chat | Real CRUD, isolation, transactions/rollback, concurrency, backups |
| GitHub | No live repository access exercised | Connect a disposable test repo with scoped credentials through Connections after implementation | Repository discovery/setup, actual diffs/history, race/conflict, closed-tab worker, token expiry |
| Hosting | Vercel adapter mocked only | Provide provider test project/credentials in environment or connection UI after adapters exist | Fullstack rollout, logs, health, domains/TLS and supported rollback |
| AI | No live inference verified | Enter BYOK through AI UI; chosen model must support requested output/capacity | Stream/patch generation, budgets, malformed output, source checks |
| Cloud secrets/OAuth/email/SMS/payment/storage | Adapters incomplete | Configure test providers/secret references after internal implementations exist | Provider-specific sandbox tests without production recipients or charges |

## Stage 1 evidence: explicit backend programs

Implemented `src/lib/backend/program-schema.ts`, `program.ts`, `src/lib/codegen/program-runtime.ts` and `ProgramInspector.tsx`. The inspector now edits ordered execution steps, explicit model bindings, query filters/values/sort/limits, transaction groups, branching, bounded collection loops, try/catch/finally, transforms, reusable service functions, responses, roles, permissions, and ownership/tenant policies. These configurations persist in the validated project and emit `workflow/program.json` plus a standalone interpreter used by generated Express routes. Model uniqueness/index settings now affect generated schemas. Conditions and bindings are interpreted as data; no canvas JavaScript is evaluated.

Evidence: `tests/backend-program.test.ts` has four passing tests covering emitted program preservation, invalid references/cycles/reserved outputs, branching/function/transform execution, and loop bounds. `tests/integration/backend-runtime.test.ts` passed against an actual temporary MongoDB replica set using the emitted runtime and model files. It verifies forced ownership/tenant fields on create, scoped reads, denied cross-tenant updates, missing tenant/identity failures, and rollback after a duplicate-key failure. Existing 22 tests still pass.

Updated statuses: BE07, BE08, BE13, BE14, BE15, BE16, BE22 and BE23 are now **PARTIAL**, with the above concrete execution evidence. BE18–BE20 and IR01–IR02 remain PARTIAL with new compiled execution. No COMPLETE claim: aggregate queries, all loop variants, rich function scoping, graphical edge editing, authorization lifecycle, browser acceptance, and more adversarial execution coverage remain. The table above reflects the current status; this stage ledger preserves the implementation evidence.

The MongoDB test-binary gate is resolved locally through `mongodb-memory-server`, with its binary cached under `.verification`. Atlas remains unverified. This harness runs real MongoDB, not an in-memory database mock. It follows the [replica-set harness documentation](https://github.com/typegoose/mongodb-memory-server) and [Mongoose session/transaction API](https://mongoosejs.com/docs/7.x/docs/api/connection.html).

## Execution order and evidence updates

Stage 2: `src/lib/server/vault.ts`, `/api/secrets`, and `SecretsPanel.tsx` provide encrypted durable storage, metadata-only reads, authenticated owner/project scoping, versioned writes/deletes, and re-encryption under an active key. `tests/integration/vault.test.ts` passes against real MongoDB, including ciphertext inspection, tenant separation, stale updates, tamper detection and rotation. BE51 remains PARTIAL: GCP Secret Manager, host injection and authenticated browser/provider verification are not yet complete. Internal backend inspector plaintext secret inputs were replaced by references to the Secrets workflow.

QA01 and QA02 are now PARTIAL. `tests/e2e/workspace.spec.ts` has two passing real Chromium workflows. `backend-runtime.test.ts` now also starts the actual generated Express server and checks real HTTP requests, JWT enforcement, validation and origin rejection. Browser/MongoDB harness setup is implemented without requiring user credentials; Docker remains unavailable.

Generated backend dependency auditing found two moderate `qs` advisories despite the editor audit being clean. The template now requires patched `qs >=6.16.0` through an override, following [the upstream advisory](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g); verification runs audit the generated package separately.

1. Explicit backend program IR, endpoint/model/query bindings, bounded control flow, transformations, transactions, policies and execution tests.
2. Identity lifecycle, durable secret/asset boundaries, persistent worker/job infrastructure.
3. Complete block families on that runtime, generated tests and real service integration.
4. GitHub Connections and durable sync; fullstack deployment adapters and isolation.
5. Editor structural parity, responsive/components/vector/motion and incremental AI/IDE.
6. Browser E2E, live provider gates, complete generated-app and operational verification.

This order does not waive any row. Update row evidence and readiness after each stage. No internal requirement is blocked simply because credentials for a different feature are missing.

## Stage 3: durable GitHub Connections (2026-09-14)

`GitHubPanel.tsx`, `/api/connections/github`, `server/github-connections.ts` and `scripts/github-worker.ts` replace the foreground-only workflow. Scope and operating instructions are in [github-operations.md](github-operations.md). GH01–GH06 remain PARTIAL for the specific internal and live-verification boundaries recorded above. Real MongoDB tests exercise store restart, worker exclusivity, lease fencing, concurrent queue edits, credential replacement/deletion, owner isolation and scheduled cloud revisions. Contract tests cover file hashes and a lost provider acknowledgement. No GitHub credentials were used and no remote repository was mutated during this stage.

## Stage 4 identity lifecycle checkpoint (2026-09-14)

`auth-session.ts` emits MongoDB-backed sessions, hashed rotating refresh tokens, single-use CAS rotation, proven replay-family revocation, bounded session lifetime/idle expiry and metadata-only session listings. The auth controller revokes sessions on logout/password change, and checks account disablement. Authentication inspector identity-service references produce live introspection in resource services; its target and endpoint are compiler-validated. Identity workflow overrides that would bypass password hashing are now export errors.

`tests/integration/identity-runtime.test.ts` starts two actual generated Express servers with separate MongoDB databases. Passing requests cover registration, hidden credentials, CSRF rejection, successful rotation, random-token rejection without revoking a valid family, concurrent refresh replay, logout, password change, disabled accounts and propagation of revocation into a separate resource service. Session work follows [OWASP session invalidation guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and [refresh replay guidance in RFC 9700](https://www.rfc-editor.org/info/rfc9700/). These sources inform the implementation; the project does not claim OAuth conformance from this JWT/session subset.

Stage 3 verification: TypeScript and all 28 unit tests passed; lint had 0 errors and 71 existing warnings. Three real-Mongo integration tests, three real Chromium E2E tests, editor production build and exported two-page frontend build passed. Editor and generated backend audits each returned zero vulnerabilities. Windows Playwright cleanup required running the test command with permission to terminate its own server processes; the rerun exited normally with 3 passed in 15.9 seconds. Stage 4 adds another real integration test and requires another full verification pass after the remaining changes. Docker is still unavailable.

Stage 4 verification: 31 unit tests, five real-Mongo integration tests and the exported application Chromium account workflow pass. Editor production build also passed. The generated browser suite builds Next.js and runs actual Express, MongoDB and the separate email worker; only external email transport is replaced by a local HTTP receiver. Cookie forwarding is tested against an actual HTTP server, including rejection of unrelated cookies and upstream cookie writes. Email challenge expiry removes ciphertext without deleting accounts. Operating instructions and remaining internal/live gates are in [identity-operations.md](identity-operations.md). Full feature rows remain PARTIAL; no UI-only completion claim is made.

Stage 5 health evidence: [observability-operations.md](observability-operations.md) records configuration, execution behavior and deployment limits. Two health integration tests and four editor Chromium workflows pass. Docker readiness commands are generated but have not run in a container. BE53 stays PARTIAL; deployment orchestration and storage readiness are not complete.

Stage 5 observability expansion: Error Handler and Audit Log now have validated configurations, compiler diagnostics, inspector controls and emitted runtime behavior. Eight integration tests and four editor Chromium workflows pass, including all three observability inspectors. Audit completion is not atomic with business mutations; unfinished records preserve uncertainty. See [observability-operations.md](observability-operations.md) for precise guarantees and remaining internal work.

Stage 5 transaction follow-through: the Audit Log inspector can enable atomic workflow-transaction events. A real replica-set test proves business/audit commit together, business rollback leaves no committed audit, and audit validation failure aborts business writes. HTTP completion metadata remains separate and can remain unknown after a crash; generic CRUD and custom-source auditing are not covered by this guarantee.

Stage 6 incremental AI: [ai-operations.md](ai-operations.md) records implemented patch validation, field review, stale-proposal protection and per-request input/output limits. Browser testing exposed and fixed overwrite of later project renames. Live inference remains unverified; streaming, durable usage/cost accounting and source analysis are still internal gaps.

## UI quality stage - 2026-09-20

The active priority is the user-requested visual and interaction pass. See [surface audit, evidence and remaining UI work](ui-quality.md) and [design rules](../DESIGN.md). Backend/compiler functionality is preserved; a reviewed AI project rename now also survives save/reload. At the end of this earlier stage those advanced design/runtime areas remained open. The September 21 evidence and current rows supersede that status; full-stack sandbox runtime remains internal work.


## Latest frontend verification — 21 September 2026

- `frontend-stage-final-check.log`: TypeScript and lint pass (0 errors, 53 warnings); 55 unit tests pass, including emitted workflow execution, breakpoint grouping and global ordering.
- `frontend-all-e2e.log`: all 17 editor Chromium workflows pass. After the final motion-toolbar/cancellation changes, both targeted motion and grouping workflows passed again (`frontend-motion-final.log`).
- `design-export-final-build.log` and `design-export-runtime.log`: exported Next.js production build and actual browser runtime pass. Runtime assertions cover tabs, repeaters, tokens, gallery, primitive/vector SVG, mobile layout and reduced motion.
- `frontend-integration-isolated.log`: all nine integration checks pass. The first run overlapped editor E2E and exceeded the workflow-service startup wait (8/9); that unchanged case and then the full suite passed without competing browser/build work. Tests were not weakened.
- `frontend-account-final.log`: exported production account UI with real Express/MongoDB and email worker passes verification, cookie renewal, password recovery and revocation.
- `frontend-root-final-build.log`: editor production build passes. `frontend-backend-build.log`: generated auth/workflow backends validate 13/11 modules.
- Fresh dependency audit attempted in `frontend-audit-final.json`; registry advisory endpoint could not be reached. Earlier zero-advisory evidence is historical, not a current audit result.
- Docker executable/runtime is absent. Live provider credentials were not exercised. Internal frontend gaps remain in the rows above; no product-wide completion claim is made.

Logs and screenshots are under the ignored `.verification/` directory. New workflow and exported-runtime screenshots: `design-workflow.png`, `design-export-runtime.png`.


## Production continuation — 22 September 2026

The user restored the whole-product production scope. Completed internal stages in this continuation:

- Shared project history captures UI/pages/settings, backend and routing together, including deletion cleanup. Page navigation does not discard history; graph drags commit once and cancel atomically. Undo restores the same generated artifacts (apart from capture timestamps). Selection, navigation, tokens and provider credentials are not captured as history controls; design-token values are document data and remain covered. History is bounded to 50 session entries and is cleared on project import/switch/reviewed replacement. Persistent checkpoints remain separate.
- Routing supports click-to-connect as well as drag and keyboard interaction. Browser regression caught the previous immediate cancellation on releasing the first port.
- Policy inheritance validates every reachable query model, including function/branch/transaction paths. Runtime scope merging rejects conflicting values and absent model fields rather than overwriting a restriction.
- Structured aggregation supports a scalar group field and up to eight named count/sum/avg/min/max metrics, safe metric/model references, scoped typed filters, sorting, result limits, transaction sessions, a shared execution deadline and disabled disk spilling. The generated pipeline has no arbitrary operators, writes or JavaScript execution. Mongo tests verify owner and tenant isolation, ObjectId filtering and transaction execution. Arbitrary joins/pipelines remain unsupported.

Evidence: `project-history-targeted.log` (3 checks), `project-history-browser.log` (2 workflows), `production-integration.log` (9 checks before adding aggregation), `aggregation-runtime.log` (real replica-set execution), and `production-audit.json` (zero advisories). Current full regression/build counts will be recorded after the final run. No live provider account or production system was changed.
