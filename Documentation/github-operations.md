# GitHub Connections operations

Connections stores a repository/branch, recorded remote head, synchronization status and 30 recent results in MongoDB. Its credential is encrypted in the vault under a separate connection namespace, outside project snapshots and application secrets. The browser can replace authorization but cannot retrieve the saved credential.

## Configure the editor and worker

1. Configure editor OAuth (`NEXTAUTH_URL`, `NEXTAUTH_SECRET`, provider client credentials) and `MONGODB_URI` with an explicit database. Repository access is a separate fine-grained GitHub personal access token, scoped to the selected repository with Contents read/write. Repository creation additionally needs the corresponding GitHub account permissions.
2. Set `LEVOKS_SECRET_KEYS` to a JSON map of key IDs to cryptographically random base64-encoded 32-byte keys, and `LEVOKS_ACTIVE_SECRET_KEY` to the active ID. Configure the same database and vault keyring on the worker. Keep these values in the host's environment/secret manager; never commit them.
3. Run `npm run worker:github` as a supervised long-running process alongside the web server. It reads environment variables supplied by the host; it does not automatically read `.env.local`. Alternatively build `docker build --target github-worker -t levoks-github-worker .` and inject the environment at runtime. The image runs as the non-root `node` user. Docker build/runtime verification remains gated by the unavailable Docker executable in this development environment.
4. In the editor, open **Connections**, supply the token, find a repository, choose a branch, review managed-file changes and connect the reviewed head. Private repository creation, branch creation and empty-repository initialization require explicit button actions. Existing repository files outside `levoks/<project-id>/` are preserved.
5. **Queue current application** validates and durably saves the current snapshot before acknowledging it. The worker compiles that snapshot and commits it. **Automatically commit cloud saves** makes the worker discover new saved cloud revisions, debounce them for five minutes and commit without an open browser. Local-only edits are not uploaded by this option: save to the account in Projects, or explicitly queue the current application.

## Recovery and conflicts

Workers claim an expiring MongoDB lease and refresh it while running. A lease check immediately precedes the GitHub ref mutation. Concurrent edits queue a newer snapshot without marking it processed when an older snapshot finishes. Provider outages use bounded exponential retries; expired/insufficient credentials and branch conflicts pause the connection. A worker crash after a successful GitHub update is recoverable when the remote commit matches the operation ID, original parent and all managed files. If another commit or newer queued snapshot makes this ambiguous, synchronization stops for review. Updates always use `force: false`; branch protection is respected.

To recover a conflict, cancel pending synchronization, review the latest branch and reconnect, then queue the desired application. Review any remote code edits before replacing generated files; automatic merging of arbitrary remote source into the visual IR is not implemented. To replace an expired token, cancel pending synchronization and reconnect with the replacement token. Disconnecting requires pending/running work to finish or be canceled, then deletes the encrypted credential. Failed worker storage operations log a generic error without provider tokens or project contents.

The Connections view reports worker freshness using the database heartbeat. A stale/offline worker leaves work queued. Supervise and restart the worker with your hosting platform; monitor `levoks_workers.heartbeat`, queued age and connection failure states. General metrics/alerting and automatic vault-key re-encryption for connection credentials remain internal work.

## Verification boundaries

Real MongoDB integration tests cover persistence across store instances, owner isolation, encrypted credentials, stale editor conflicts, worker exclusivity, expired-lease fencing, concurrent snapshots, scheduling, cloud revision discovery, reconnection and credential deletion. GitHub contract tests cover managed-path diffs, non-force updates, remote-head conflicts and lost-acknowledgement recovery using controlled HTTP responses. These are not live GitHub verification.

Live verification requires signing in and connecting a disposable GitHub repository through Connections (do not paste a token into chat). After access is available: discover repositories/branches, create a test branch, queue source, close the editor, verify the actual worker commit and history, make a competing remote commit to confirm a non-force conflict, revoke the test token and verify reauthorization, then reconnect. GitHub App installation/OAuth repository authorization and automatic expiring-token refresh are still missing; the shipped authorization path in this stage is a scoped PAT with explicit replacement.

Provider contracts follow [GitHub repository APIs](https://docs.github.com/en/rest/repos/repos), [branch APIs](https://docs.github.com/en/rest/branches/branches) and [non-force reference updates](https://docs.github.com/en/rest/git/refs).
