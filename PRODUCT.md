# Levoks

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product purpose

Levoks is a visual website builder with UI, backend, and routing canvases. Home lets users find, create, and organize ongoing projects; the workplace is the project editing environment.

## Capabilities and constraints

The user confirmed that local projects and optional sign-in must remain available. Preserve IndexedDB documents, checkpoints, explicit cloud saves, compiler, provider integrations, and existing editor behavior. Home lives at `/`, project editing at `/workplace/{project_id}`, and authentication at `/auth/signin`. Home provides project groups and profile access without the editor tray or inspector.

## Brand commitments

Preserve the Levoks identity and established design system. The requested dashboard is clean and minimal, with familiar creative-tool project management and consistent icons.

## Evidence

Existing implementation in `src`, product documentation in `Documentation/levoks.md`, and visual system in `DESIGN.md`. Do not invent user projects, deployed services, or cloud synchronization.
