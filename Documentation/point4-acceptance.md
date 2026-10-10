# Point 4: forms, nested editing and responsive polish

10 October 2026. Point 4 is completed locally across its full authoring scope. This expanded pass supersedes the earlier supported-subset completion and closes its deferred custom-breakpoint, projective/vector geometry, legacy property, structured-content and durable-history work. The broader product roadmap and external acceptance remain separate. No site was published and no paid AI or external provider write was performed.

| Area | Completed behavior |
| --- | --- |
| Forms | Native text, URL, date/time, choice, consent, selection-count controls; bounded custom text masks; multiple attachments and stable labels. Browser constraints and guided server validation agree. |
| Conditional sections | Boolean/select/radio/checkbox-group sources; All/Any combinations; inherited conditions; hidden-value omission and active requirements in browser and server. Invalid/cyclic references are repairable. |
| Nested/reusable editing | Nested choice wrappers retain one field mapping. Linked instances support local structure editing, restore and explicit publication. Copies preserve/remap conditions and labels. |
| Geometry | Drag/resize and vector anchors/control handles map through ancestor perspective, rotation, skew, scale, origin and canvas zoom. Opposite resize anchors remain stable. Flow resize/root dragging preserve flow slots; grouping requires positioned siblings at every breakpoint. Unsafe 3D flattening keeps group wrappers. Keyboard edits and atomic Undo/cancel work. |
| Responsive authoring | Twelve optional named breakpoints extend Desktop/Tablet/Mobile with shared cascade rules. Add/edit/remove, reusable definitions, history, save/reopen, preview and exported CSS agree. Templates, field helpers and full starter pages stay contained and reachable. |
| Content/widgets | Visual Rich Text blocks and span formatting; editable Timeline events; validated Map coordinates/zoom; native tooltip/popover placement, nested Escape/focus return, four-edge modal drawers and sticky/timed notifications with hover/focus pause. |
| Property parity | Canonical canvas/HTML/React styles support Menu URLs/direction, Social Bar links/size/style, Gallery columns/gap, Repeater direction/gap and Spacer height. Base transforms compose with animations. Shared generated runtimes eliminate Node/browser source drift. |
| Durable local history | Redacted bounded Undo/Redo journals survive save/reopen, including source/project-name edits and active autosaved typing. Account scoping, document-head checks and existing compare-and-save prevent stale history from replacing valid documents. History is excluded from exports/cloud/checkpoints. |
| Working sites | Studio, Maker and Workshop have working navigation, validated storage, retry/reset behavior and authenticated operator inboxes. Editor editing/history/save/reload/preview/ZIP and production runtimes are exercised. |
| Local accessibility | Associated field instructions, label focus, named controls, repairable errors, keyboard vector handles and native widget/modal focus behavior. The configured catalog checks 106 definitions at four widths. |

Exact limits are recorded in [full-stack contracts](fullstack-contracts.md#point-4-authoring-contracts).

## Verification

`npm run check` passes TypeScript, lint (zero errors / 44 existing warnings) and all 205 unit tests. The production editor build, private-output pruning and sequential post-build TypeScript pass. `git diff --check` passes.

`npm run test:point4-export` passes 35 editor/browser journeys across thirteen specification files. This covers actual controls, editing, keyboard behavior, transformed/nested manipulation, reusable components, custom breakpoints, persistent Undo/Redo, invalid configuration, real save/reopen and every-file parity for downloaded applications. After the final flow-root grouping guard, all eight design-tool browser journeys were rerun successfully and the unit suite passed again. Catalog coverage is 106 definitions x four widths (320/768/1024/1440px), or 424 configured layout/name checks. It covers local configurations rather than every possible property combination.

Six actual browser-downloaded applications match the current compiler, build successfully and pass production acceptance:

- Attachment form: count/extension/byte checks, two 450 KiB files, a request exceeding the old 1 MiB limit, forged/oversized rejection, exact private persisted/downloaded bytes, pagination, deletion/revocation/sign-out, reset and outage/retry.
- Compound/nested form: choice-driven All/Any conditions, hidden-field omission, active Required checks, literal `$` choices, masks, forged requests without extra writes, retained entries, reset and outage/retry.
- Studio, Maker and Workshop: four-width page/form containment, navigation, requirements, real persisted submissions, invalid server requests without writes, reset/reload, backend restart/retry and first-operator enrollment/sign-in/private inbox reads.
- Expanded authoring application: structured Rich Text/Timeline output, custom breakpoint geometry across five widths, native floating/modal/notification widgets, focus return, configured map URLs, menu navigation/social links, Gallery/Repeater/Spacer parity and 3D SVG output without JavaScript errors.

`npm run test:design-export` separately passes production widget/responsive/motion acceptance. Editor and generated screenshots are reviewed for containment and visible content. Earlier reviews led to helper wrapping, flow positioning and long-page clipping fixes; regression assertions cover those boundaries.

Reproduce with `npm run test:point4-export`, `npm run test:design-export`, `npm run check` and `npm run build`. The export command installs generated dependencies and uses disposable local MongoDB and Chromium. `npm run test:point4-runtime` repeats production builds/runtime against existing archives only after verifying parity with current compiler output. Runtime sources are synchronized by `sync:export-runtimes`, run before dev/build, and checked by a unit test.

Current ignored evidence: `.verification/point4-complete-check.log`, `point4-complete-export.log`, `point4-complete-design.log`, `point4-complete-editor-build.log`, `point4-complete-postbuild-types.log`, `point4-edge-final.log`, `point4-final-grouping-browser.log`, `point4-results/`, `point4-report/`, `catalog-layout/results.json`, `point4-completion/`, `site-starters/` and `attachments/`.

## Remaining work belongs to other points

The generated backend production-only dependency audit reports zero advisories. Its development-only nodemon/chokidar/braces chain reports three high-severity advisories; watcher dependency maintenance remains in the backend/infrastructure ledger. No forced downgrade was applied.

General object storage, signed uploads/content scanning, hosted assets, quotas/retention, SQL/provider infrastructure, richer live-record actions, managed deployment, collaboration and billing remain points 3/5. Attachment storage here is bounded and atomically managed with submissions, with private inbox downloads; later visual validation edits require explicit backend/mapping review.

Physical touch devices, screen-reader sessions, other browser engines, remote media/map interaction, provider sandboxes and container/deployment acceptance remain point 6. Map URLs are configured and generated correctly; remote map service operation is not certified by local tests. Configured Chromium layouts and control names do not certify full WCAG conformance. Broad matrix rows preserve those wider limits without leaving the local point 4 implementation unfinished.
