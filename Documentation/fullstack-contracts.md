# Full-stack contracts and executable integrations

This builds on the existing project document, backend IR, workflow interpreter, routing ports, gateway and export pipeline. The conceptual `levoks.md` describes the broader direction; the implementations and limits below describe current behavior.

## Current architecture

UI elements retain stable IDs and native form/button behavior. Backend services and endpoint blocks retain their IDs. Routing connections bind these identities and resolve to ordered API calls and success navigation. Application generator version `semantic-2` now includes a contract index alongside the original project, graph, backend IR and definition metadata. AI design, patch and source requests receive this complete IR, after existing secret redaction and request-size checks.

A request field has an optional stable `id`; legacy fields use their original name until edited. The inspector preserves that identity on rename, and new inspector-created fields get UUIDs. Identities are scoped by endpoint and request location. Frontend implementation names do not have to match backend names. Schema validation rejects duplicate names/identities and reserved object keys. No eager migration rewrites old documents.

## Connect a form

1. Add a Form, its inputs, and a button with type Submit.
2. Connect the form output to an endpoint input on Routes.
3. Select the wire and choose **Map fields by identity**.
4. Assign each required body, query and path field to a form input or constant. A later endpoint may read a declared field from the previous response.
5. Connect the endpoint output to a page for success navigation, or another endpoint for an awaited follow-up call.
6. Optionally map declared response fields to text, title or paragraph elements, and configure the wire's failure message/navigation.

A submit button invokes its owning form. A legacy routing wire placed on a submit button resolves to that form. Wiring both creates a diagnostic rather than competing requests. Explicit click actions that prevent submission are reported. Separate buttons with type Button keep independent click behavior. Enter submission works through the same form handler.

Explicit mappings submit only mapped fields, read controls by element ID, convert scalar types, preserve unchecked booleans, and separate body/query/path data. Path segments are encoded. Unmapped required fields, deleted references, inputs from other forms, missing previous-response fields and invalid display targets are compiler errors. GET uses query/path fields. File input and structured text-to-object conversion are not silently simulated.

Legacy wires without mappings retain name-based FormData behavior. Mappings and failure behavior participate in existing save/load and undo/redo. Deleting a mapped input leaves a diagnostic; it never silently falls back to guessing by name.

## Backend contracts

The endpoint inspector exposes body, query, path, request-header and response fields. Explicit query/path contracts validate and normalize scalar values on the server and discard undeclared values. Path contracts must cover each route placeholder; an explicitly declared string `id` supports slugs, while legacy CRUD paths retain MongoDB ID checks. Workflow responses with declared fields are checked before a login session is issued. Existing implicit lifecycle controllers retain their own response validation behavior.

Request Headers configure up to 32 application metadata fields with case-insensitive, hyphenated names and scalar types. Map them by stable identity in Routing using an input, literal or previous response. Required headers need explicit mappings; the legacy name-based form mode cannot supply them. Generated form requests keep headers separate from body/query/path data. Values are printable ASCII, bounded to 4 KB per field; the normal HTTP server's total-header limit also applies. Missing, malformed or repeated raw header fields are rejected before the endpoint executes. Header names with transport/browser/authentication duties are reserved; secret and identity credentials use existing server configuration and authentication paths.

Only declared headers enter workflows as `$request.headers`, with lowercase names and hyphens replaced by underscores (`X-App-Version` → `$request.headers.x_app_version`). Undeclared bindings fail compilation. The gateway forwards only the metadata declared by the matched endpoint; headers declared on another endpoint are not forwarded. Custom metadata does not establish a principal, tenant or granted capability. Built-in account forms retain their standard credential fields; lifecycle endpoints with additional required metadata need mapped canvas forms or a compatible client.

Response workflow blocks now expose **Response headers**. Add a name and a string, number or boolean literal, or a `$context.path` binding. The array persists in project IR and generated workflow JSON; names are case-insensitive and must be unique. Up to 32 application metadata headers are supported, with printable ASCII values of at most 4 KB and an aggregate 8 KB including names. Missing, structured, null, non-finite, oversized or control-character values fail before HTTP header writes and before login session issuance. Credential/secret bindings and browser, identity, cache, transport, correlation and security header names are rejected. Login headers share the existing restriction to earlier public outputs.

The gateway computes allowed response headers from the endpoint's reachable response blocks, including branches and nested operations. It forwards only those names, retains its private/no-store and cookie restrictions, and validates upstream values again. CORS Exposed headers must list any metadata a cross-origin browser should read; forwarding through the same-origin gateway does not make unexposed cross-origin headers readable. Error-handler responses do not inherit metadata from an unsuccessful workflow.

