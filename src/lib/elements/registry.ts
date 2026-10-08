import type { ElementNode } from "@/types";
import {
  templates as legacyTemplates,
  sidebarCategories as legacyCategories,
} from "@/templates/legacy";
import { DEFAULT_LAYOUT } from "@/lib/defaults";
import { ICON_PATHS } from "@/lib/icon-paths";

export type ElementTemplate = Omit<
  ElementNode,
  "id" | "parentId" | "children" | "layout"
> & {
  layout?: Partial<ElementNode["layout"]>;
  children?: ElementTemplate[];
};
export type PropertyField = {
  type: "string" | "number" | "boolean";
  label: string;
  options?: string[];
};
export type NativeStrategy =
  | "tag"
  | "select"
  | "list"
  | "table"
  | "details"
  | "progress"
  | "iframe"
  | "dialog"
  | "carousel";
export interface ElementDefinition {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  version: number;
  migration: "legacy-v1";
  status: "supported" | "experimental";
  propsSchema: Record<string, PropertyField>;
  styleSchema: "css-properties";
  responsiveSchema: "tablet-mobile";
  events: string[];
  children: boolean;
  allowedParents: "containers";
  accessibility: string[];
  serialization: "project-v1";
  generate: "legacy" | NativeStrategy;
  render: "legacy" | "native";
  tag?: string;
  template: ElementTemplate;
}
const definitions: ElementDefinition[] = [];
const fields = (props: ElementNode["props"]): Record<string, PropertyField> =>
  Object.fromEntries(
    Object.entries(props).map(([key, value]) => [
      key,
      {
        type: typeof value as PropertyField["type"],
        label: key
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (s) => s.toUpperCase()),
      },
    ]),
  );
const legacyChildren = new Set([
  "section",
  "container",
  "columns",
  "stack",
  "form",
  "repeater",
  "accordion",
  "tabs",
  "gallery",
]);
for (const [id, template] of Object.entries(legacyTemplates)) {
  const category =
    legacyCategories.find((c) => c.items.some((i) => i.type === id))?.label ||
    "Advanced";
  definitions.push({
    id,
    name: template.label || id,
    category,
    icon: id,
    description: `${template.label || id} with editable properties, geometry and styles.`,
    version: 1,
    migration: "legacy-v1",
    status: "supported",
    propsSchema: fields(template.props),
    styleSchema: "css-properties",
    responsiveSchema: "tablet-mobile",
    events:
      id === "form"
        ? ["onSubmit"]
        : id === "input"
          ? ["onChange", "onFocus", "onBlur"]
          : ["onClick"],
    children: legacyChildren.has(id),
    allowedParents: "containers",
    accessibility: ["Provide meaningful text or an accessible label"],
    serialization: "project-v1",
    generate: "legacy",
    render: "legacy",
    template: { ...template, definitionId: id, definitionVersion: 1 },
  });
}

function native(
  id: string,
  name: string,
  category: string,
  tag: string,
  props: ElementNode["props"] = {},
  styles: ElementNode["styles"] = {},
  children = false,
  generate: NativeStrategy = "tag",
  size = [300, 44],
) {
  const events = [
    "onClick",
    ...(["input", "select", "textarea"].includes(tag)
      ? ["onChange", "onFocus", "onBlur"]
      : []),
    ...(["video", "audio"].includes(tag) ? ["onPlay", "onPause"] : []),
  ];
  definitions.push({
    id,
    name,
    category,
    icon: id,
    description: `${name} — ${generate === "tag" ? `semantic ${tag}` : generate} with editable properties.`,
    version: 1,
    migration: "legacy-v1",
    status: "supported",
    propsSchema: fields(props),
    styleSchema: "css-properties",
    responsiveSchema: "tablet-mobile",
    events,
    children,
    allowedParents: "containers",
    accessibility: ["Provide an accessible label for controls and media"],
    serialization: "project-v1",
    generate,
    render: "native",
    tag,
    template: {
      type: "native",
      definitionId: id,
      definitionVersion: 1,
      label: name,
      props,
      styles: { color: "#1f2937", ...styles },
      layout: { ...DEFAULT_LAYOUT.native, w: size[0], h: size[1] },
    },
  });
}
const box = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  padding: "16px",
};
for (const [id, name, tag, styles] of [
  ["layoutFrame", "Frame", "div", box],
  ["flex", "Flex", "div", { ...box, flexDirection: "row" }],
  [
    "grid",
    "Grid",
    "div",
    {
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: "16px",
    },
  ],
  ["aspectRatio", "Aspect Ratio", "div", { aspectRatio: "16 / 9" }],
] as const)
  native(id, name, "Layout", tag, {}, styles, true, "tag", [480, 270]);
