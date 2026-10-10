import type { TemplateElement } from "@/types/template";
import type { ElementNode } from "@/types";
import { templates } from "@/templates";
import { elementTemplate } from "@/lib/elements/registry";
import { useEditorStore, buildTemplateElements } from "@/store/editorStore";
import { projectHistory } from "@/store/projectHistory";
import { createSubmissionDestination } from "@/lib/form-destination";
import { createSubmissionInbox } from "@/lib/submission-inbox";
import { generateFrontendProject } from "@/lib/codegen/frontend";

export const SITE_STARTERS = [
  {
    id: "studio",
    name: "Studio — Business",
    category: "Business",
    brand: "North Studio",
    headline: "Thoughtful spaces for everyday life.",
    description:
      "A business site with services, process, enquiries and a private inbox.",
    intro:
      "We help independent businesses turn ambitious ideas into useful places.",
    items: ["Space planning", "Interior design", "Project guidance"],
    details: [
      "A practical plan built around how you work.",
      "Materials, light and furniture chosen with care.",
      "Clear decisions from the first sketch to the final handover.",
    ],
    contact: "Tell us about your project",
    collection: "Studio enquiries",
    button: "Send enquiry",
  },
  {
    id: "portfolio",
    name: "Maker — Portfolio",
    category: "Portfolio",
    brand: "Alex Morgan",
    headline: "Design that brings ideas to life.",
    description:
      "An editable portfolio with projects, an introduction and working contact form.",
    intro:
      "Independent designer creating clear identities and useful digital experiences.",
    items: ["Field Notes", "Good Company", "Common Ground"],
    details: [
      "An editorial identity for a journal of everyday observations.",
      "A digital experience for an independent neighbourhood business.",
      "A community project built around shared stories.",
    ],
    contact: "Let’s make something useful",
    collection: "Portfolio enquiries",
    button: "Send message",
  },
  {
    id: "workshop",
    name: "Workshop — Registration",
    category: "Application",
    brand: "Small Practice",
    headline: "Make room for a new skill.",
    description:
      "A registration application with session choices, stored signups and a private inbox.",
    intro:
      "Join a small, hands-on workshop. Bring your curiosity; we provide the materials.",
    items: ["Observe", "Experiment", "Make"],
    details: [
      "Learn to see familiar things from a different angle.",
      "Try ideas with guidance and a small group.",
      "Leave with something you made and a plan for what comes next.",
    ],
    contact: "Reserve your place",
    collection: "Workshop registrations",
    button: "Register",
  },
] as const;
export type SiteStarter = (typeof SITE_STARTERS)[number];

