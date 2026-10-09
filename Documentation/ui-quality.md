# Editor quality audit and verification

## Local full-stack preview — 9 October 2026

The preview mode selector exposes the actual local generated application alongside frontend preview and design simulation. The local mode replaces the decorative URL/navigation toolbar with Start, Rebuild, Stop, Reload and generated account/inbox shortcuts. Controls wrap at the selected mobile width; runtime-only setup codes and captured mail use native disclosure controls. Pages stay hidden until their generated controls are ready, and Reload waits until the current route is known. Real submissions, operator sign-in, shortcut/navigation/reload, rebuild and cancellation pass browser execution. Desktop and mobile screenshots are preserved in `audit-2026-10-08/fullstack-preview-*.png`. Wider editor accessibility/touch acceptance and custom-source/container/hosted preview remain open.

## Header and account refinements — 4 October 2026

The logo now opens the existing project workspace without navigating away from current edits. The account dropdown has named menu semantics, Arrow/Home/End navigation, Escape dismissal with focus return, and closes when focus leaves. Its bounded width truncates long account details and its opaque background keeps underlying canvas controls from showing through.

Profile now uses the same native modal approach as the other editor dialogs: an accessible name, labelled close button, initial focus, Escape dismissal, focus return, and an inert editor behind it. Long names and email addresses wrap inside the panel. Project navigation remains available from both the menu and Profile. Shortcut help now correctly describes shared undo/redo across canvases.

Verification: `tests/e2e/account-ui.spec.ts` exercises keyboard and pointer paths at 1600, 1366 and 1024 pixels, including attempted background focus and canvas shortcuts while Profile is open. It passes alongside the four existing editor-quality workflows (`.verification/minor-ui-browser-final.log`). TypeScript passes; targeted lint has no errors and four existing image warnings. One detector scan returned no findings. Two bounded visual review rounds confirmed layout and the dropdown background correction; screenshots use the `minor-ui-menu-*` and `minor-ui-profile-*` names in `.verification/`. Session data is controlled for these UI checks; account management and live OAuth acceptance remain separate unfinished work.

Updated 2026-09-20. Scope: the user's dedicated UI/UX brief, `levoks.md`, `production-readiness.md` and the existing implementation. This document separates a verified improvement from completion of the full product requirement. No backend feature is promoted to complete because its panel looks finished.

## Direction and scope

The editor uses graphite surfaces, violet from the existing Levoks mark, restrained borders, one icon family, compact labels and a visible artboard. Shared colors, surfaces, dimensions and motion live in `src/app/globals.css`; scoped editor styles live in `src/app/editor.css`. See `DESIGN.md` for the design rules. Generated website content retains its own colors and layout.

Impeccable's operating-interface guidance and Ponytail's preference for existing platform capabilities informed this pass. HyperFrames motion principles informed short, purposeful transitions and reduced-motion behavior. No Remotion or HyperFrames video runtime was added: this work is an interactive editor, not a video composition. The requested Taste/Anthropic design skills were not found in the installed skill catalog.

## Surface audit