for (const [id, name, tag] of [
  ["label", "Label", "label"],
  ["caption", "Caption", "small"],
  ["code", "Code", "code"],
  ["blockquote", "Blockquote", "blockquote"],
  ["richText", "Rich Text", "div"],
])
  native(
    id,
    name,
    "Typography",
    tag,
    { content: name, ...(tag === "label" ? { htmlFor: "" } : {}) },
    { whiteSpace: "pre-wrap" },
    id === "richText",
  );
native("iconButton", "Icon Button", "Buttons", "button", {
  content: "+",
  title: "Add item",
  disabled: false,
  type: "button",
});
native(
  "buttonGroup",
  "Button Group",
  "Buttons",
  "div",
  { ariaLabel: "Actions" },
  { ...box, flexDirection: "row" },
  true,
);
native(
  "linkButton",
  "Link Button",
  "Buttons",
  "a",
  { content: "Continue", href: "/" },
  {
    padding: "12px 24px",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    textAlign: "center",
  },
);
native(
  "formField",
  "Form Field",
  "Form / Inputs",
  "fieldset",
  { ariaLabel: "Field group", disabled: false },
  box,
  true,
  "tag",
  [360, 140],
);
const inputStyles = {
  padding: "10px 12px",
  border: "1px solid #9ca3af",
  borderRadius: "6px",
  backgroundColor: "#ffffff",
};
for (const [id, name, type] of [
  ["textInput", "Text Input", "text"],
  ["passwordInput", "Password Input", "password"],
  ["emailInput", "Email Input", "email"],
  ["numberInput", "Number Input", "number"],
  ["urlInput", "URL Input", "url"],
  ["searchInput", "Search Input", "search"],
  ["phoneInput", "Phone Input", "tel"],
  ["dateInput", "Date Input", "date"],
  ["timeInput", "Time Input", "time"],
  ["dateTimeInput", "DateTime Input", "datetime-local"],
  ["checkbox", "Checkbox", "checkbox"],
  ["radioButton", "Radio Button", "radio"],
  ["switch", "Switch", "checkbox"],
  ["slider", "Slider", "range"],
  ["range", "Range", "range"],
  ["fileUpload", "File Upload", "file"],
  ["colorPicker", "Color Picker", "color"],
])
  native(
    id,
    name,
    "Form / Inputs",
    "input",
    {
      type,
      name: id,
      ariaLabel: name,
      required: false,
      disabled: false,
      ...(!["checkbox", "radio", "file", "range", "color"].includes(type) ? { label: "", helperText: "", error: "", readOnly: false, pattern: "" } : {}),
      ...(type === "checkbox" || type === "radio"
        ? {
            label: type === "radio" ? "Option" : name,
            checked: false,
            value: "yes",
            ...(id === "switch" ? { role: "switch" } : {}),
          }
        : type === "file"
          ? { accept: "", multiple: false }
          : {
              placeholder: name,
              value: type === "color" ? "#2563eb" : "",
              ...(["range", "number"].includes(type)
                ? { min: 0, max: 100, step: 1 }
                : {}),
            }),
    },
    ["checkbox", "radio"].includes(type) ? { display: "flex", alignItems: "center", gap: "8px", padding: "4px", color: "#1f2937" } : inputStyles,
    false,
    "tag",
    ["checkbox", "radio"].includes(type) ? [200, 36] : [300, 44],
  );
