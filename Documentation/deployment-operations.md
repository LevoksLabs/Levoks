# Managed frontend deployment

Updated 10 October 2026. This is the first managed-deployment increment. It deploys a Next.js frontend preview to an existing Vercel project. Express services, databases and generated email workers still require a separate host. Provider build readiness does not establish full application readiness.

## Configure

The editor and the separately supervised worker need `MONGODB_URI`, `LEVOKS_SECRET_KEYS` and `LEVOKS_ACTIVE_SECRET_KEY`. Use the same database and AES keyring on both processes. Retain old encryption keys while any records still use them. OAuth sign-in must be configured for the editor.

Run `npm run worker:deployment` with these variables in the process environment. The worker leases saved jobs, submits previews and polls the provider independently of the browser. It publishes a database heartbeat; the panel labels it offline after two minutes without a heartbeat. An offline worker leaves snapshots safely queued. Supervise and restart it as a separate service.

In **Deploy → Managed frontend preview**, enter the existing Vercel Next.js project's name and `prj_` identifier, optional `team_` identifier, and a scoped access token. Save the connection before queuing a release. Saving verifies project access/name/framework but does not create a deployment. The token is stored with authenticated encryption in a deployment-specific vault namespace, never returned by the API, and cleared from the input after saving. It is absent from project JSON, browser storage and exported code.

Enter an HTTPS origin for every authored backend service. Queuing validates the entire project and compiler diagnostics on the server, captures its current source overrides, and persists one snapshot. Before submission, the worker compares regenerated source/configuration with the queued digest; changed compiler output requires a reviewed new release. API origins are persisted with the connection; they contain no credentials. The worker uploads frontend files only, omits environment examples and injects a controlled `.env.production` containing these public origins. Backend credentials and hosting remain separate responsibilities. Only preview deployments are created; production aliases are not promoted.

## Releases, failures and recovery

Only one release can be active per account/project connection. Connection versions and queue sequences reject stale editors. The browser retries an interrupted queue request with the original operation ID and snapshot; identical concurrent retries create one job. Account changes and cross-origin mutations are rejected. Connection reads and responses explicitly disable caching.

The latest 30 release summaries are retained. Each records the operation ID, source/configuration digest, sequence, timestamps, provider ID/state and safe message. Completed jobs discard their project snapshot. A provider `READY` state enables the verified preview URL. `ERROR`, `BLOCKED` and `CANCELED` are terminal. A queued job may be canceled before a worker leases it. Canceling a provider build after submission uses the Vercel dashboard.

Before submitting, the worker durably records that a POST is about to occur. Concurrent workers use expiring, fenced MongoDB leases; expired workers cannot update release records. After a timeout, malformed acknowledgement or crash, a new worker searches up to five pages of provider history for the exact operation metadata and checks the returned deployment's project/operation before attaching it. It never automatically repeats an uncertain create request. Status failures use bounded backoff and stop after five attempts; **Resume status tracking** schedules another read/recovery attempt. Authorization can be replaced for the same target when no worker holds a lease, including while an uncertain release remains active.

An uncertain submission absent from the bounded provider search remains in **attention** and blocks another release. Review the provider project; automatic abandonment and duplicate submission are deliberately unavailable. This includes a crash between marking the submission and making the POST. Full operator reconciliation, disconnect/retention administration, archived source artifacts and rollback remain future increments.

Provider error bodies and arbitrary build logs are never copied into release history. Logs are currently inspected in the provider dashboard; in-product log streaming/redaction is not implemented.

## Acceptance evidence

- `npx tsx --test tests/deployment.test.ts tests/integrations.test.ts tests/integration/deployments.test.ts`: 14 passing tests. Actual MongoDB and a loopback HTTP provider verify worker restart, concurrent queue retries, lease fencing, token encryption/rotation, cross-account denial, cancellation, provider rejection, reduced create acknowledgements and lost-acknowledgement recovery without duplicate builds.
- `npx tsx --test tests/integration/deployment-api.test.ts`: real Next.js + signed NextAuth sessions + MongoDB pass authentication, account changes, same-origin protection, stale/duplicate queue requests, metadata privacy and cancellation. Its independent build directory avoids sharing an existing test server or cookies.
- `npx playwright test tests/e2e/deployment.spec.ts`: two passing Chromium workflows cover guest denial, settings validation, token clearing, queue request retry, cancellation, save/reload, persisted ready links and 1600/1024px layout. Browser tests use controlled API metadata; they are not live-provider evidence.
- Editor regression/build results are recorded in the deployment entry of `completion-matrix.md`.

The adapter was checked against the official [create deployment](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment), [list deployments](https://vercel.com/docs/rest-api/deployments/list-deployments) and [API authentication/team scope](https://vercel.com/docs/rest-api) documentation. This checks the documented contract, not actual account permissions or a hosted build.

No Vercel sandbox connection or Docker executable is configured in this environment. Live Vercel create/build/readiness/revocation and generated-container execution are therefore unverified. Configure a disposable Vercel project through the panel to exercise them. No production website was deployed.

## Remaining managed-deployment requirements

Full-stack provider selection and orchestration, worker/database provisioning, regions/resources/scaling, environment-specific runtime secret injection, domains/TLS, runtime health/rollout gates, archived releases/rollback, monitoring and backup restoration remain open. Collaboration and billing are separate workstreams; this increment does not change their completion status.