| Surface | Starting issue | Implemented and verified | Remaining acceptance work |
| --- | --- | --- | --- |
| Header | Competing action styles, limited status hierarchy | Compact actions; direct Connections; Deploy label; named undo/redo; saved/pending/error indicators; laptop layout | Full specified Files hierarchy; expanded Deploy/Commit interaction |
| Tray / Sub-Tray | Very small labels, sparse oversized tiles, missing destinations | Labelled rail; searchable compact libraries; empty results; Assets/Secrets/Settings; Enter insertion; collapse control | Independent canvas/workspace mode when browsing settings; full drag/drop catalog regression |
| Canvas | Initially cropped artboard, inconsistent gestures | Fit after project restoration; cursor zoom, Space/middle/hand pan; fit/selection/center/reset; viewport lock; selectable guides/snap | Exhaustive touch, snapping and transformed-parent cases |
| Empty state | Onboarding text scaled to illegibility when zoomed out | Constant-size copy and working Elements/Templates actions | Extremely small/narrow artboards need further adaptation |
| Dock | Limited resolution and zoom bar | Screen presets; 1920x1080 new-project default; Select/Hand; snap and lock; device-width shortcuts; zoom | Separate marquee tool cycle, brand device catalog, multiple screens, vector and motion tools |
| Selection | Movement/clipboard inconsistencies and fragmented undo | Group movement, nested group clipboard, ancestor deduplication, alignment/distribution, one-step undo, final pointer sample and cancellation | Rotated/scaled nested-group clipboard geometry; cross-page history; full grouping/component semantics |
| Inspector | Uneven controls and inaccessible field labels | Named numeric fields; collapsible sections; consistent spacing; multi-selection alignment; text edit/cancel | Every complex color/font/animation control and exported property needs acceptance coverage |
| Context menu | Emoji icons, missing keyboard model | Lucide icons; viewport clamping; real disabled states; focus/arrow/Home/End/Escape handling; lock-aware destructive actions | Keyboard-only opening via ContextMenu/Shift+F10; multi-selection right-click menu |
| Pages / Layers | Page navigation/renaming required pointer discovery | Named open/rename/delete controls, keyboard creation/rename, labelled routes | Layers tree keyboard navigation, grouping and all global-element cases |
| Backend canvas | Static service layout | Draggable service headers; saved finite positions; pan/zoom/fit; keyboard-configurable blocks; refreshed wires | Rich executable workflow wiring, minimap, group organization and full keyboard navigation |
| Routing canvas | Separate pan behavior interfering with text fields | Shared navigation; selectable connections; reduced-motion wire behavior; fit controls | Keyboard wire creation, accessible ports, minimap and complete wiring acceptance |
| Code workspace | Bare file list and textarea | Search, open-file tabs, line gutter, generated/edited/read-only indicators, save status and ZIP | Syntax/language tooling, actionable diagnostics, semantic analysis and sandbox execution |
| AI | Large blocking form | Movable non-modal assistant; canvas remains editable; collapsible provider/usage settings; stream/cancel/review/apply/discard | Conversation history/context selection, suggestion chips, durable budget reporting and live provider acceptance |
| Connections | Visually disconnected workflow | Shared controls/status/errors; explicit permission-required state | Authenticated live repository/branch/commit/conflict screenshots and provider OAuth completion |
| Deploy | Frontend-only provider support could be mistaken for full-stack deployment | Clear frontend provider scope, separate backend origins/container explanation, ZIP action and existing deployment state | Backend/database orchestration, domains/TLS, environment lifecycle, hosted logs/rollback |
| Preview | Simulation labelled Live | Generated frontend, Design simulation and Local full-stack modes; real generated MongoDB saves/login/inboxes, captured email, page readiness, navigation and stop/rebuild controls | Custom-source/container/SQL previews, hosted execution and deployment parity |
| Responsive editor | Header density and clipped footer | Verified 1600, 1366 and 1024 widths; panel toggles; visible bottom controls; modal sizing | Full resized inspector coverage, drag-resizable panels, narrow/mobile editor acceptance |
| Accessibility and motion | Uneven focus/labels; decorative animation | Shared focus rings; native disabled states; input/dialog/menu shortcut guards; reduced-motion styles | Comprehensive screen-reader and contrast audit; no claim of WCAG conformance |

## Keyboard model

Shortcuts are listed in the `?` help dialog and maintained in `src/lib/editor-shortcuts.ts`.

| Intent | Keys |
| --- | --- |
| Select / Hand / temporary pan | V / H / hold Space and drag; middle-button drag also pans |
| Zoom / fit / selection / reset / center selection | + or - / Shift+1 / Shift+2 / Shift+0 / Shift+3 |
| Nudge selection | Arrows; Shift for 10px; Alt for 0.1px |
| Duplicate / copy / cut / paste / select all | Ctrl or Cmd + D / C / X / V / A |
| Undo / redo | Ctrl or Cmd + Z / Shift+Z; Ctrl+Y also redoes |
| Lock / unlock selection | Ctrl or Cmd + Shift+L |
| Layer ordering | [ / ]; Shift sends to back or brings to front |
| Align left / center / right | Alt+A / H / D |
| Align top / middle / bottom | Alt+W / V / S |
| Distribute horizontally / vertically | Alt+Shift+H / V; requires three unlocked siblings |
| Select parent / first child | Ctrl or Cmd + Alt+Up / Down |
| Edit selected text / cancel | Enter / Escape |
| Elements / Pages / Assets / Backend / Routing / Settings | Shift+E / P / A / B / R / S |
| Code / AI / Deploy / Preview | Shift+C / G / D / Enter |
| Inspector / Sub-Tray / help | Shift+I / T / ? |
| Save project | Ctrl or Cmd + S |

