# Deterministic semantic foundation

## Audit before implementation (2026-09-30)

| Responsibility | Existing implementation | Gap against the implementation brief |
| --- | --- | --- |
| Editor state | `src/types/index.ts`, `src/store/editorStore.ts`: flat element tree, explicit geometry, props/styles, responsive overrides, animations, motion, assets and reusable visual components | No shared definition contract; allowed children and field schemas are scattered |
| Persistence | `src/lib/project/schema.ts`, `workspace.ts`: version 1 Zod project documents, tree/reference validation, restore, local/cloud persistence and history | No element definition versions or custom source component definitions |
| Canvas/inspector | `Renderer.tsx`, `PropertyInspector.tsx`, `DesignInspector.tsx`, drag/drop and store actions | Render and property switches duplicate element knowledge; model already owns semantics, DOM supplies geometry and interaction |
| Element library | `templates/index.ts`, `lib/defaults.ts`, `Sidebar.tsx` | 24 primitive types, separate defaults/icons/categories, label-only search |
| IR | ProjectDocument plus `FlowGraph` from `graphResolver.ts` | FlowGraph describes interaction chains, not the complete application; exported IR embeds the project but has no explicit generator/definition contract |
| Frontend generation | `codegen/frontend.ts`, animation codegen, widget runtime | Deterministic React/HTML/CSS already exists; semantic coverage varies across props and renderer; responsive width can override percentage styles |
| Backend | Typed blocks/defaults in `types/backend.ts`; Zod configurations; program diagnostics/runtime; Express/Mongoose generation | Existing executable subset must be retained; definition metadata, configuration validation and execution strategies are not exposed as one registry |
| Routing | Separate graph, validated ports, deterministic traversal to API calls/navigation | Click/submit only; richer element event definitions absent |
| Delivery | `project/compiler.ts`, `codegen/exporter.ts`, isolated generated preview | Source overrides are fingerprint protected; ZIP timestamps are not fixed; custom source must never execute in the editor |
| Verification | Unit, real MongoDB/HTTP integration, Playwright editor, generated frontend build/runtime suites | Registry-wide coverage, migration, custom components and semantic parity need explicit regression tests |

## Implementation rules

Extend the existing model. `layout` remains the geometry authority, `responsive` owns tablet/mobile overrides, `animation` owns element effects and `motion` owns keyframes. Keep the existing routing and backend program compilers. Do not add Remotion/HyperFrames runtimes to ordinary application animations: the existing CSS/keyframe representation already exports independently and these plugins target video compositions.

Retain version 1 project compatibility through additive optional fields. Definition versions are independent of the project envelope version. Missing definition identifiers resolve to legacy element types. Unknown/newer definitions must fail validation, never silently render as rectangles.

Custom source is stored as an untrusted project artifact. The editor displays a labelled boundary with declared editable properties. Only exported applications import that source; built-in generated preview must not evaluate it. Manual source overrides retain their current explicit regeneration boundary.

## Completion evidence

Implementation and validation results are recorded here and in `completion-matrix.md` as each increment is verified. The audit is not a claim that the full product specification has shipped.

## Implemented registry contract

`src/lib/elements/registry.ts` is the public element catalog. Its 104 definitions contain stable IDs, names/categories/icons/descriptions, property field schemas, style/responsive contracts, supported events, child rules, defaults/dimensions, accessibility guidance, serialization/version metadata and generation/rendering strategies. Search covers IDs, names, categories and descriptions. Native form controls use HTML semantics; higher-level website sections instantiate editable child nodes. Existing primitives remain adapters over the existing tested renderer/compiler through `templates/legacy.ts`; this is an incremental transition, not a second competing state model.

Instances retain `type` as the rendering primitive and add `definitionId` as semantic identity (`native` + `emailInput`, for example), `definitionVersion`, typed `events` and `accessibility`. `layout`, `styles`, `responsive`, `animation`, `motion`, `vector`, `component`, `props`, `parentId` and `children` keep their existing meaning. Native leaf elements reject children; import validation rejects missing or future definitions, undeclared native/custom properties, mismatched custom property types, invalid event names and missing targets. Drag/drop carries the actual selected definition template rather than reducing every native control to the same primitive.

`nativeTree()` constructs an allowlisted semantic tree from state. React canvas rendering and HTML/JSX emission consume that same tree. It does not parse canvas DOM, accept event-handler source strings, or insert arbitrary HTML. Layout styles belong to the native element while editor selection geometry remains on the wrapper. Native dialogs/carousels use small emitted runtime handlers; selects, dates, file controls and checkboxes use browser controls. File selection is supported; uploading to storage still requires a real backend storage capability.

## State, events, geometry and animation

The existing inspector/store/history path remains authoritative. Registry-derived controls edit native/custom properties in the Content tab. Native controls are inert on the editing canvas so clicks cannot create unsaved form values; generated preview and exported applications remain interactive. Accessibility and event controls are shared. Navigate actions reference page IDs; scroll actions reference element IDs. Deleting their targets removes bindings in the same undo transaction. Export resolves navigation against current page routes; isolated preview uses its existing navigation message protocol. Native buttons/links expose Routing output ports. An explicit event and a routing wire cannot silently compete for the same trigger: compilation reports a conflict.