native(
  "textarea",
  "Textarea",
  "Form / Inputs",
  "textarea",
  {
    name: "message",
    ariaLabel: "Message",
    placeholder: "Your message",
    value: "",
    required: false,
    disabled: false,
    rows: 4,
    label: "", helperText: "", error: "", readOnly: false,
  },
  inputStyles,
  false,
  "tag",
  [360, 120],
);
for (const [id, name, multiple] of [
  ["select", "Select", false],
  ["multiSelect", "Multi Select", true],
] as const)
  native(
    id,
    name,
    "Form / Inputs",
    "select",
    {
      name: id,
      ariaLabel: name,
      options: "Option one\nOption two\nOption three",
      multiple,
      required: false,
      disabled: false,
      label: "", helperText: "", error: "", ...(!multiple ? { value: "Option one", placeholder: "Choose an option" } : {}),
    },
    inputStyles,
    false,
    "select",
    [300, multiple ? 100 : 44],
  );
native(
  "radioGroup",
  "Radio Group",
  "Form / Inputs",
  "fieldset",
  { ariaLabel: "Choose an option" },
  box,
  true,
  "tag",
  [320, 120],
);
for (const [id, name, tag] of [
  ["navbar", "Navbar", "nav"],
  ["sidebar", "Sidebar", "aside"],
  ["breadcrumb", "Breadcrumb", "nav"],
  ["pagination", "Pagination", "nav"],
])
  native(
    id,
    name,
    "Navigation",
    tag,
    { ariaLabel: name },
    { ...box, flexDirection: id === "sidebar" ? "column" : "row" },
    true,
    "tag",
    [500, 80],
  );
native("navigationLink", "Navigation Link", "Navigation", "a", {
  content: "Home",
  href: "/",
  title: "Home",
});
native(
  "dropdown",
  "Dropdown",
  "Navigation",
  "details",
  { summary: "Menu", open: false },
  box,
  true,
  "details",
  [240, 100],
);
native("audio", "Audio", "Media", "audio", {
  src: "",
  controls: true,
  loop: false,
  muted: false,
  ariaLabel: "Audio player",
});
native(
  "avatar",
  "Avatar",
  "Media",
  "img",
  { src: "", alt: "Profile photo" },
  { borderRadius: "50%", objectFit: "cover" },
  false,
  "tag",
  [64, 64],
);
native(
  "list",
  "List",
  "Data / Display",
  "ul",
  { items: "First item\nSecond item\nThird item", ariaLabel: "Items" },
  { padding: "16px 32px" },
  false,
  "list",
  [360, 140],
);
native(
  "table",
  "Table",
  "Data / Display",
  "table",
  {
    caption: "Table",
    columns: "Name,Status",
    rows: "Example,Active\nAnother,Pending",
  },
  { borderCollapse: "collapse", border: "1px solid #9ca3af" },
  false,
  "table",
  [480, 180],
);
for (const [id, name, tag] of [
  ["card", "Card", "article"],
  ["badge", "Badge", "span"],
  ["tag", "Tag", "span"],
  ["chip", "Chip", "span"],
  ["statistic", "Statistic", "output"],
  ["timeline", "Timeline", "ol"],
])
  native(
    id,
    name,
    "Data / Display",
    tag,
    { content: name },
    { padding: "12px", border: "1px solid #d1d5db", borderRadius: "6px" },
    id === "card" || id === "timeline",
    "tag",
    id === "card" ? [320, 200] : [200, 44],
  );
native(
  "progress",
  "Progress",
  "Feedback",
  "progress",
  { value: 40, max: 100, ariaLabel: "Progress" },
  {},
  false,
  "progress",
);
native(
  "alert",
  "Alert",
  "Feedback",
  "div",
  { content: "Check the details before continuing.", role: "alert" },
  { padding: "16px", backgroundColor: "#fef3c7", color: "#713f12" },
  true,
  "tag",
  [400, 100],
);
for (const [id, name] of [
  ["tooltip", "Tooltip"],
  ["popover", "Popover"],
])
  native(
    id,
    name,
    "Feedback",
    "details",
    {
      summary: "More information",
      content: "Additional information",
      open: false,
    },
    box,
    true,
    "details",
    [300, 100],
  );
