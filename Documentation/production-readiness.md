# Levoks implementation and release readiness

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
| GitHub              | User-provided token, existing repository/branch connection, manual commit, and opt-in changed-source commits every five minutes while the tab remains open. Non-forced ref updates detect conflicts; changes are limited to `levoks/<project-id>/`.                                                       |
| Deployment          | Vercel frontend preview deployment, required public API origins, queued/building/ready/error status, and a link when ready. Express services and MongoDB require separate hosting.                                                                                                                        |
| Identity generation | Supported JWT auth template generates registration, login, profile and logout handlers with bcrypt hashing, bounded input, fixed initial role, HttpOnly cookies, and an explicit secret requirement.                                                                                                      |
| CRUD generation     | One model per service, bounded pagination, allowed request fields, rejection of operator injection, validation, generic server errors, CORS origin checks, rate limiting, and graceful shutdown.                                                                                                          |

Preview is a design simulation. It does not execute a deployed database or prove backend correctness. Source and AI output are not executed in the Levoks server, but building or deploying an export executes that project's build scripts and code. Review the source before delivery.

## Run Levoks

Use Node.js 22 or later and the committed lockfile:

```sh
npm ci
npm run dev
```

Local editing, saving, JSON backup, and ZIP export work without provider credentials. Copy `.env.example` to `.env.local` when enabling OAuth or cloud storage. Configure `NEXTAUTH_URL`, a randomly generated `NEXTAUTH_SECRET`, and the selected OAuth provider's client ID and secret. Register `/api/auth/callback/github` or `/api/auth/callback/google` as the callback on the Levoks origin. Set `MONGODB_URI` with a database name to enable cloud projects.

AI, GitHub, and Vercel tokens are entered in the workspace and held in component memory for the current tab. They are sent to the Levoks API and the selected provider; they are not saved with the project. GitHub login does not grant repository write access. Use a separate fine-grained token scoped to the intended repository with Contents read/write permission. Create and initialize the repository and branch before connecting. There is no background commit worker after the tab closes.

Declared backend secret fields are removed from saved/exported snapshots and replaced with configuration placeholders in generated services. This is not a general secret scanner: credentials pasted into ordinary source text or content are not automatically identified. Do not embed them there.

Production editor builds use `npm run build` and `npm start`, or the root Dockerfile, which uses standalone Next.js output and a non-root runtime user. Provide configuration at runtime through the host's secret manager. Put HTTPS and appropriate request limits in front of the service. Process-local provider rate limiting is not a distributed abuse-control system. OAuth callbacks and MongoDB access must be exercised in the actual target environment.

## Run and deliver an exported application

1. In `frontend/`, install dependencies, copy `.env.example` to `.env.local`, and run `npm run dev`. Set each `NEXT_PUBLIC_API_<port>` to its actual service origin before a production build. These values are public and embedded at build time.
2. In each `backend/<service>/`, configure its environment example. Authenticated services require a cryptographically random `JWT_SECRET` of at least 32 characters. Configure `CORS_ORIGINS` to the exact frontend origin. Do not use wildcard credentialed origins.
3. The generated backend Compose file starts MongoDB and services for local development. It does not provide a production database backup, replica set, secret manager, TLS, or operational monitoring.
4. Build the frontend with `npm run build`, or pass service origins as Docker build arguments, for example `docker build --build-arg NEXT_PUBLIC_API_3001=https://api.example.com -t my-frontend .` from `frontend/`. Runtime environment changes alone do not replace bundled public API origins.
5. Vercel delivery publishes only `frontend/`. Deploy backend containers separately, then supply their HTTPS origins in the Ship panel. Test cookies on the final domain configuration: browser restrictions can prevent cross-site cookies even with credentialed CORS. Prefer a same-site frontend/API arrangement for authentication.
6. Generate and review lockfiles for every exported package, audit dependencies, and commit the lockfiles before release. The export contains package manifests; its initial Docker build resolves a lockfile when one is absent, so dependency resolution is not reproducible until a reviewed lockfile is retained.

JWT verification is not application authorization. CRUD resources do not automatically enforce tenant ownership or per-record access. The generated auth flow has no password recovery, email verification, token revocation, or refresh-token rotation. Add and test those policies before exposing sensitive application data. Logout clears the browser cookie; it does not revoke a stolen token.

## Verification

```sh
npm run check
npm run build
npm audit --audit-level=high
node --import tsx scripts/generate-fixture.ts
node node_modules/next/dist/bin/next build .verification/frontend
```

All 22 tests pass. The suite covers graph validation, page/global/nested element handling, export escaping and parsing, source invalidation, persistence revisions and recovery, generated auth/CRUD behavior, typed form submission and URL parameters, request limits, rejected AI proposals, GitHub conflict and managed-path behavior, and deployment payload boundaries. Provider tests use mocked HTTP responses; generated backend tests use controlled model and crypto substitutes. They are not live provider or real-database integration tests.

The standalone production server returned HTTP 200 for the editor and provider discovery, and HTTP 401 for unauthenticated cloud project access, with a temporary runtime auth secret. Security response headers were present. Without a production auth secret, NextAuth correctly refused the auth request. The local environment file was removed from Git tracking while retained on disk.

The root production build, exported two-page frontend build, TypeScript checks, and tests have been exercised during implementation. Dependency auditing found no known advisories after compatible lockfile updates. ESLint still reports warnings in the editor code; errors were corrected. A browser was unavailable in this session, so interactive visual/accessibility acceptance testing has not been completed. Docker runtime, OAuth, cloud saves, real AI responses, GitHub pushes, and actual Vercel deployments have not been verified with live credentials.

## Remaining product and release work

- Compile backend conditionals, loops, error branches, relations, explicit model selection, transactions, and richer typed response-to-view bindings. Unsupported combinations currently report export errors. The chat template is an architecture starter, not a functioning real-time system.
- Implement application permissions and ownership, stronger identity lifecycle, a managed secrets vault, and isolation for running generated code.
- Add queues, schedules, real-time collaboration, WebSocket execution, payments and verified webhooks, transactional notifications, object storage, and caching as tested platform capabilities.
- Complete richer responsive design controls and advanced widgets, design tokens/components, vector tools, motion behavior, and breakpoint-specific editing. Current responsive export is basic; review all target viewport sizes.
- Add a sandboxed IDE/runtime preview, source-to-IR reconciliation, incremental/streaming AI changes, stronger generated-code analysis, and cost controls.
- Add durable asset storage, background sync, collaboration conflict resolution, and account/team project permissions. Local IndexedDB is not a disaster-recovery strategy.
- Extend hosting to backend orchestration, domains/TLS, environment management, logs, rollbacks, and health checks. Replace tab-bound GitHub synchronization with an authorized background integration if needed.
- Implement actual plans, usage metering and billing. Existing profile information is informational, not a billing integration.
- Run real browser end-to-end and accessibility tests, real-database concurrency tests, provider integration tests, load tests, monitoring/alerting, and backup restoration drills before a production launch.

These are explicit implementation boundaries, not evidence that the full vision has shipped.