Editing shortcuts do not operate on canvas elements while typing or using a modal, preview or context menu. Native button activation is preserved. Backend/routing selection has its own Delete/Escape handling; UI undo is not presented as graph undo. Alt-based bindings can conflict with platform/browser commands and need macOS/Safari acceptance.

## Browser findings and evidence

Real Chromium workflows caught and fixed clipped footer controls, onboarding text shrinking with zoom, duplicate accessible field names, multi-selection click/clipboard behavior, a toolbar screenshot taken before its position update, and project framing occurring before asynchronous restore. The toolbar test now waits for the actual non-overlap invariant. A separate AI persistence failure revealed `applyDesign` overwriting reviewed project names with the old name; this was fixed without changing stale-proposal checks or weakening tests.

The latest automated screenshots are in `.verification/` (local artifacts, intentionally ignored by Git):

- `ui-before-editor.png`, `ui-before-backend.png`, `ui-before-code.png`
- `ui-after-empty-desktop.png`, `ui-after-empty-1366.png`, `ui-after-empty-1024.png`
- `ui-after-populated.png`, `ui-after-selected-inspector.png`, `ui-after-multi-selection.png`
- `ui-after-backend.png`, `ui-after-routing.png`, `ui-after-code.png`
- `ui-after-ai.png`, `ui-after-ai-canvas.png`, `ui-after-context-menu.png`
- `ui-after-pages.png`, `ui-after-screen-presets.png`, `ui-after-shortcuts.png`
- `ui-after-connections-permission.png`, `ui-after-deploy.png`, `ui-after-preview.png`

The small Next.js development indicator appears in these development-server captures; it is not shipped in the production editor. Screenshots of AI/Connections states do not establish live provider integration. No credentials are embedded in fixtures or screenshots.

## Earlier-stage checks (before the advanced frontend continuation)

| Check | Evidence / result |
| --- | --- |
| TypeScript, lint, units | `npm run check`: 42 tests pass; zero lint errors; 50 warnings remain |
| Editor E2E | 10 Chromium workflows pass; existing six retained and four interaction/layout workflows added. After the final marquee-coordinate/contrast changes, all four UI workflows passed again |
| Generated-app E2E | Exported Next.js account UI with real Express/MongoDB passes verification, refresh, password recovery and revocation |
| Integration | Eight suites passed together; identity startup exceeded the existing readiness wait during concurrent builds, then passed unchanged in isolation. All nine tests have passing evidence, but the combined run was not wholly green |
| Root production build | Pass |
| Exported production build | Two-page Next.js frontend, account route and gateway compile successfully |
| Backend builds | Generated auth service validates 13 modules; CRUD service validates 8 modules |
| Dependency audit | Root audit reports zero vulnerabilities; generated-account dependency installs also report zero |
| Docker build/runtime | Not run: Docker executable/runtime is absent. Provide a Docker-enabled host, then build/run root and generated Compose images and exercise readiness and shutdown |
| Live providers | Not run without authorized provider credentials; local protocol tests are not live service evidence |

Logs: `.verification/ui-check.log`, `ui-e2e.log`, `ui-generated-e2e.log`, `ui-integration.log`, `ui-identity-recheck.log`, `ui-build.log`, `ui-export-build.log`, `ui-audit.log`, `ui-interactions-final.log`.

## Remaining work and next sequence

The advanced frontend implementation below supersedes the earlier absence of vector, motion, library and breakpoint controls. Remaining internal frontend acceptance includes nested component/structural override semantics, arbitrary breakpoints, transformed grouping and handle editing, cross-page/cross-canvas history, comprehensive property/export parity, full project semantic analysis and source reconciliation, live-data widgets, account/team settings, and an isolated full-stack runtime. These are not credential-only blockers.

Hosted assets/background processing, identity and provider lifecycle, deployment environments, database operations, logs, health gates and rollback remain governed by the production ledger. External credentials block only the corresponding live provider acceptance.