native(
  "skeleton",
  "Skeleton",
  "Feedback",
  "div",
  { ariaLabel: "Loading content", ariaBusy: true },
  { backgroundColor: "#e5e7eb", borderRadius: "6px" },
  false,
  "tag",
  [300, 80],
);
for (const [id, name] of [
  ["embed", "Embed"],
  ["iframe", "IFrame"],
  ["map", "Map"],
])
  native(
    id,
    name,
    "Advanced",
    "iframe",
    { src: "", title: name, embedType: "html", source: "<p style=\"font:16px system-ui;padding:16px\">Your embedded content</p>", allowScripts: false, allowForms: false },
    { border: "1px solid #d1d5db" },
    false,
    "iframe",
    [480, 300],
  );

// Compositions remain ordinary, individually editable semantic elements.
for (const [id, name, heading, copy] of [
  [
    "hero",
    "Hero",
    "Your next idea starts here",
    "Describe what makes your product useful.",
  ],
  [
    "featureSection",
    "Feature Section",
    "Features",
    "Describe a feature and the problem it solves.",
  ],
  [
    "pricingSection",
    "Pricing Section",
    "Choose your plan",
    "Add your price and what is included.",
  ],
  [
    "testimonial",
    "Testimonial",
    "Customer story",
    "Add a customer quotation with their permission.",
  ],
  ["team", "Team", "Meet the team", "Introduce the people behind your work."],
  ["footer", "Footer", "Stay connected", "Add your contact details and links."],
  [
    "contactSection",
    "Contact Section",
    "Contact us",
    "Tell visitors how to get in touch.",
  ],
  [
    "callToAction",
    "Call To Action",
    "Ready to begin?",
    "Explain the next step.",
  ],
]) {
  native(
    id,
    name,
    "Content / Website Sections",
    id === "footer" ? "footer" : "section",
    {},
    box,
    true,
    "tag",
    [640, 300],
  );
  definitions.at(-1)!.template.children = [
    {
      ...legacyTemplates.title,
      props: { content: heading, level: 2 },
      layout: { position: "relative", w: 580, h: 50 },
    },
    {
      ...legacyTemplates.paragraph,
      props: { content: copy },
      layout: { position: "relative", w: 580, h: 80 },
    },
  ];
}
native(
  "faq",
  "FAQ",
  "Content / Website Sections",
  "details",
  {
    summary: "Frequently asked question",
    content: "Write the answer here.",
    open: false,
  },
  box,
  true,
  "details",
  [640, 160],
);

for (const [id, name] of [
  ["modal", "Modal"],
  ["dialog", "Dialog"],
  ["drawer", "Drawer"],
])
  native(
    id,
    name,
    "Feedback",
    "div",
    {
      triggerText: "Open " + name.toLowerCase(),
      ariaLabel: name,
      content: "Dialog content",
    },
    {},
    true,
    "dialog",
    [360, 160],
  );
