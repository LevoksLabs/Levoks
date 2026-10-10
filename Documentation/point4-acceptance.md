# Point 4: forms, nested editing and responsive polish

10 October 2026. Point 4's supported local authoring workflows are implemented and accepted. The broader product roadmap and whole-product external acceptance remain open. No site was published and no paid AI or external provider operation was performed in this pass.

| Area | Completed behavior |
| --- | --- |
| Broader forms | Existing native text, URL, date/time, choice, consent and selection-count controls now include bounded custom text masks, larger/multiple attachments and stable standalone label associations. Browser constraints and guided server validation agree. |
| Conditional sections | Checkbox/switch, select, radio and checkbox-group sources; All/Any combinations; nested ancestor conditions; hidden-value omission and active requirements on both browser and server. Invalid/cyclic references are repairable. |
| Nested editing | Choice rows can use neutral layout wrappers and descriptive content while retaining one field mapping. Linked components support local structural changes, restore and explicit publication. Copies/publication preserve internal references and labels targeting another instance. |
| Geometry | Drag and resize respect ancestor 2D transforms and canvas zoom; rotated resizing retains the opposite anchor. Group/ungroup preserves saved breakpoint geometry. |
| Responsive polish | Eight section templates no longer overflow on mobile. Labeled fields grow with labels/instructions. Three full site starters keep fields in flow and grow the exported page so desktop contact sections and footers remain reachable. |
| Working sites | Studio business site, Maker portfolio and Workshop registration app, each with working navigation, validated storage, submission/retry/reset behavior and authenticated operator inbox. Preview/use/history/save/reload/export all work through the editor. |
| Local accessibility | Associated field instructions, stable label focus, repairable errors, native modal focus return and keyboard tabs/disclosures/dialogs. All 104 catalog definitions have named controls and pass the configured layout checks at four widths. |

The exact supported contracts and limits are in [full-stack contracts](fullstack-contracts.md#point-4-authoring-contracts).

## Verification

Repository verification passes 197 unit tests, TypeScript and lint with zero errors / 45 existing warnings. The production editor build, sequential post-build TypeScript and private-output packaging check pass.

Nineteen distinct editor/browser journeys pass across attachments, conditions, masks, radio/checkbox/select authoring, nested reusable editing, transformed geometry, label associations, responsive panels and the three starters. After screenshot review identified starter clipping, the three starter journeys were rerun against the final implementation with explicit form-row non-overlap and whole-page containment checks. Actual project save/reload, native keyboard behavior and downloaded ZIP parity are included. The configured catalog pass covers 104 definitions × four widths (320/768/1024/1440px), with no overflow, unnamed controls or JavaScript errors.

Five actual browser-downloaded applications match the current compiler exactly, build successfully and pass production Next/Express/MongoDB execution:

- Attachment form: counts/extensions/byte validation, two 450 KiB files in one submission, a request exceeding the old 1 MiB budget, forged/oversized request rejection, exact persisted/downloaded bytes, private access, pagination, deletion/revocation/sign-out, reset and outage/retry.
- Compound/nested form: choice-driven All/Any conditions, hidden-field omission, active Required checks, literal `$` choice values, mask enforcement, forged requests without additional writes, retained entries, reset and outage/retry.
- Studio, Maker and Workshop: full-page/form containment at four widths, section navigation, native requirements, actual persisted submissions, three invalid server requests per app without additional writes, reset/reload, backend restart/retry and real first-operator enrollment/sign-in/private inbox reads.

Mobile upload instructions and mobile/desktop starter screenshots were visually inspected. These reviews found and led to fixes for helper overflow, inherited absolute field positioning and desktop page clipping; assertions now cover those boundaries.

Reproduce the editor, actual export builds and generated-app runtime acceptance with `npm run test:point4-export`. It installs generated-project dependencies and uses disposable local MongoDB and Chromium. `npm run check` and `npm run build` verify the editor separately. This pass used a frozen verification checkout and independent development port because another workstream was editing the shared deployment configuration. Generated source was compared with the final root compiler; starter frontends used their own installed dependencies after Next rejected the verification harness's dependency junction.

Local evidence is retained in ignored `.verification/` files: `point4-final-check.log`, `point4-final-editor-build.log`, `point4-postbuild-types.log`, `point4-packaging.log`, `point4-final-browser.log`, `point4-final-starters-browser.log`, `point4-final-components-unit.log`, `point4-download-parity.log`, `point4-final-*-build.log`, `point4-final-runtime.log`, `catalog-layout/results.json`, `site-starters/` and `attachments/`.

## Boundaries retained in the roadmap

Attachment storage is managed atomically with the submission and authorized through the inbox. It is bounded to 1 MiB per file/combined multiple-file control, at most five files per control and a 2 MiB whole JSON request. General object storage, signed uploads, content scanning, hosted assets, quotas/retention and SQL/provider execution remain backend/infrastructure work in point 5 and external acceptance in point 6.

Native choice composites support layout wrappers and descriptive content. Other controls and independently conditional groups belong alongside them under Form Field. Existing backend validation is a snapshot and needs explicit review after visual edits; this pass does not silently migrate existing endpoints or records.

The complete historical frontend workstream still contains custom breakpoint authoring, arbitrary 3D/vector-handle transforms, legacy property parity, richer live-data actions and durable history. Its broad UX/SEM rows remain PARTIAL. Physical touch pickers, screen-reader sessions, other browser engines, remote embeds, provider sandboxes and container execution still require whole-product acceptance. The catalog checks certify configured local layouts and names, not every property combination or full WCAG conformance.
