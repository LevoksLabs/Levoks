# Alpha project collaboration

Updated 11 October 2026. The current target is alpha collaboration with **Owner, Editor and Viewer**. Deployment, billing and the other product workstreams are deferred by the user. Their existing implementations and backlog remain available.

| Role | Alpha permissions |
| --- | --- |
| Owner | Read/edit/save the project; create or revoke invitations; change Editor/Viewer grants; remove collaborators; delete the shared cloud project with name confirmation. |
| Editor | Read/edit/save the shared project and keep a device draft. Cannot manage access or delete the cloud project. |
| Viewer | Inspect project pages, backend/routing data and download a copy. No editor controls or editing shortcuts; the API rejects saves. |

Each project has one fixed owner. Ownership transfer and organization-level roles are outside this alpha scope. Sharing grants access to the project document, including authored source and assets. It does not share provider credentials, connection management or the owner's secret vault. Declared secrets continue to be redacted before cloud saving.

## Use sharing

Sign in and use the project menu's **Save to account**, then **Share project**. Alternatively, Home → Cloud projects → **Open shared workspace** → **Project sharing**. Choose Editor or Viewer, create an invitation, copy it and send it to one trusted person. Levoks does not send email invitations.

Invitation tokens have 256 bits of randomness. The server stores only a SHA-256 hash, returns the token only when creating the link, and hides invitation hashes from access metadata. Links use a URL fragment; ordinary page navigation and access-query logs do not include the token. The browser sends it in a private header for preview and in the same-origin acceptance body. Sign-in is required. A valid link is usable by the first signed-in recipient, is accepted atomically once, and expires after seven days. Owners can revoke unused links. Existing grants are retained on acceptance retries; an invitation does not replace an existing member's role. Limits are 50 collaborators and 20 unexpired pending invitations per project.

Before sign-in the browser retains the invitation in session storage; the authentication callback contains only the invitation page path. After acceptance that stored token is removed. Existing members can reopen an already used link without changing their grant, including recovery after an interrupted acceptance response.

The recipient explicitly accepts the invitation, then opens the shared workspace. Shared projects appear in their Cloud projects list with their role. Owners can change Editor/Viewer grants or remove members through Project sharing. Access updates use their own revision so concurrent invite acceptance or administration cannot silently overwrite another grant.

## Shared saves and recovery

Edits are autosaved on the current device; **Save shared project** explicitly publishes the captured document. This alpha uses optimistic revisions, without live cursors or merged simultaneous editing. Of two saves based on one revision, at most one succeeds. A stale save preserves the device draft and instructs the user to download a backup and open the latest cloud version. **Back up draft & open latest** downloads the draft before replacing it. A same-tab reload recovers a pending local draft with its original expected cloud revision. Opening a conflicting existing device copy preserves it through a download before restoration.

Grant checks and document updates share one MongoDB record. Every save checks the Editor grant atomically with its expected document revision; demoted or removed accounts cannot publish stale edits. Reads and lists also enforce current membership. The screen refreshes grants every 15 seconds while visible and when the window gains focus. A demoted Editor loses editing controls; a revoked account sees an access-removed state and can download its retained device draft. Removing access cannot retract already downloaded files or cached device copies.

An Owner's confirmed deletion atomically removes the cloud document, grants and invitations. It leaves device copies intact. The fixed Owner role cannot be changed or removed by membership operations.

## Setup and acceptance

Use the existing editor OAuth sign-in, `NEXTAUTH_SECRET` and `MONGODB_URI`. No extra provider, package, email service or billing configuration is required. The existing owner-scoped cloud records remain compatible; absent member/access fields mean an unshared project with access revision zero.

Cloud writes omit optional `undefined` fields when encoding BSON, preserving the project JSON contract rather than introducing invalid `null` values. Populated two-page projects are validated again after database persistence and through the HTTP/browser boundary. Shared workspaces subscribe to the existing editor/backend/routing autosave and history mechanisms even when entered directly from an invitation.

`npx tsx --test tests/integration/collaboration.test.ts` runs real MongoDB, a separate Next server with locally signed test sessions and cached Chromium. It uses disposable records and a unique private build directory, and terminates only its own server. Local sessions exercise the application's authorization boundary without claiming live OAuth-provider acceptance. The test covers roles, invite expiry/revocation/consumption races, owner isolation, stale administration and saves, API same-origin/account-change checks, browser editing/draft recovery, Viewer controls and membership revocation.

## Verified alpha acceptance — 11 October 2026

| Check | Result | Local evidence |
| --- | --- | --- |
| Repository unit tests | 205 passed, zero failures | `.verification/collaboration-units-final.log` |
| Real MongoDB/API/Chromium collaboration journey | Passed; populated two-page documents, all three roles, invitations, shared saves, conflict recovery, demotion/removal and confirmed deletion | `.verification/collaboration-acceptance-final.log` |
| Existing account cloud-save regression | Passed; owner isolation and document revision behavior preserved | `.verification/collaboration-cloud-regression.log` |
| Targeted ESLint | Zero errors; three existing warnings in WorkspaceHub/ProjectDashboard | `.verification/collaboration-lint-final.log` |
| Sequential post-build TypeScript | Passed with zero errors | `.verification/collaboration-types-postbuild.log` |
| Production build and private-output pruning | Passed; invitation/shared routes included and private runtime references excluded | `.verification/collaboration-build-final.log` |

Owner desktop/compact and Viewer mobile screenshots were reviewed. The Viewer journey also checks page navigation, Home discovery and absence of horizontal viewport overflow. These results cover the current alpha collaboration target; deployment, billing, live external-provider verification and broader whole-product acceptance remain deferred.