native(
  "carousel",
  "Carousel",
  "Media",
  "div",
  { items: "First slide\nSecond slide\nThird slide", ariaLabel: "Carousel" },
  box,
  false,
  "carousel",
  [480, 180],
);
native(
  "spinner",
  "Spinner",
  "Feedback",
  "progress",
  { ariaLabel: "Loading" },
  {},
  false,
  "tag",
  [120, 24],
);
native(
  "toast",
  "Toast",
  "Feedback",
  "div",
  { content: "Changes saved", role: "status" },
  { padding: "16px", backgroundColor: "#1f2937", color: "#ffffff" },
);
// Shape variants reuse the tested vector/shape generator instead of parallel code.
for (const [id, name, shapeType] of [
  ["rectangle", "Rectangle", "rectangle"],
  ["circle", "Circle", "circle"],
  ["polygon", "Polygon", "hexagon"],
  ["vector", "Vector", "rectangle"],
  ["customShape", "Custom Shape", "rectangle"],
  ["svg", "SVG", "rectangle"],
]) {
  const base = definitions.find((d) => d.id === "shape")!;
  definitions.push({
    ...base,
    id,
    name,
    category: "Shapes / Graphics",
    description: `${name} — editable shape geometry.`,
    template: {
      ...base.template,
      label: name,
      definitionId: id,
      props: { shapeType },
      ...(["vector", "customShape", "svg"].includes(id)
        ? {
            vector: {
              points: [
                { x: 10, y: 90 },
                { x: 50, y: 10 },
                { x: 90, y: 90 },
              ],
              closed: true,
              fill: "#6366f1",
              stroke: "#4338ca",
              strokeWidth: 2,
            },
          }
        : {}),
    },
  });
}
for (const [id, name, baseId, category] of [
  ["heading", "Heading", "title", "Typography"],
  ["line", "Line", "divider", "Shapes / Graphics"],
]) {
  const base = definitions.find((d) => d.id === baseId)!;
  definitions.push({
    ...base,
    id,
    name,
    category,
    template: { ...base.template, label: name, definitionId: id },
  });
}
// Explicit capabilities, not cosmetic entries claiming unsupported behavior.
export const EXPERIMENTAL_ELEMENTS = [
  {
    name: "Data Grid",
    reason:
      "Use Table for static data; sorting, filtering and live bindings are not compiled yet.",
  },
  {
    name: "Custom HTML",
    reason:
      "Use a custom React component; raw HTML is not executed in the editor.",
  },
  {
    name: "Custom CSS",
    reason:
      "Use element styles; arbitrary stylesheets are not scoped to the editor.",
  },
  {
    name: "Imported Component",
    reason:
      "Paste a React default export into Custom Element and declare exact dependency versions.",
  },
];
for (const id of [
  "video",
  "frame",
  "socialbar",
  "embed",
  "iframe",
  "map",
  "drawer",
  "timeline",
  "richText",
])
  definitions.find((d) => d.id === id)!.status = "experimental";

const buttonFields = definitions.find(d => d.id === "button")!.propsSchema;
for (const definition of definitions) if (definition.propsSchema.href) definition.propsSchema.href.label = "Link URL";
buttonFields.type.options = ["button", "submit", "reset"];
buttonFields.variant.options = ["solid", "outline", "ghost"];
buttonFields.icon.options = ["", ...Object.keys(ICON_PATHS)];
buttonFields.iconPosition.options = ["left", "right"];

export const ELEMENT_REGISTRY: Readonly<Record<string, ElementDefinition>> =
  Object.fromEntries(definitions.map((d) => [d.id, d]));
export const ELEMENT_DEFINITIONS = definitions as readonly ElementDefinition[];
export function definitionFor(
  element: Pick<ElementNode, "type" | "definitionId">,
) {
  const id = element.definitionId || element.type;
  return Object.hasOwn(ELEMENT_REGISTRY, id) ? ELEMENT_REGISTRY[id] : undefined;
}
export function canHaveChildren(
  element: Pick<ElementNode, "type" | "definitionId">,
  customElements: Record<string, { children: boolean }> = {},
) {
  return element.type === "custom"
    ? customElements[element.definitionId || ""]?.children === true
    : definitionFor(element)?.children === true;
}
export function elementTemplate(id: string): ElementTemplate {
  const definition = Object.hasOwn(ELEMENT_REGISTRY, id)
    ? ELEMENT_REGISTRY[id]
    : undefined;
  if (!definition) throw new Error(`Unknown element definition: ${id}`);
  return structuredClone(definition.template);
}
export function searchElements(query: string) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return definitions.filter((d) =>
    terms.every((term) =>
      `${d.id} ${d.name} ${d.category} ${d.description}`
        .toLocaleLowerCase()
        .includes(term),
    ),
  );
}
