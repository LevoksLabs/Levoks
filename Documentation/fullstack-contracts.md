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

The generated public endpoint returns only a receipt, with no submitted data or record ID. No GET/update/delete endpoint is created. A submission inbox and operator account/permission setup remain unimplemented; add authenticated access policies before exposing stored records. Do not turn a public form into an anonymous read API. The default limiter permits 20 requests per 15 minutes per backend-observed IP, including invalid requests. It uses process-local counters, resets on restart, and visitors behind a gateway share its IP quota. Shared MongoDB counters are an existing Backend option; trusted proxy/client attribution and bot protection still require separate implementation/acceptance.

Generated frontend preview reports that no data was sent or saved: it does not run the backend. Download the application and configure the generated database/runtime to test actual saves. Isolated full-stack preview, notification delivery, public upload handling, administrative inbox and a complete business-site starter remain open.

`npm run test:form-export` exercises real drag/drop and form configuration, history, persistence, mobile preview and ZIP download, then builds the actual downloaded Next/Express project and runs it against disposable MongoDB. It verifies save/retry/reset, server validation, unknown/managed-field exclusion, denied public reads/edits, quota exhaustion and durable records after backend restart. The reusable extraction script accepts archive and output-directory arguments; its original canvas defaults are retained.

## Verification

- `npm run check`: TypeScript, lint and unit tests, including contract identities, deleted mappings, form ownership, generated handlers, HTTP retry behavior, parameter validation and cache isolation.
- `npm run test:integration`: generated Express/MongoDB identity, workflow, policy, transaction, observability, rate-limit and vault regressions.
- `npx playwright test tests/e2e/routing-contract.spec.ts tests/e2e/backend-login.spec.ts`: inspector mappings, undo/redo, persistence and legacy login editing.
- `npm run test:fullstack-export`: creates a ZIP using the same exporter as the editor, extracts it, installs dependencies, builds the generated Next application and runs it with generated Express/MongoDB. Browser checks include required inputs, differently named frontend fields, real invalid credentials, exact POST payloads, Enter submission, HttpOnly session creation, success navigation and a simulated unavailable-service response.
- `npm run build`: builds the editor.

The fixtures and ZIP are in `.verification/mapped-login-e2e`; they contain no production credentials.
