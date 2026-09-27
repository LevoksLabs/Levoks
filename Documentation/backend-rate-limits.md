# Generated backend rate limits

In the Backend Canvas, add a Rate Limit block and configure it in the inspector:

- **This service** applies the quota to application routes in the owning service.
- **Selected endpoints** applies it only to endpoints that select the block under **Endpoint rate limits**. Those endpoints share one quota. Route methods remain distinct; a GET attachment does not attach the POST route at the same path.
- **Every backend service** installs the policy in each generated service. Each service has its own quota, rather than one application-wide counter.

Configure maximum requests, window in minutes (one second to one day), and the public error message. A rejected request returns HTTP 429, a JSON `error` string, rate-limit headers and `Retry-After`. Missing references, duplicate attachments, unattached endpoint-scoped blocks and unsupported scoped middleware prevent export. Deleting a middleware block clears endpoint references; project history can undo the deletion.

## Counter storage

**Memory** preserves existing project behavior and needs no additional database writes. Counters are per process and reset on restart. Use only where that behavior is acceptable.

**Database** uses the service's existing `MONGO_URI`. Replicas must use the same generated service ID, block IDs and database to share quotas. The generated server initializes a TTL index on `levoks_rate_limits` before listening; database permissions must allow collection/index creation and reads/writes. No additional token or secret enters the project snapshot. The implementation uses the existing Mongoose/MongoDB dependencies, with MongoDB 4.2+ update pipelines.

Each counter is an atomic document updated using database time. Its key hashes the service ID, block ID, window and client IP. These hashes reduce accidental raw-IP exposure; they are not anonymization against someone with database access. Expired windows reset during the next increment, independently of delayed TTL cleanup. Writes request majority acknowledgement. Operations have a database time bound and a 1.5-second response deadline; failures return 503 through the generated error handler. A timed-out request can still consume quota if its database write completes later. There is no memory fallback that would silently reopen access.

Changing the window starts a new counter namespace. Changing the request limit keeps the existing usage. Deploy replicas with consistent configuration; mixed limits/windows during rollout have different enforcement behavior. Removing a block intentionally removes that quota; old counters expire through TTL cleanup.

The store implements the installed rate-limit package's [store contract](https://express-rate-limit.mintlify.app/guides/creating-a-store), using MongoDB's [atomic find-and-update operation](https://www.mongodb.com/docs/manual/reference/method/db.collection.findoneandupdate/). Startup initializes indexes explicitly because the installed v7 middleware does not await asynchronous store initialization.

## Boundaries and remaining work

- Client identity is currently the direct request IP. User/API-key strategies and configured trusted proxy topology remain internal work. The generated frontend gateway makes requests from the frontend server, so its visitors can share an IP quota at the backend; this is not a per-user quota. Do not enable blanket proxy trust to work around it.
- The built-in service ceiling of 120 requests/minute and generated identity limits still use memory counters. Configured database limits add enforcement; they do not replace those ceilings.
- Health routes stay available outside application throttling. Requests may still fail earlier CORS/body parsing checks before reaching configured rate limits.
- Other middleware types remain service-scoped; unsupported endpoint/backend scope is a compiler error. Full authorization is handled separately through endpoint authentication and workflow access policies.
- Database failover, proxy/load acceptance, per-user quotas and coordinated deployment configuration remain required before treating the complete production rate-limit requirement as COMPLETE.

## Evidence

`tests/integration/rate-limits-runtime.test.ts` runs generated Express processes and real MongoDB: endpoint isolation, shared selected-route quotas, service/backend policy installation, JSON 429/retry headers, window recovery, concurrent replica requests, persisted quota after restart, TTL-index creation, expired-record reset and fail-closed database outage. `tests/e2e/rate-limits.spec.ts` checks inspector state, endpoint attachment, undo/redo, save/reload and generated source. `tests/rate-limits.test.ts` checks configuration bounds and invalid references/scopes. Final run results are maintained in [completion-matrix.md](completion-matrix.md).
