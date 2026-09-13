# Levoks implementation and release readiness

The active requirement ledger is [completion-matrix.md](completion-matrix.md). The user confirmed `levoks.md` is the original PDF converted to Markdown. Prior passing checks establish only their tested subsets; every documented feature is tracked separately with execution and error-handling acceptance criteria. Implementation continues through the internal gaps; credentials block only the corresponding live integration.

Stage 1 adds explicit generated backend workflows and the Property Inspector controls for queries, transactions, policies, roles/permissions, conditions, bounded collection loops, error branches, transforms, functions and responses. `npm run test:integration` runs generated workflow/model code against a real temporary MongoDB replica set; tenant/owner isolation and transaction rollback passed. Full feature status remains PARTIAL pending the remaining semantics and UI/execution coverage recorded in the matrix.

Stage 2 adds a durable encrypted MongoDB secrets store, authenticated metadata/write/delete/rotation endpoints, and Project secrets UI. Values use AES-256-GCM with owner/project/name-bound authenticated data and per-record key IDs. Browser APIs never return saved values. Backend inspectors now reference secret names instead of accepting plaintext into project state. Real MongoDB tests passed for identity/project isolation, ciphertext storage, optimistic version checks, tampering and key rotation. Configure a server-only `LEVOKS_SECRET_KEYS` JSON keyring (base64 random 32-byte keys) and `LEVOKS_ACTIVE_SECRET_KEY`; retain old keys until records have been re-encrypted. The Google Cloud Secret Manager adapter and automated host secret injection are still missing, so this is not the complete secret-management requirement.

Browser verification is available through an isolated workspace Chromium installation. Autosave/reload/import/full ZIP and inspector → IR → emitted source passed. Generated backend HTTP verification also passed with actual Express, JWT middleware and MongoDB. Coverage does not yet establish complete editor or provider acceptance.

Stage 3 adds [durable GitHub Connections](github-operations.md): encrypted authorization, repository/branch discovery and creation, managed-file review, remote history, an authenticated versioned queue, and a separately supervised MongoDB worker. Saved cloud revisions can be committed every five minutes after the editor closes. The worker enforces leases, bounded retries, head conflicts and non-force updates; recoverable lost acknowledgements are identified by operation ID, parent and file hashes. Real MongoDB concurrency/restart tests and provider contract tests passed. Live GitHub authorization and pushes remain unverified; GitHub App/OAuth repository access and automatic token refresh are still internal gaps. Scoped PAT replacement is implemented.

Stage 4 (in progress) adds generated server-side identity sessions with hashed rotating refresh tokens, replay-family revocation, absolute/idle expiry, session inventory/revocation, logout-all and password-change invalidation. Identity-service bindings in the Authentication inspector generate live introspection in resource services and Compose service origins. Real HTTP tests start two generated Express servers against separate MongoDB databases and verify that refresh replay and password changes revoke access in both. New templates expose the corresponding endpoints; existing templates need those endpoint blocks added. Email verification/recovery and generated account UI are not yet implemented at this checkpoint. Standalone JWT resource services without an identity binding still do not enforce revocation.

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
| Identity generation | Auth templates generate bcrypt registration/login, revocable server-side sessions, single-use refresh rotation, session inventory/revocation, password change and logout-all. Resource services can select an identity service for live session checks. Email verification/recovery, generated account UI and all provider strategies remain incomplete. |
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

1. In `frontend/`, install dependencies, copy `.env.example` to `.env.local`, and run `npm run dev`. Set each `NEXT_PUBLIC_API_<port>` to its actual service origin before a production build. These values are public and embedded at build time.
2. In each `backend/<service>/`, configure its environment example. Authenticated services require a cryptographically random `JWT_SECRET` of at least 32 characters. Configure `CORS_ORIGINS` to the exact frontend origin. Do not use wildcard credentialed origins.
3. The generated backend Compose file starts MongoDB and services for local development. It does not provide a production database backup, replica set, secret manager, TLS, or operational monitoring.
4. Build the frontend with `npm run build`, or pass service origins as Docker build arguments, for example `docker build --build-arg NEXT_PUBLIC_API_3001=https://api.example.com -t my-frontend .` from `frontend/`. Runtime environment changes alone do not replace bundled public API origins.
5. Vercel delivery publishes only `frontend/`. Deploy backend containers separately, then supply their HTTPS origins in the Ship panel. Test cookies on the final domain configuration: browser restrictions can prevent cross-site cookies even with credentialed CORS. Prefer a same-site frontend/API arrangement for authentication.
6. Generate and review lockfiles for every exported package, audit dependencies, and commit the lockfiles before release. The export contains package manifests; its initial Docker build resolves a lockfile when one is absent, so dependency resolution is not reproducible until a reviewed lockfile is retained.