## Advanced frontend stage — 21 September 2026

Implementation now includes a project Library with shared CSS tokens and linked component definitions, per-instance property overrides, publishing, detaching and undo. Tablet (≤1024px) and mobile (≤600px) overrides inherit from desktop and generate media queries. The editor has separate canvas mode and sidebar state. Pen authoring supports corners, Bézier handles, closure, point editing and reusable shapes. The motion workspace supports multiple tracks, timing/easing, editable keyframes and a shared scrub/play timeline; generation emits the same transforms and reduced-motion CSS.

Layer trees now support keyboard selection, traversal, expansion, F2 rename and Alt+Arrow ordering. Routing ports support keyboard connections and graph overview navigation. Panel widths can be dragged or adjusted with keyboard separators. Files and Deploy menus expose actual project/backup/ZIP/connection workflows. Source editing adds worker-based JS/TS/JSX syntax and JSON validation, diagnostic navigation, find/replace and line navigation; this is syntax analysis, not project type checking. AI offers change focus, suggestion prompts and bounded per-project conversation storage, with opt-out and deletion; full redacted project context is explicitly disclosed.

Tabs have executable keyboard navigation and distinct child panels. Repeaters emit the configured number of template copies, galleries use their columns/gap, and icons share the editor's actual paths. Generated HTML preview runs in an opaque-origin iframe with a restrictive CSP; external requests, parent access, forms and embedded frames are blocked. It is a frontend artifact preview, not an Express/Next server runtime or execution of source overrides. The legacy code-preview iframe no longer combines script permission with same-origin access.

The asset library retains raster uploads independently from canvas instances, supports reuse, built-in icons and WOFF/WOFF2 fonts. Assets remain bounded by the 5 MB project limit, survive backup/restore and emit embedded application assets. This is local/project persistence; external object storage, CDN processing and asset access policies remain infrastructure work.

Evidence so far: 48 unit tests passed before the asset/group additions; the editor production build and generated widget application's production build passed. The 13-workflow browser regression passed, followed by all five advanced-design workflows including executable widgets and asset upload/delete/reuse/reload/generated preview. Final counts and generated-production runtime checks will be recorded below after completion. No live provider success is inferred from the local fixtures.

New local screenshots: `design-motion.png`, `design-responsive-preview.png`, `design-source-diagnostics.png`, `design-generated-widgets.png`. Browser testing caught and fixed pen completion clearing selection. Visual review caught missing fallback fonts on canvas text and an unnecessarily tall dock; those fixes are included. Fixed breakpoint presets, nested component semantics, cross-page/cross-canvas history, durable hosted assets, project semantic analysis and isolated full-stack preview remain explicitly bounded acceptance areas, rather than credential-only blockers.


## Workflow, grouping and exported-runtime continuation — 21 September 2026

The Backend canvas now opens a service workflow with selectable operation cards, keyboard-accessible input/output ports, ordered connections, branch/loop/try-catch/function/transaction outputs, persisted dragging and keyboard nudging, overview navigation, connection removal and cycle errors. These edits change execution steps in validated IR. Tests compile a connected conditional workflow and execute the emitted runtime for both outcomes. Deleting an operation removes its execution references; deliberate origin placement survives serialization. This does not add unimplemented backend block types or provider execution.

UI grouping retains stable child IDs and desktop/tablet/mobile coordinates, supports undo and ungrouping, and compiles the resulting hierarchy. Grouping is limited to same-scope positioned siblings; ungrouping is disabled for wrappers whose styling/animation/compositing would be lost. Advanced transformed/flow grouping remains internal work. Global layer keyboard/drag/context ordering now uses the correct root list, with undo coverage. Pointer mode cycles Select → Hand → Marquee; direct shortcuts remain available.

Primitive shapes now share paths between canvas, design preview and export, including responsive fill. Nested positioned children now read their saved layout position in both editor preview paths. The generated production Next.js frontend was built and served locally: a real browser verified keyboard tab panels, repeat counts, token colors, gallery layout, triangle SVG, final motion transform, mobile coordinates and reduced-motion behavior. No application code was evaluated inside the editor for that test.

