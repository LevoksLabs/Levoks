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

The endpoint inspector exposes body, query, path and response fields. Explicit query/path contracts validate and normalize scalar values on the server and discard undeclared values. Path contracts must cover each route placeholder; an explicitly declared string `id` supports slugs, while legacy CRUD paths retain MongoDB ID checks. Workflow responses with declared fields are checked before a login session is issued. Existing implicit lifecycle controllers retain their own response validation behavior.

The generated frontend still uses the same-origin Levoks API gateway, declared endpoint allowlist, deployment-origin configuration, scoped cookies, and refresh behavior. Internal models and workflow blocks are not frontend destinations. Routing service-to-service edges chain endpoint requests in the triggering frontend flow; server-side upstream calls use the HTTP Request workflow block.

## Added executable capabilities

- **HTTP Request:** fixed upstream path, method, query/body bindings, origin environment variable, optional bearer-secret environment variable, timeout and GET retries. Supports JSON REST and GraphQL requests. The runtime rejects redirects, limits responses to 1 MB, and observes the existing workflow deadline. Errors enter the existing try/catch workflow. Mutation retries and HTTP calls inside retried database transactions are rejected.
- **Cache:** get/set/delete, namespace, key/value bindings and TTL. Entries are scoped by user and tenant and strip sensitive output fields. This is a process-local cache (256 entries, 64 KB each, TTL up to one hour), not a distributed or durable store. Transaction use is rejected.
- **Query pagination:** optional page binding, existing filtering/sorting/access policies, and existing per-page limit. Pages are bounded to 1–10,000; invalid values fail rather than causing unbounded reads.
- **Integration Service template:** endpoint → HTTP request → response, plus origin configuration.
- **Catalog Service template:** model and endpoint → filtered, sorted, paginated query → response.

Templates create normal blocks and connections; every block is editable/removable. Existing Auth, CRUD and Chat starters are retained. Chat remains an architecture starter, not a new WebSocket runtime. OAuth providers, general queues/jobs, file storage and arbitrary custom JavaScript execution are not added by this change.

## Verification

- `npm run check`: TypeScript, lint and unit tests, including contract identities, deleted mappings, form ownership, generated handlers, HTTP retry behavior, parameter validation and cache isolation.
- `npm run test:integration`: generated Express/MongoDB identity, workflow, policy, transaction, observability, rate-limit and vault regressions.
- `npx playwright test tests/e2e/routing-contract.spec.ts tests/e2e/backend-login.spec.ts`: inspector mappings, undo/redo, persistence and legacy login editing.
- `npm run test:fullstack-export`: creates a ZIP using the same exporter as the editor, extracts it, installs dependencies, builds the generated Next application and runs it with generated Express/MongoDB. Browser checks include required inputs, differently named frontend fields, real invalid credentials, exact POST payloads, Enter submission, HttpOnly session creation, success navigation and a simulated unavailable-service response.
- `npm run build`: builds the editor.

The fixtures and ZIP are in `.verification/mapped-login-e2e`; they contain no production credentials.