Explicit Response statuses 204, 205 and 304 send no body and ignore their value binding. A reachable 204/205 response conflicts with a nonempty endpoint Response Body contract and fails compilation. Express and the gateway preserve the status and headers for GET and HEAD; the generated API client returns null for successful 204/205 responses. Other error/status-specific response schemas, response-header Routing mappings, dynamic cache/security headers and nested response-body schemas remain open. Legacy inferred CRUD and built-in identity lifecycle controllers retain their existing output behavior.

Service CORS settings expose explicit HTTP(S) origins, allowed methods, automatic/custom allowed headers, exposed response headers, credentials and a preflight cache (0–86,400 seconds). Automatic allowed headers include Content-Type, Authorization and the service's declared endpoint metadata; a custom empty list allows none. An empty exposed list exposes no custom response headers. Runtime CORS_ORIGINS overrides are validated and normalized before identity origin checks. Wrong origins/methods/requested preflight headers fail closed; clients without an Origin header retain their existing server/API access and still require endpoint authorization. Wildcard/regex origins, per-endpoint/backend CORS scope and arbitrary transport/security header generation are not implemented. Health endpoints retain their separate public probe boundary. CORS does not replace authentication, same-origin protection or owner/tenant policies.

The generated frontend still uses the same-origin Levoks API gateway, declared endpoint allowlist, deployment-origin configuration, scoped cookies, and refresh behavior. Internal models and workflow blocks are not frontend destinations. Routing service-to-service edges chain endpoint requests in the triggering frontend flow; server-side upstream calls use the HTTP Request workflow block.

## Added executable capabilities

- **HTTP Request:** fixed upstream path, method, query/body bindings, origin environment variable, optional bearer-secret environment variable, timeout and GET retries. Supports JSON REST and GraphQL requests. The runtime rejects redirects, limits responses to 1 MB, and observes the existing workflow deadline. Errors enter the existing try/catch workflow. Mutation retries and HTTP calls inside retried database transactions are rejected.
- **Cache:** get/set/delete, namespace, key/value bindings and TTL. Entries are scoped by user and tenant and strip sensitive output fields. This is a process-local cache (256 entries, 64 KB each, TTL up to one hour), not a distributed or durable store. Transaction use is rejected.
- **Query pagination:** optional page binding, existing filtering/sorting/access policies, and existing per-page limit. Pages are bounded to 1–10,000; invalid values fail rather than causing unbounded reads.
- **Integration Service template:** endpoint → HTTP request → response, plus origin configuration.
- **Catalog Service template:** model and endpoint → filtered, sorted, paginated query → response.

Templates create normal blocks and connections; every block is editable/removable. Existing Auth, CRUD and Chat starters are retained. Chat remains an architecture starter, not a new WebSocket runtime. OAuth providers, general queues/jobs, file storage and arbitrary custom JavaScript execution are not added by this change.

## Guided form destinations

Select a Form → Content → **Submission destination**. **New submission collection** creates a local MongoDB service, a Submission model, a public POST `/api/submissions`, validation, a create query and a receipt response. **Create collection and connect** maps each enabled input by its element identity. Every generated block and wire remains editable in Backend and Routes. Each collection uses a distinct service/database fallback; setting multiple services to the same runtime database remains an explicit operator choice.

Alternatively, select an existing POST/PUT/PATCH endpoint and match its required body/query/path/header fields to form inputs. Names are suggested when they match; explicit mappings support differently named inputs. Existing constants are preserved and remain editable in Routes. Reapplying the same endpoint preserves response-display mappings and failure behavior. Structured objects/arrays and chained response values require Routes. Passwords belong to identity workflows; uploads, radio groups and multiple selections are outside the collection wizard's supported controls.

**Success message** and **Clear fields after a successful save** persist in the form. A failed request keeps entered values and prevents subsequent success actions. Successful requests display the authored message and optionally reset the native form. Disabled controls, including descendants of disabled fieldsets, are not submitted. The collection copies fields/validation when created; later model/contract changes are edited in Backend and mappings reapplied in the form panel. It does not silently migrate existing records when a form field changes.

Templates → **Add working contact form** adds an editable name/email form, database workflow and route in one undoable action, preserving existing canvas content. Disconnecting removes form routes while retaining backend blocks and stored records. Undoing configuration restores project definitions, not database contents from a running exported application.

The generated public endpoint returns only a receipt, with no submitted data or record ID. No GET/update/delete endpoint is created. For a connected MongoDB collection, Add private submission inbox now creates a separate identity service, operator permission/policy and authenticated read view; wider administrative account management remains open. Do not turn a public form into an anonymous read API. The default limiter permits 20 requests per 15 minutes per backend-observed IP, including invalid requests. It uses process-local counters, resets on restart, and visitors behind a gateway share its IP quota. Shared MongoDB counters are an existing Backend option; trusted proxy/client attribution and bot protection still require separate implementation/acceptance.