Current evidence is recorded in `completion-matrix.md`. Repeatable exported frontend check: prepare with `npx tsx scripts/prepare-design-verification.ts`, build `.verification/design-app/frontend`, then run `npx tsx --test tests/generated/design-runtime.test.ts` with `PLAYWRIGHT_BROWSERS_PATH` pointing to the installed browser directory. This run reused installed dependencies; a fresh offline installation could not resolve registry metadata. Live provider, Docker and fresh-install acceptance are not implied.


Final continuation verification: TypeScript and lint pass (0 errors, 53 warnings), 55 unit tests pass, all 17 editor browser workflows pass, and the final motion/grouping browser recheck passes. All nine integration checks pass in the isolated run; the first run overlapped browser work and timed out during workflow-service startup, then passed unchanged. The generated account browser workflow, editor production build, exported design production build/runtime and generated auth/workflow module checks pass. Fresh registry audit could not reach its advisory endpoint; Docker and live-provider acceptance remain unavailable. Logs are linked by filename in the completion matrix.

The confirmation review showed the floating toolbar covering a moving selection because browser animation does not emit style mutations. The toolbar now stays hidden while the motion workspace is open, with a browser assertion. Vector drags cancel their history transaction when the selected shape unmounts or loses editability. No further visual review loop was performed.


## Shared recovery and query reports — 22 September 2026

Undo/redo is now available in the Header and from the keyboard on all canvases. It restores the project document across page navigation, service/page/element deletion and linked routing cleanup. Graph drags are a single history entry, with cancellation and unmount cleanup. History resets when opening/replacing a project; persisted checkpoints still provide restart recovery. Routing ports support click-to-connect in addition to keyboard and dragging.

The Query Inspector adds aggregation grouping and named count/sum/avg/min/max metric controls. Calculations select model fields, numeric operations offer numeric fields, duplicate/reserved metric names are rejected, and at least one metric is retained. Configuration propagates through saved IR and generated execution; the compiler reports incomplete/invalid field bindings. Arbitrary aggregation pipelines are not exposed.


## Backend quota inspector — 27 September 2026

The rate-limit inspector now configures scope, client identity (IP or verified user/tenant), durable or memory counter storage, request/window bounds and the public response. Brief hints and a native expandable explanation keep the primary controls visible. Configuration-only blocks no longer show unrelated execution-binding guidance. Existing design tokens, native controls and keyboard behavior are reused; no animation/video package was added.

The browser workflow exercises configuration, endpoint attachment, undo/redo, save/reload, deletion/undo and emitted-source preservation. Updated screenshot: `.verification/rate-limit-inspector.png`. Runtime enforcement, proxy boundaries and production acceptance are documented in [backend-rate-limits.md](backend-rate-limits.md).


## Generated preview and export parity — 28 September 2026

Play now defaults to generated frontend rather than design simulation. Local page links work through a restricted iframe message channel; routing/API configuration participates in preview regeneration. Backend requests show an explicit unavailable message without claiming a save, and compiler/source override errors are visible. Menu/social routing is keyboard-operable in generated pages. Scroll/click/typewriter animation setup is shared with the React export and removes listeners/timers on cleanup.

Normal-flow child dimensions now survive generation. The new browser fixture checks canvas/preview input dimensions and separation of form controls, then downloads the real application ZIP for independent build/runtime verification. Screenshot: `.verification/canvas-preview.png`. Backend/source runtime preview, external assets and broader visual/property acceptance remain open in the completion matrix.


## Functional inspector and control parity — 1 October 2026

The inspector retains the incumbent graphite/violet identity and compact control sizes. Numeric values now support horizontal parameter dragging without a slider thumb, exact entry, legal units, keyboard adjustment, modifier sensitivity, cancellation and gesture history. Linked spacing/corner controls persist the actual side values. Colors and typed content controls immediately update semantic state.

Tabs have shared canvas/export CSS with transparent internal surfaces; red fill and configured typography/borders/spacing remain visible. Radio controls have native inputs with visible editable labels. Embed configuration displays actual isolated content and explicit script/form permissions. Native controls, legacy Button and Input share the renderer/generator tree; external geometry belongs to the editor selection wrapper and visual styling belongs to the control. The light application canvas no longer inherits the dark editor's default text color.