Geometry remains `layout` (x/y/w/h/position/opacity/rotation/visibility/lock), with additional CSS styles and tablet/mobile overrides. Percentage responsive widths now survive generation and canvas rendering, and root positioning remains absolute across breakpoints. Existing effect triggers and multi-track keyframes remain first-class persisted data and keep using the existing animation compiler. No video runtime was introduced. Arbitrary breakpoints, responsive prop overrides, general view-data bindings and full transformed-layout parity remain follow-up work.

## Custom source boundary

The Custom Element editor accepts a named React default export and a JSON manifest with description, typed string/number/boolean properties and defaults, declared events, a children slot and exact dependency versions. Definitions live in `editor.customElements`; instances carry their definition ID and properties. Definitions and instances participate in save/restore, history and design fingerprints. A duplicate name is rejected to avoid changing existing instances implicitly.

The canvas displays a labelled component boundary with its declared values. It never evaluates source. Projects containing custom instances do not run in the built-in generated preview; they must be built in the exported application environment. Exports include source modules under `frontend/components/custom/`, deterministic imports and dependency declarations. Reserved property names, managed framework dependency overrides and conflicting package versions are rejected. Manifest validation is not a security audit or a guarantee that arbitrary submitted source compiles. Multi-file component imports, local dependency assets, source syntax diagnostics in the creation form and an isolated custom-component build service remain unimplemented. Source overrides remain fingerprint protected and are never silently replaced by regeneration.

## Backend and routing contracts

`src/lib/backend/registry.ts` exposes the backend block catalog with default configuration, actual Zod validators, version/migration metadata, execution/configuration strategies and typed execution/request/response port metadata. Creation and compilation use this registry. It preserves the Express/Mongoose program compiler, its branch/query/transaction/policy diagnostics and separate routing graph. Relationships and unsupported authentication/middleware variants remain explicitly experimental and export diagnostics still block unsupported configurations.

All documented backend category names are reserved in the registry. This does **not** implement queues, workers, schedules, WebSockets, payments, webhooks, storage or caching; there are no fake executable entries for those categories. Port metadata describes the current executable subset, not a new arbitrary typed-data graph. Provider adapters and richer data bindings need subsequent implementation and runtime tests.

## Application IR, reproducibility and compatibility

`project/ir.ts` exports the validated project, resolved FlowGraph, target, generator version (`semantic-1`), used semantic definitions and backend strategies. The project already contains normalized frontend trees, pages, asset references, responsive rules, motion, backend configurations and routing wires. Future AI refinement can consume it without inferring primitive semantics from pixels or DOM.

The project envelope remains version 1. Old documents without definition fields resolve through their original primitive type/version 1. This is a lazy compatibility migration: it intentionally does not rewrite their payload or invalidate a source override's existing fingerprint. Native/custom instances explicitly save version 1; unknown newer versions fail closed. A later incompatible version needs an explicit migration, not a permissive fallback.

Compilation of an identical project produces identical file content. ZIP entries use sorted paths and fixed timestamps. Export retains complete frontend/backend files, visual project JSON and enriched IR. Dependency installation is not bit-for-bit reproducible across dates while existing generated dependency ranges lack lockfiles; generate and retain lockfiles in delivered projects. Custom source runs only in that application's runtime, independently of Levoks.

## Verification and remaining acceptance

- `npm run check`: TypeScript, ESLint (existing warnings) and 73 unit tests passed during this increment. The new suite checks every definition through creation/save/restore/React parsing, deterministic output, old project compatibility, future-version rejection, semantic property/geometry/responsive/motion/event output, unsafe values, custom source isolation and backend registry validators.
- `tests/e2e/semantic-elements.spec.ts`: real Chromium search → drag checkbox → inspector edit → custom definition → instance edit → save/reload → ZIP inspection; generated-preview select/dialog/carousel/navigation behavior.
- Existing `tests/e2e/canvas-export.spec.ts` passed alongside those two tests, preserving the routing/backend-preview/source/export boundary.
- `scripts/prepare-semantic-verification.ts` exports all 104 definitions, a custom React module, two pages and the existing executable backend program fixture. Its Next.js production build passed; the generated backend build validated 12 JavaScript modules and project JSON. This is build evidence, not a new real-database/provider acceptance run.
- Desktop (1600×1000) and compact desktop (1024×768) screenshots were inspected; clipped experimental labels and native wrapper styling were corrected. Impeccable's mechanical detector returned no findings on the changed UI targets.

95 definitions are supported within their declared primitive behavior; 9 are visibly experimental (legacy video/frame/social links, embedded frame/map variants, drawer specialization, timeline and rich-text editing). Data Grid, raw HTML/CSS and arbitrary imported-component workflows have explanatory capability entries rather than pretend implementations. `Table` supplies static tabular data; `Custom Element` supplies the controlled single-module React extension path. Full application-builder breadth, universal prop parity, provider-backed backend blocks, typed response bindings and custom preview infrastructure remain open acceptance work.

## Backend compiler extension

The backend now has an explicit layout-independent IR and a dedicated validation boundary before generation. Auth templates expose editable account lookup, password verification, session issuance, and response steps; existing login endpoints can opt into this workflow through their inspector. See [backend-compiler.md](backend-compiler.md) for the compiler contract, supported controls, compatibility, and verification. The frontend semantic architecture is unchanged.