Generated frontend preview reports that no data was sent or saved: it does not run the backend. Choose Local full-stack to test generated MongoDB applications inside the editor, or download and configure the generated application. Custom-source/container preview, public uploads, broader operator administration and a complete business-site starter remain open.

`npm run test:form-export` exercises real drag/drop and form configuration, history, persistence, mobile preview and ZIP download, then builds the actual downloaded Next/Express project and runs it against disposable MongoDB. It verifies save/retry/reset, server validation, unknown/managed-field exclusion, denied public reads/edits, quota exhaustion and durable records after backend restart. The reusable extraction script accepts archive and output-directory arguments; its original canvas defaults are retained.

## Private submission inbox

After connecting a public MongoDB form collection, choose **Add private submission inbox**. This adds ordinary identity/policy/query/response blocks in one history entry and retains public write access. Existing access rules are preserved: guided setup refuses to replace them. Backend → Endpoint → Generated view exposes the saved selection; exports require the validated authenticated GET/operator policy/paginated query contract.

The built-in view lives at `/__levoks/inbox/<service-slug>/<endpoint-id>`. It displays escaped model fields, timestamps when enabled, 50 newest records per page, and loading/empty/error/retry states. Account pages link to their connected inboxes after sign-in. Stale loads are aborted; loading, failures and sign-out clear rows. Focus/visibility changes reload access. Gateway and direct reads disable caching. Normal accounts, changed roles without grants, disabled users and revoked sessions are denied.

The separate identity account page offers **Set up first operator**. Set the same random JWT_SECRET (at least 32 characters) on the resource and identity services, exact frontend CORS_ORIGINS, and a random 64-character hexadecimal OPERATOR_SETUP_TOKEN on the identity runtime. The ZIP's SUBMISSIONS.md names service-specific Compose variables and paths. Enter the code, email, name and a password of at least 12 characters (at most 72 UTF-8 bytes); then sign in. Setup creates no session itself. Remove the code and restart the identity service after enrollment. Setup codes are never generated into project data and Environment Variable blocks cannot hold them.

A hidden unique sparse MongoDB enrollment marker, initialized before serving requests, permits only one initial operator across processes/restarts. Public registration cannot grant a role or set this marker. Disabled accounts retain it. This initial reader permits the operator to read all submissions in that service. Team/tenant management, operator replacement/recovery administration, general canvas collection binding, record editing/search/export, guided SQL setup and general notifications are separate unfinished capabilities. A full final page may enable Next once before an empty page because this reader omits total counts. Local full-stack preview executes these requests; generated frontend preview remains isolated from backend networking.

`npm run test:inbox-export` tests real form drag/drop, inbox creation, undo/redo, persistence, actual ZIP extraction, generated production builds, two-process enrollment races and real Next/Express/MongoDB browser execution. Extraction checks a child of .verification and clears it first, preventing stale source files from being accidentally accepted.

## Submission email alerts

After adding a private inbox to a connected MongoDB form, enable **Email alerts for new submissions** and edit its subject in Form → Content. Backend → Submission Email exposes the endpoint/create-query/model/inbox references. This is ordinary persisted configuration with undo/redo, not an executable workflow step. One configuration per non-relational MongoDB collection is supported; unsafe references or storage/credential changes block export.

The create query stores a hidden `_levoksSubmissionMail` job with the record in the same atomic write. No provider call occurs in the public API or editor preview. Validation/storage failures create no job. Disabling the configuration stops new jobs while previously queued alerts drain after deploying the configuration. Existing records do not acquire jobs retroactively. Neither public receipts nor private inbox responses expose the job.

The exported service adds `npm run worker:submissions` and `npm run notifications:status`. Copy `notifications/.env.example` to `notifications/.env`, set its database URL to the submission API's database, and configure the sender, single recipient, HTTPS frontend origin and provider key there or in the worker's environment. API `.env` and frontend settings do not need mail credentials. Compose offers an optional notifications worker profile with no public ports or JWT/setup tokens. Nested environment files are excluded from image build contexts. Read root NOTIFICATIONS.md for service names and setup.

Messages contain a generic notice and authenticated inbox link. Queue metadata stores subject/path snapshots and a salted fingerprint, not a recipient/key or submitted-data copy. Atomic leases and stable idempotency protect concurrent/restarted workers; changed mail settings after an attempted send fail safely. Transport/429/5xx/concurrent-409 failures retry with backoff; permanent rejection stops. Maximum five attempts within 23 hours respects the provider's [24-hour idempotency retention](https://resend.com/changelog/idempotency-keys). Expiry and cancellation never delete submissions. Soft deletion cancels unleased queued alerts; in-flight mail cannot be recalled. Sent means provider accepted, not mailbox delivery.

