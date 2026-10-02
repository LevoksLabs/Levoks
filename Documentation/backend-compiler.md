# Backend compiler

The existing frontend element model and canvas layout architecture are preserved. Full-stack contract bindings extend the existing routing resolver and frontend event generator; see [Full-stack contracts](fullstack-contracts.md).

Backend blocks persist as versioned configurations and ordered connections in the existing project document. `lowerBackend()` produces a version 1 Express backend IR containing services, database selections, typed block configurations, execution references, model/policy bindings, and service dependencies. It removes canvas positions, colors, and collapsed state and redacts credentials. Array order remains significant: it defines route precedence and execution order.

`validateBackendIR()` owns backend configuration and workflow diagnostics. `generateProject()` accepts this IR, validates it before generation, and emits `backend.ir.json` alongside Express, Mongoose, authentication, middleware, observability, and workflow modules. Application exports also include this IR under `levoks.ir.json.backend`. Invalid backend configurations produce diagnostics and no generated backend files. The existing export boundary also rejects invalid applications and stale source overrides.

The executable workflow IR uses the existing typed operation records and ordered IDs. Its generated runtime interprets those records; it never evaluates canvas text as JavaScript. Existing query, branch, loop, function, transaction, policy, and response behavior is retained. Legacy blocks without definition versions resolve to version 1; newer versions are rejected on import.

## Editable login

New Auth templates contain this chain:

```
Login Form (Routing submit connection)
  → POST /api/auth/login (editable to /api/login)
  → Validate credentials
  → Find account (MongoDB identity model + email binding)
  → Verify password (account lookup reference + password binding)
  → Issue session / JWT (verification reference + public output name)
  → Response (status + public output binding)
```

Select a backend block to edit its configuration and ordered next steps. The existing service workflow canvas can connect and position these operations. A saved legacy login endpoint can be expanded with **Make login workflow editable** in its inspector; this is one undoable edit. Existing saved projects retain their controller behavior until expanded. Connect a frontend form's submit port to the endpoint using the existing Routing canvas.

Credential bindings must reference required string fields in the endpoint request schema. Account lookup binds explicitly to the service's identity model. Verification and session blocks reference the preceding proof-producing block by ID. Response/transform bindings can access earlier public outputs, not raw request credentials. The Authentication block controls hashing cost, JWT expiry, refresh lifetime, idle expiry, and verified-email requirements.

The compiler requires lookup, verification, and session issuance in order, followed by one terminal response. The runtime holds user records and password verification proof outside bindable context. It checks passwords using bcrypt, including a dummy hash for absent accounts; disabled and unverified accounts follow existing identity rules. Session creation is deferred until the complete workflow and response succeed. JWT and refresh tokens use the existing service-scoped HttpOnly cookies, rotating refresh tokens, and revocation checks. The login route retains the identity rate limiter. Connected validation blocks execute only within their workflows; unattached legacy validation blocks retain service-wide behavior.

## Current boundaries

Database selection extends the resource runtime to PostgreSQL, MySQL, MariaDB and SQLite alongside MongoDB. See [database choices](databases.md) for service storage configuration, exported setup, supported query behavior and engine-specific boundaries. The existing identity, audit and shared quota implementations still require MongoDB.

Login workflows support linear validation, lookup, password verification, session issuance, transforms, and response operations. Branching authentication, generic queries against identity records, nested identity transactions, and arbitrary token signing are rejected. Ordinary resource workflows retain their existing branches and transactions. Registration, recovery, refresh, and session-management endpoints retain their existing lifecycle controllers. OAuth, API-key authentication, relationships, queues, storage, and other previously unsupported providers are not newly implemented.

## Model defaults and record lifecycle

Expand **Default for …** beneath a model field and enable **Use default** to supply a value when a new record omits that field. Disabling the option removes the default; an empty string is an explicit string default. Numbers and booleans use JSON literals (`0`, `false`), objects/arrays use JSON, dates use an ISO date or timestamp with a timezone, and ObjectIds use 24 hexadecimal characters. Defaults are data, never JavaScript expressions. Invalid types, dates, non-finite numbers and unsafe object keys produce inspector feedback and compiler errors. Explicit request-body contracts still control required input; inferred CRUD allows omitted model fields that have defaults.

**Model timestamps** controls generated `createdAt` and `updatedAt` fields. **Model soft delete** adds `deletedAt`, initially null. Both inferred CRUD and Query operations hide deleted records and prevent ordinary updates to them. Delete marks one matching record rather than removing it. Read Query operations (`find`, `findOne`, `count`, `aggregate`) expose **Deleted records**: hide, only deleted, or include deleted.

Use Query **restore** to clear the deletion timestamp or **purge** to permanently remove a deleted record. Both require a soft-delete model and an explicit filter; active or inaccessible records return 404. Every mutation filter binding must resolve before execution, so a missing request value cannot broaden a mutation. Query and endpoint access policies apply to deleted-record reads, restore and purge. Model-managed fields cannot be assigned by workflow values or inferred CRUD bodies. Transactions carry these operations in the same MongoDB session and roll them back on failure.

Unique indexes continue to reserve values held by deleted records until purge. Restoring does not create a new record. Resource soft deletion is distinct from identity-account disabling and session revocation; identity models still reject this option. Restore/purge endpoints are configured as explicit workflows, not inferred from route names. Referential actions, schema/data migrations and retention jobs remain unimplemented.

## Verification

`tests/backend-compiler.test.ts` covers layout-independent deterministic backend output, secret redaction, version rejection, invalid authentication graphs, private verification proof, deferred session creation, and a canvas form wired to `/api/login`.

`tests/e2e/backend-login.spec.ts` verifies legacy expansion, undo/redo, inspector editing, persistence, and generated workflow export. Existing identity HTTP/MongoDB tests exercise the new template's login steps, invalid credentials, refresh replay detection, revocation, disabled accounts, and password changes. Existing workflow integration tests cover owner/tenant policies and transaction rollback.

`tests/model-lifecycle.test.ts` checks typed default validation, persistence, generation and invalid configurations. `tests/e2e/model-lifecycle.spec.ts` edits defaults and lifecycle controls, checks errors, undo/redo and reload, and compares the downloaded ZIP with the compiler output. `tests/integration/model-lifecycle.test.ts` runs exported code against a real replica set and Express HTTP: all supported default types, timestamp opt-out, explicit overrides, deleted-record reads/aggregates, owner/tenant denial, unresolved-filter rejection, restore, purge and rollback of both lifecycle operations.
