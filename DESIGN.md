# Levoks editor design system

The editor is an Operate surface: a desktop creative and development tool, with three canvases and a quiet working chrome. The product brief and Documentation/levoks.md are the authority. Preserve working project, compiler, persistence and provider boundaries.

Use the existing violet Levoks mark as the identity anchor. Graphite surfaces separate the canvas, panels and controls; violet identifies selection and the primary action. Semantic green, amber and red identify outcomes, never decoration. The white artboard is application content, not editor chrome. Do not invent deployment URLs or imply a service is running.

The shared tokens in src/app/globals.css define surfaces, text, borders, focus, spacing, radius, control sizes and panel widths. Editor refinements live in src/app/editor.css. Workspace panels use the same tokens. Use Inter or its system sans fallback for controls and the existing monospace stack for code, measurements and shortcuts only.

Header: identity and current file, quiet save status, then Connections / AI / Code / Deploy / Preview / account. Tray: labelled tools with one active state; contextual sub-tray; environment and settings below. Inspector: consistent section disclosure and compact labelled fields. Dock: viewport tools with explicit selection and lock state. Footer: current page and discoverable keyboard help.

Use existing Lucide icons at 16px and 1.75–2px stroke. Controls are 30–34px; compact toolbar buttons remain at least 28px. Dense panels use 12px text with 11px secondary labels; prose is 13px. Spacing uses 4/8/12/16/24px. Focus must remain visible. Panel changes may use a 140ms ease-out opacity/4px movement; disable motion with prefers-reduced-motion. Never animate live dragging or viewport transforms.

Desktop targets: 1600×1000, 1366×768 and 1024×768. Narrow editors retain canvas access through panel collapse; they do not become a mobile dashboard. The user can hide and restore the inspector and sub-tray. Shortcut handlers must ignore form fields, contenteditable, dialogs and preview; mutations target only the active canvas.

Verification requires real Chromium interactions and a batched screenshot review of empty, populated, selected/multiple selection, backend, routing, code, AI, preview, deployment and error states. Record findings and remaining gaps in Documentation/ui-quality.md. Screenshots in .verification are local evidence, not test snapshots to silently update.