Workflow queries enforce explicitly configured role, permission, owner and tenant policies using the authenticated principal. Legacy inferred CRUD does not automatically enforce those policies. Identity sessions now revoke on logout, refresh replay and password change; bound resource services check that state through the identity service. Password recovery, email verification, account UI and coverage of every access path remain internal release work. Generated session cookies use HttpOnly, Secure in production and SameSite=Lax. Host frontend/API routes together or provide a same-origin gateway; cross-host cookie transport is not solved merely by configuring CORS.

## Verification

```sh
npm run check
npm run test:integration
npm run test:e2e
npm run build
npm audit --audit-level=high
node --import tsx scripts/generate-fixture.ts
node node_modules/next/dist/bin/next build .verification/frontend
```

The baseline 22 tests are retained. Added suites exercise backend program generation/execution, managed-file hashing and GitHub operation recovery. Real MongoDB suites execute generated Express queries and transactions, encrypted secret storage, and durable GitHub queue concurrency/recovery. Playwright executes the editor in real Chromium. Provider contract tests use controlled HTTP responses and are explicitly not live GitHub/Vercel/AI verification. The matrix records the tested subsets and remaining acceptance work.

The standalone production server returned HTTP 200 for the editor and provider discovery, and HTTP 401 for unauthenticated cloud project access, with a temporary runtime auth secret. Security response headers were present. Without a production auth secret, NextAuth correctly refused the auth request. The local environment file was removed from Git tracking while retained on disk.

The root production build and exported two-page frontend build were exercised in earlier stages; rerun after changes. The generated backend package now overrides vulnerable transitive `qs` versions with `>=6.16.0`; its separate dependency installation reports zero advisories. ESLint warnings remain in existing editor code. Browser verification covers a limited set of workflows; comprehensive visual/accessibility acceptance remains. Docker is unavailable. OAuth, cloud saving through real sign-in, AI responses, GitHub pushes and actual Vercel deployments remain unverified with live credentials.

## Remaining product and release work

- Complete backend relations, aggregation, remaining loop/function scopes and richer typed response-to-view bindings. The explicit workflow subset is implemented and tested; unsupported combinations report export errors. The chat template is still an architecture starter, not a functioning real-time system.
- Complete authorization coverage and identity lifecycle, add the specified cloud secret-manager adapter and host injection, and isolate generated-code execution.
- Add queues, schedules, real-time collaboration, WebSocket execution, payments and verified webhooks, transactional notifications, object storage, and caching as tested platform capabilities.
- Complete richer responsive design controls and advanced widgets, design tokens/components, vector tools, motion behavior, and breakpoint-specific editing. Current responsive export is basic; review all target viewport sizes.
- Add a sandboxed IDE/runtime preview, source-to-IR reconciliation, incremental/streaming AI changes, stronger generated-code analysis, and cost controls.
- Add durable asset storage, background sync, collaboration conflict resolution, and account/team project permissions. Local IndexedDB is not a disaster-recovery strategy.
- Extend hosting to backend orchestration, domains/TLS, environment management, logs, rollbacks, and health checks. Finish GitHub App/OAuth authorization and verify the durable worker against a live test repository.
- Implement actual plans, usage metering and billing. Existing profile information is informational, not a billing integration.
- Expand real browser/accessibility and real-database concurrency coverage; run live provider tests, load tests, monitoring/alerting and backup restoration drills before a production launch.

These are explicit implementation boundaries, not evidence that the full vision has shipped.