`npm run test:notifications-export` builds and executes the actual editor-downloaded application with MongoDB, native workers and a loopback email receiver. It exercises privacy, authentication, outages/retries, concurrency, crash-after-acceptance replay, bounds, expiry/cancellation and changed runtime settings. General queues/events/job administration, email templates/attachments/multiple recipients, bounces/webhooks, visitor confirmations, SQL/relational collections, actual containers and external provider delivery remain separate acceptance work.

## Verification

- `npm run check`: TypeScript, lint and unit tests, including contract identities, deleted mappings, form ownership, generated handlers, HTTP retry behavior, parameter validation and cache isolation.
- `npm run test:integration`: generated Express/MongoDB identity, workflow, policy, transaction, observability, rate-limit and vault regressions.
- `npx playwright test tests/e2e/routing-contract.spec.ts tests/e2e/backend-login.spec.ts`: inspector mappings, undo/redo, persistence and legacy login editing.
- `npm run test:fullstack-export`: creates a ZIP using the same exporter as the editor, extracts it, installs dependencies, builds the generated Next application and runs it with generated Express/MongoDB. Browser checks include required inputs, differently named frontend fields, real invalid credentials, exact POST payloads, Enter submission, HttpOnly session creation, success navigation and a simulated unavailable-service response.
- `npm run build`: builds the editor.

The fixtures and ZIP are in `.verification/mapped-login-e2e`; they contain no production credentials.

## Local full-stack editor preview

The editor's production build uses `next build --webpack`: the installed Turbopack version reads locked runtime files before applying output-tracing exclusions. Preview and verification directories are excluded from deployment output and checked by `tests/generated/preview-build.test.ts`. Local preview is enabled by the local launcher; an ordinary hosted `npm start` does not enable host execution.

`npm run test:preview` builds the editor, verifies deployment exclusions, and runs the three full-stack browser journeys against the built editor: real forms/operator inbox/mail/rebuild/cleanup, navigation/reload, and rejected configurations/cancelled startup.

Run `npm run dev` and open the editor at `http://127.0.0.1:3000` (or the configured PORT). For an already built editor, use `npm run start:local`. Preview → Local full-stack → Start runs the current compiler-generated Next.js frontend, Express APIs, disposable MongoDB replica set and supported email workers. It does not depend on exported archives or simulate saves. Generated frontend and Design simulation remain separate modes.

Each run gets temporary service ports, databases, session-cookie names, JWT/signing keys, operator setup codes and email credentials. The editor exposes generated account/inbox pages and runtime-only test setup codes. Enroll and sign in through the actual generated account page. Emails, including recovery/verification links, go to a loopback receiver and appear under Captured test emails; no external email provider is called. A remote MongoDB deployment setting still uses new local preview storage and is never connected to the remote database.

Reload retains test data. Rebuild recompiles current definitions and discards the old records/accounts/emails. Stop, closing preview, page unload and the 30-minute lifetime stop the runtime; normal shutdown removes its directory. The runner also stops its processes and cleans up after losing the editor connection. Compiler and startup failures show errors with a retry/rebuild path. Failed startup diagnostic output is bounded and retained only in the ignored run directory until Stop/rebuild. Forced termination or power loss can leave temporary files; they are not reusable project storage.

Management requires the configured loopback editor Host, same-origin JSON mutations and an HttpOnly SameSite owner capability. Another browser cannot inspect, stop or reuse a run. The runtime receives a small environment allowlist, not editor secrets. Services bind to loopback. The frontend iframe has a different port from the editor, allows scripts/forms and its own origin, disallows top navigation and restricts fetch/WebSocket and form requests to itself. Media, fonts and embedded frames retain their normal generated behavior. Its CSP permits framing only by the configured editor. This is process/data separation for validated compiler output, not an OS sandbox for arbitrary code.

Local preview supports MongoDB and up to eight services, with two concurrent runs and the latest 50 captured emails. Custom definitions (including unused imports), edited source, custom middleware, Environment Variable and HTTP Request blocks are rejected before execution. SQL adapters, custom-source container builds, external integrations, shared/hosted previews, production build parity and hosted worker/database scheduling remain separate work. Native npm installs use the generator's fixed dependencies and overrides with lifecycle scripts disabled; first use may download the MongoDB binary. Neither package preparation nor generated development-server readiness certifies production deployment.
