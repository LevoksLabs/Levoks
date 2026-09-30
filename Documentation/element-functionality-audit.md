# Element functionality audit — 2026-09-30

Baseline: Chromium census before implementation changes, `tests/e2e/element-audit.spec.ts`. Raw evidence is in `.verification/element-audit/baseline.json`; downloaded state and IR are in `.verification/element-audit/application.zip`. All 104 were inserted through the tray, inspected, changed to #db0101, saved, reloaded, and downloaded. No count increase.

A = fully functional; B = partially functional; C = visual placeholder; D = semantic-only; E = broken. No A designation is justified by this census. B is a conservative classification, not acceptance. **U means unverified, never passed.**

Checks: 1 add; 2 correct rendering; 3 useful default; 4 correct inspector; 5 visible property change; 6 reload state; 7 IR state; 8 emitted source; 9 exported runtime parity; 10 meaningful interaction; 11 keyboard; 12 accessibility. P means the specific baseline check passed. Fields 2–5 require visual/semantic review beyond DOM presence; only the fill path was sampled. Tests 6–8 refer to the sampled fill, not every property.

| Element | Baseline | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | Evidence / missing acceptance |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Section (`section`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Container (`container`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Columns (`columns`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Stack (`stack`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Title (`title`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Text (`text`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Paragraph (`paragraph`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Button (`button`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Image (`image`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Video (`video`) | C | P | U | F | U | U | P | P | P | U | U | U | U | Canvas displays Video Player placeholder instead of media. |
| Gallery (`gallery`) | C | P | U | F | U | U | P | P | P | U | U | U | U | Default gallery shows image placeholders until children are configured. |
| Form (`form`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Input (`input`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Shape (`shape`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Divider (`divider`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Menu (`menu`) | C | P | U | F | U | U | P | P | P | U | U | U | U | Default menu items are spans without destinations. |
| Repeater (`repeater`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Frame (`frame`) | C | P | U | F | U | U | P | P | P | U | U | U | U | Canvas displays Embed Frame placeholder. |
| Icon (`icon`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Spacer (`spacer`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Social Bar (`socialbar`) | C | P | U | F | U | U | P | P | P | U | U | U | U | Default social items are initials without destinations. |
| Accordion (`accordion`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Tabs (`tabs`) | E | P | F | F | U | F | P | P | P | U | U | U | U | Inner white tab surfaces obscure saved fill; separate export CSS. |
| Frame (`layoutFrame`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Flex (`flex`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Grid (`grid`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Aspect Ratio (`aspectRatio`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Label (`label`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Caption (`caption`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Code (`code`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Blockquote (`blockquote`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Rich Text (`richText`) | B | P | U | F | U | U | P | P | P | U | U | U | U | Plain content property; no rich-text editing. |
| Icon Button (`iconButton`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Button Group (`buttonGroup`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Link Button (`linkButton`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Form Field (`formField`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Text Input (`textInput`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Password Input (`passwordInput`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Email Input (`emailInput`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Number Input (`numberInput`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| URL Input (`urlInput`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Search Input (`searchInput`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Phone Input (`phoneInput`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Date Input (`dateInput`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Time Input (`timeInput`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| DateTime Input (`dateTimeInput`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Checkbox (`checkbox`) | B | P | U | F | U | U | P | P | P | U | U | U | U | Native checkbox lacks visible label; full group/form interaction unverified. |
| Radio Button (`radioButton`) | E | P | F | F | F | U | P | P | P | U | U | U | U | Native circle has no visible label or label property. |
| Switch (`switch`) | B | P | U | F | U | U | P | P | P | U | U | U | U | Checkbox role exists; visible label and switch affordance missing. |
| Slider (`slider`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Range (`range`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| File Upload (`fileUpload`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Color Picker (`colorPicker`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Textarea (`textarea`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Select (`select`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Multi Select (`multiSelect`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Radio Group (`radioGroup`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Navbar (`navbar`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Sidebar (`sidebar`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Breadcrumb (`breadcrumb`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Pagination (`pagination`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Navigation Link (`navigationLink`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Dropdown (`dropdown`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Audio (`audio`) | B | P | U | F | U | U | P | P | P | U | U | U | U | Empty source; no playable media until configured. |
| Avatar (`avatar`) | B | P | U | F | U | U | P | P | P | U | U | U | U | Empty source; no image until configured. |
| List (`list`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Table (`table`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Card (`card`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Badge (`badge`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Tag (`tag`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Chip (`chip`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Statistic (`statistic`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Timeline (`timeline`) | D | P | U | F | U | U | P | P | P | U | U | U | U | An ordered-list shell with text; no timeline events. |
| Progress (`progress`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Alert (`alert`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Tooltip (`tooltip`) | B | P | U | F | U | U | P | P | P | U | U | U | U | Click disclosure rather than hover/focus tooltip behavior. |
| Popover (`popover`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Skeleton (`skeleton`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Embed (`embed`) | C | P | U | F | F | U | P | P | P | U | U | U | U | Canvas explicitly defers content to export; no HTML workflow. |
| IFrame (`iframe`) | C | P | U | F | U | U | P | P | P | U | U | U | U | Canvas explicitly defers content to export. |
| Map (`map`) | C | P | U | F | U | U | P | P | P | U | U | U | U | Same iframe placeholder; no actual map configured. |
| Hero (`hero`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Feature Section (`featureSection`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Pricing Section (`pricingSection`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Testimonial (`testimonial`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Team (`team`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Footer (`footer`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Contact Section (`contactSection`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Call To Action (`callToAction`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| FAQ (`faq`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Modal (`modal`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Dialog (`dialog`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Drawer (`drawer`) | B | P | U | F | U | U | P | P | P | U | U | U | U | Uses modal dialog semantics; no drawer positioning. |
| Carousel (`carousel`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Spinner (`spinner`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Toast (`toast`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Rectangle (`rectangle`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Circle (`circle`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Polygon (`polygon`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Vector (`vector`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Custom Shape (`customShape`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| SVG (`svg`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Heading (`heading`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |
| Line (`line`) | B | P | U | U | U | U | P | P | P | U | U | U | U | Insertion and fill state round trip observed; element-specific behavior and complete property/export acceptance remain unverified. |

## Architecture findings

- Tabs stores the fill correctly; hardcoded opaque inner CSS hides it. Canvas and export have separate widget styles.
- Native elements share a semantic tree but the canvas replaces every iframe with a placeholder and uses tiny unlabeled radio defaults.
- The inspector uses local component state only for editing UI; property changes already enter the project store. Persistence/IR is not the root cause of the red Tabs failure.
- Geometry and CSS width/height can disagree. Explicit styles must be reconciled when resize updates geometry.
- Fill token binding can be hidden by an older background shorthand. Shorthand/longhand order must match between renderer and generator.
- Native controls are intentionally inert during design selection; behavior acceptance must include the generated interactive preview and production application.
- Two entries are named Frame (layout frame and legacy iframe).

## Acceptance after this pass

See completion-matrix.md for verified fixes and remaining scope. Baseline classifications above remain historical; passing focused regressions does not upgrade unrelated rows.
