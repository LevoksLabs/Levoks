# Generated backend rate limits

In the Backend Canvas, add a Rate Limit block and configure it in the inspector:

- **This service** applies the quota to application routes in the owning service.
- **Selected endpoints** applies it only to endpoints that select the block under **Endpoint rate limits**. Those endpoints share one quota. Route methods remain distinct; a GET attachment does not attach the POST route at the same path.
- **Every backend service** installs the policy in each generated service. Each service has its own quota, rather than one application-wide counter.

Configure maximum requests, window in minutes (one second to one day), and the public error message. A rejected request returns HTTP 429, a JSON `error` string, rate-limit headers and `Retry-After`. Missing references, duplicate attachments, unattached endpoint-scoped blocks and unsupported scoped middleware prevent export. Deleting a middleware block clears endpoint references; project history can undo the deletion.

## Client identity

**Client IP address** works for all scopes, including anonymous endpoints. **Signed-in user and tenant** works at selected-endpoint scope with **Auth Required** enabled on every attached endpoint. The generator runs IP limits first, then authentication, then user limits. Public identity lifecycle routes (login, registration, refresh, recovery and verification) reject user-quota attachment at compilation and retain IP protection.

User quotas key only the verified `sub` and optional `tenantId`. Two users behind the same gateway have separate configured quotas, and an identical subject in two tenants has separate quotas. Single-tenant identities without `tenantId` are supported. Invalid identity claims are rejected without falling back to an IP counter. Request identity headers and form fields cannot select the counter. Quotas do not replace authorization or the built-in service-wide IP ceiling.

## Counter storage

**Memory** preserves existing project behavior and needs no additional database writes. Counters are per process and reset on restart. Use only where that behavior is acceptable.

**Database** uses the service's existing `MONGO_URI`. Replicas must use the same generated service ID, block IDs and database to share quotas. The generated server initializes a TTL index on `levoks_rate_limits` before listening; database permissions must allow collection/index creation and reads/writes. No additional token or secret enters the project snapshot. The implementation uses the existing Mongoose/MongoDB dependencies, with MongoDB 4.2+ update pipelines.

Each counter is an atomic document updated using database time. Its key hashes the service ID, block ID, window, identity strategy and verified client identity. These hashes reduce accidental raw-IP exposure; they are not anonymization against someone with database access. Expired windows reset during the next increment, independently of delayed TTL cleanup. Writes request majority acknowledgement. Operations have a database time bound and a 1.5-second response deadline; failures return 503 through the generated error handler. A timed-out request can still consume quota if its database write completes later. There is no memory fallback that would silently reopen access.

Changing the window or identity strategy starts a new counter namespace. Existing IP counter keys remain compatible. Changing the request limit keeps the existing usage. Deploy replicas with consistent configuration; mixed limits/windows during rollout have different enforcement behavior. Removing a block intentionally removes that quota; old counters expire through TTL cleanup.

The store implements the installed rate-limit package's [store contract](https://express-rate-limit.mintlify.app/guides/creating-a-store), using MongoDB's [atomic find-and-update operation](https://www.mongodb.com/docs/manual/reference/method/db.collection.findoneandupdate/). Startup initializes indexes explicitly because the installed v7 middleware does not await asynchronous store initialization.

## Boundaries and remaining work

- API-key strategies and configured trusted proxy topology remain internal work. The generated frontend gateway shares its backend-facing IP across visitors. Use signed-in-user quotas for protected endpoints when appropriate; service-level IP ceilings still aggregate those visitors. Do not enable blanket proxy trust to work around it.
- The built-in service ceiling of 120 requests/minute and generated identity limits still use memory counters. Configured database limits add enforcement; they do not replace those ceilings.
- Health routes stay available outside application throttling. Requests may still fail earlier CORS/body parsing checks before reaching configured rate limits.
- Other middleware types remain service-scoped; unsupported endpoint/backend scope is a compiler error. Full authorization is handled separately through endpoint authentication and workflow access policies.
- Database failover, proxy/load acceptance and coordinated deployment configuration remain required before treating the complete production rate-limit requirement as COMPLETE.

## Evidence

`tests/integration/rate-limits-runtime.test.ts` runs generated Express processes and real MongoDB: endpoint isolation, shared selected-route quotas, service/backend policy installation, JSON 429/retry headers, window recovery, concurrent replica requests, persisted quota after restart, TTL-index creation, expired-record reset, fail-closed database outage, separate authenticated user/tenant quotas, invalid-token/claim rejection and forged-header resistance. `tests/e2e/rate-limits.spec.ts` checks inspector state, endpoint attachment, undo/redo, save/reload and generated source. `tests/rate-limits.test.ts` checks configuration bounds and invalid references/scopes. Final run results are maintained in [completion-matrix.md](completion-matrix.md).
