# Database choices for generated applications

Each backend service has **Settings → Database & storage**. Select MongoDB, PostgreSQL, MySQL, MariaDB or SQLite. Services can use different engines in one application. Existing projects without a selection keep MongoDB. This setting does not change Levoks's own project storage.

| Choice | Where records live | Runtime configuration |
| --- | --- | --- |
| MongoDB | Local/self-hosted server or a compatible managed provider | Connection URL, normally `MONGO_URI` |
| PostgreSQL | Local/self-hosted server or a compatible managed provider | PostgreSQL URL, normally `DATABASE_URL` |
| MySQL / MariaDB | Local/self-hosted server or a compatible managed provider | MySQL URL, normally `DATABASE_URL` |
| SQLite | A local persistent file | Filename in `./data`; `DATABASE_FILE` can select another absolute/relative path |

The connection environment variable is configurable per service. Only its name is saved in the project. Set its value in the exported service's `.env` or hosting environment. Do not enter passwords in an Environment Variable block. Managed databases are connected using their provider's URL; Levoks does not create a provider account or provision a hosted database.

**Require TLS** is enabled when selecting remote storage. Certificates are verified. For a private CA, set `DATABASE_CA_FILE` to a PEM file in the deployed service. SQL URLs may include `sslmode=require`, `verify-ca` or `verify-full`, which also enable verified TLS; other query options are rejected explicitly. For local Compose database containers, leave Require TLS off; those containers do not install certificates. A separately operated TLS server can be connected through the remote option.

## Export and run

The selected engine changes the service's driver dependencies, models, query execution, connection configuration, readiness probe, setup command and Compose storage. SQL exports use Knex with `pg`, `mysql2` or `better-sqlite3`; MongoDB keeps Mongoose. The common workflow interpreter continues enforcing owner/tenant policies, bounded operations and transactions. The backend IR target is `express-database` when any service uses SQL; legacy MongoDB-only exports retain `express-mongoose`.

For a standalone service, install its dependencies, copy `.env.example` to `.env`, and supply its connection value. SQL services require `npm run db:migrate` once before `npm start`. MongoDB retains its existing model/index initialization. The identity email worker uses the same selected MongoDB connection as its service.

For Compose, copy the backend root `.env.example` to `.env` and fill the required variables. Each SQL server password has a service-prefixed variable; use a random URL-safe password, such as a 64-character hex secret. Remote connection URLs also have service-prefixed variables to avoid collisions. Run `docker compose run --rm <service> npm run db:migrate` for each SQL service, then `docker compose up -d`.

Local SQL servers and SQLite use persistent named volumes; database ports are not published. Newly configured MongoDB containers use a single-member replica set so resource transactions can run. Untouched legacy MongoDB services retain the old `mongodb` service and `mongo-data` volume even when another service switches to SQL. Remote selections do not provision local database containers. Back up the actual database or SQLite file independently of the project JSON.

## Supported behavior and boundaries

SQL resource services execute CRUD, typed defaults, required/unique/index constraints, timestamps, deleted-record reads/restore/purge, filtering, sorting, pagination, grouped aggregates and transaction rollback. Values use parameter binding. Existing 24-character hexadecimal IDs are retained for API compatibility. JSON values persist with their types; indexed text is limited to 191 characters. Identifier length and case collisions are validated for portability.

Initial SQL setup refuses to adopt existing application tables and records a model fingerprint. Startup rejects a changed fingerprint. Schema changes need a reviewed data/schema migration; the setup command never drops tables or automatically migrates between engines. Defaults and timestamps are applied by generated application writes, not by independent SQL clients. A failed initial setup can leave partially created tables; inspect the disposable/new database before retrying. Run setup once before starting replicas.

Identity account controllers, durable audit-log blocks and MongoDB-backed rate-limit stores still require MongoDB. These configurations produce compiler errors when attached to SQL services. A SQL resource service can verify sessions through a separate MongoDB identity service. Memory rate limits and error/request logging work on SQL. Relations and referential actions remain the separate unfinished product requirement BE06. SQLite is a file database with one connection per process; use a server engine for multiple replicas.

## Verification

- `tests/databases.test.ts`: all engine/location combinations, project persistence, emitted dependencies/configuration/IR, remote environment references, incompatible blocks, unsafe configuration and unchanged legacy volumes in mixed exports.
- `tests/e2e/databases.spec.ts`: actual engine/location editing, undo/redo, save/reload, TLS defaults and a downloaded SQLite application ZIP. Desktop/compact inspector screenshots were reviewed; the detector reports no findings on the changed inspector.
- The actual downloaded SQLite ZIP was extracted separately, its 15 JavaScript modules checked, its emitted setup command run, and persisted model creation/read executed successfully (`.verification/database-downloaded-runtime.log`).
- `tests/integration/sql-database.test.ts`: actual generated SQL execution, typed defaults/aggregates, policy denial, restore/purge rollback, duplicate-key errors, schema mismatch rejection, real HTTP requests and persisted reads after a service restart. SQLite runs by default. Supply disposable database URLs through `LEVOKS_TEST_POSTGRESQL`, `LEVOKS_TEST_MYSQL` and `LEVOKS_TEST_MARIADB` for the other engines. The test initializes application tables; use empty test databases only.
- Local acceptance used real PostgreSQL 17.10, MySQL 8.4.11 and MariaDB 11.4.9 processes with temporary databases, plus SQLite and the existing MongoDB replica-set suite. Evidence is in `.verification/database-postgres.log`, `database-mysql.log`, `database-mariadb.log`, `database-all-integration.log` and the browser/build/check logs. Test servers were stopped afterwards. No hosted-provider or container-runtime acceptance is claimed; Docker is unavailable on this host.

Implementation references: [Knex configuration](https://knexjs.org/guide/), [schema builder](https://knexjs.org/guide/schema-builder.html) and [transactions](https://knexjs.org/guide/transactions.html).