function text(content: string, heading = false): TemplateElement {
  return {
    ...(heading ? templates.title : templates.text),
    label: content,
    props: heading ? { content, level: 2 } : { content },
    styles: {
      fontSize: heading ? "28px" : "17px",
      lineHeight: "1.5",
      color: "#24352d",
      height: "auto",
      width: "100%",
      margin: "0",
    },
    layout: { position: "static", w: 1000, h: 40 },
  };
}
function box(
  label: string,
  children: TemplateElement[],
  styles: ElementNode["styles"] = {},
): TemplateElement {
  return {
    ...templates.container,
    label,
    props: {},
    styles: {
      display: "flex",
      flexDirection: "column",
      gap: "20px",
      width: "100%",
      height: "auto",
      backgroundColor: "transparent",
      padding: "0",
      ...styles,
    },
    layout: { position: "static", w: 1000, h: 80 },
    children,
  };
}
export function starterElements(starter: SiteStarter): TemplateElement[] {
  const link = (content: string) => ({
    ...elementTemplate("navigationLink")!,
    label: content,
    props: {
      ...elementTemplate("navigationLink")!.props,
      content,
      href: "#",
      title: content,
    },
    styles: {
      color: "#24352d",
      fontSize: "16px",
      height: "auto",
      width: "auto",
      padding: "12px 0",
      textDecoration: "underline",
    },
    layout: { position: "static" as const, w: 120, h: 44 },
  });
  const form: TemplateElement = {
    ...templates.form,
    label: "Starter contact",
    props: {
      ...templates.form.props,
      successMessage: "Thank you. Your submission has been saved.",
      resetOnSuccess: true,
    },
    styles: {
      ...templates.form.styles,
      width: "100%",
      height: "auto",
      padding: "24px",
      backgroundColor: "#fff",
      border: "1px solid #ccd5cd",
    },
    layout: { position: "static", w: 1000, h: 300 },
    children: [
      {
        ...elementTemplate("textInput")!,
        props: {
          ...elementTemplate("textInput")!.props,
          name: "name",
          label: "Your name",
          placeholder: "Alex Taylor",
          required: true,
          maxLength: "120",
        },
      },
      {
        ...elementTemplate("emailInput")!,
        props: {
          ...elementTemplate("emailInput")!.props,
          name: "email",
          label: "Email address",
          placeholder: "you@example.com",
          required: true,
          maxLength: "254",
        },
      },
      ...(starter.id === "workshop"
        ? [
            {
              ...elementTemplate("select")!,
              props: {
                ...elementTemplate("select")!.props,
                name: "session",
                label: "Session",
                options: "Morning\nAfternoon",
                value: "",
                placeholder: "Choose a session",
                required: true,
              },
            },
          ]
        : [
            {
              ...elementTemplate("textarea")!,
              props: {
                ...elementTemplate("textarea")!.props,
                name: "message",
                label: "Message",
                placeholder: "Tell us a little about your project.",
                required: true,
                maxLength: "2000",
              },
            },
          ]),
      {
        ...templates.button,
        label: starter.button,
        props: {
          ...templates.button.props,
          label: starter.button,
          type: "submit",
        },
        styles: {
          ...templates.button.styles,
          width: "100%",
          height: "auto",
          minHeight: "44px",
          backgroundColor: "#24352d",
          color: "#fff",
        },
      },
    ].map((child) => ({
      ...child,
      styles: {
        ...child.styles,
        position: "static",
        width: "100%",
        height: "auto",
      },
      layout: { ...child.layout, position: "static" as const, x: 0, y: 0 },
    })),
  };
  return [
    box(
      "Starter site",
      [
        box(
          "Navigation",
          [
            {
              ...text(starter.brand),
              styles: { ...text(starter.brand).styles, width: "auto" },
            },
            link("Explore"),
            link("Contact"),
          ],
          {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #ccd5cd",
            paddingBottom: "16px",
          },
        ),
        box(
          "Introduction",
          [
            {
              ...text(starter.headline, true),
              props: { content: starter.headline, level: 1 },
              styles: {
                ...text(starter.headline, true).styles,
                fontSize: "clamp(36px, 6vw, 72px)",
                lineHeight: "1.1",
                maxWidth: "900px",
              },
            },
            text(starter.intro),
            link(starter.button),
          ],
          { padding: "48px 0" },
        ),
        box(
          "Explore section",
          starter.items.map((title, i) =>
            box(title, [text(title, true), text(starter.details[i])], {
              padding: "24px 0",
              borderTop: "1px solid #ccd5cd",
            }),
          ),
        ),
        box("Contact section", [text(starter.contact, true), form], {
          padding: "40px 0",
        }),
        box(
          "Footer",
          [text(`${starter.brand} · Built for people.`), link("Back to top")],
          { borderTop: "1px solid #ccd5cd", paddingTop: "24px" },
        ),
      ],
      {
        padding: "clamp(16px, 4vw, 48px)",
        position: "relative",
        backgroundColor: "#f4f3ed",
        color: "#24352d",
        gap: "24px",
      },
    ),
  ];
}

function connectNavigation(nodes: Record<string, ElementNode>) {
  const target = (label: string) =>
    Object.values(nodes).find((n) => n.label === label)!.id;
  for (const node of Object.values(nodes))
    if (node.definitionId === "navigationLink")
      node.events = {
        onClick: {
          action: "scroll",
          target: target(
            node.label === "Explore"
              ? "Explore section"
              : node.label === "Back to top"
                ? "Navigation"
                : "Contact section",
          ),
        },
      };
}
export function starterPreview(starter: SiteStarter) {
  const { byId } = buildTemplateElements(starterElements(starter), null);
  connectNavigation(byId);
  return generateFrontendProject(Object.values(byId), [], {
    width: 1280,
    height: 900,
    backgroundColor: "#f4f3ed",
  }).previewHtml;
}
export function applySiteStarter(starter: SiteStarter) {
  return projectHistory.run("editor", () => {
    const editor = useEditorStore.getState();
    editor.loadTemplate(starterElements(starter));
    const nodes = structuredClone(useEditorStore.getState().elementsById);
    const pageNodes: Record<string, ElementNode> = {};
    const visit = (id: string) => {
      pageNodes[id] = nodes[id];
      nodes[id].children.forEach(visit);
    };
    useEditorStore.getState().rootIds.forEach(visit);
    connectNavigation(pageNodes);
    useEditorStore.setState({ elementsById: nodes });
    const form = Object.values(pageNodes).find(
      (n) => n.label === "Starter contact",
    )!;
    if (!starter.collection.trim())
      throw new Error("Give the starter submission collection a name.");
    const destination = createSubmissionDestination(
      form.id,
      starter.collection,
    );
    createSubmissionInbox(destination.serviceId, destination.endpointId);
    editor.selectElement(form.id);
    return form.id;
  });
}