Batched desktop and laptop screenshot review confirmed the parameter controls, red Tabs surface and inspector layout. The Impeccable mechanical detector returned no findings for the changed inspector/control/CSS targets. These checks establish the scoped improvements; full catalog accessibility, external-provider, nested-layout and cross-browser acceptance remains open in the completion matrix. No video library was added merely because Remotion/HyperFrames were available.
# Model editing and cloud persistence — 2 October 2026

Database chooser: Service Settings now includes Database & storage with engine, destination, environment-variable name, TLS and SQLite filename controls. The UI states that credentials are configured at runtime and engine changes do not move existing data. Browser acceptance covers all five options, undo/redo, reload, a real ZIP download and remote TLS defaults. A batched 1600×1000 / 1024×768 inspection confirmed readable native controls; a second capture collapses General to show the storage section. `.verification/database-ui-detect.json` contains no findings for the changed inspector. No new theme, motion library or dependency was added to the editor UI.

Model inspector addition: typed default controls show invalid values inline and retain them for correction; disabling the default is distinct from an empty string. Field name/type controls now occupy a separate row from required/unique/index flags, with accessible labels. Read queries expose deleted-record selection; restore/purge explain their effect. Lifecycle Chromium tests cover editing, errors, undo/redo, reload and application download. Desktop (1600×1000) and compact (1024×768) screenshots were inspected, the cramped schema row was corrected, and the second batch confirmed readable names/types. Evidence: `.verification/model-defaults-desktop.png`, `model-defaults-compact.png`, `model-lifecycle-browser.log`. One detector pass returned 11 existing global CSS findings outside the changed rules, including the Inter family pinned by DESIGN.md; no findings affected the new inspector controls. See `model-lifecycle-ui-detect.json`.

The existing Files & projects surface now explains that cloud revisions belong to each tab/account. Conflict errors preserve the current document and direct the user to back up before reopening. A two-tab Chromium regression verifies the visible conflict, retained project name, independent account baselines and account-change rejection. `.verification/cloud-save-conflict.png` was inspected at 1600×1000; the message, fields and recovery controls are visible in the existing graphite/violet system. No layout or theme change was needed. Impeccable detection for WorkspaceHub returned no findings (`product-cloud-ui-detect.json`). Other viewport/accessibility coverage remains as recorded below.

## Form validation authoring — 9 October 2026

Temporal controls expose native date/time pickers for bounds/defaults and a plain step field accepting positive intervals or `any`; captions explain units and copied backend rules. Backend date/time rules have separately labelled bounds, initial value, step and message. Invalid ranges/steps show an inline alert and recover with undo. The 1600px and 1100px inspector screenshots were inspected; native controls remain within the existing panel. The generated production form has no horizontal overflow or overlapping fields at 320/768/1024/1440px. Chromium acceptance does not certify screen readers, other engines or touch pickers.

Backend Validation now separates rule type, allowed values and validation message into native controls with accessible names. Choice lists use the incumbent multiline textarea and show invalid/duplicate entries inline. Rule values for existing length/range checks are also editable. Snapshot rules and the need to review them after field edits are explained in the form destination panel. Actual keyboard/edit/error/undo/reload/export acceptance passes, with inspected 1600px/1100px screenshots. An initial compact review found the old fixed-height input styling truncating the choice list and a narrow type/message row; the final layout uses the existing multiline style and separate message row.

## Nested form and Layers editing — 9 October 2026

Form rows now expose Move beside Edit and sibling ordering. One inline native selector serves the active move, includes group breadcrumbs and excludes self/descendant targets. It takes focus on opening; Apply/Cancel return focus to the originating button. Locked ancestor controls disable move/reorder. Layers recognizes native fieldsets, exposes rejected moves with an alert and draws insertion markers inside the existing row without changing hit-test geometry. A real edge drop exposed the old marker moving rows during drag; the repaired global-root detach journey passes.

The current graphite/violet panel, compact native controls and existing tokens are retained. Actual keyboard move/cancel, Layers drag, locks, component detach recovery, history/save/reload and preview/export pass. The 1100px inspector and desktop Layers screenshots were inspected; regrouped form controls fit without overlap at 320/768/1024/1440px in the downloaded production app. Screen-reader, touch-picker and broader nested geometry acceptance remain open.
