import type { ElementNode } from "@/types";

export function embedError(props: ElementNode["props"]): string | null {
  if (props.embedType === "html" || props.embedType === "code")
    return String(props.source || "").trim()
      ? null
      : "Enter HTML or code to preview the embed.";
  try {
    const url = new URL(String(props.src || ""));
    if (!["https:", "http:"].includes(url.protocol)) throw new Error();
    return null;
  } catch {
    return "Enter a complete https:// or http:// embed URL.";
  }
}

/** Never grant same-origin, top navigation, popups or access to editor credentials. */
export function embedAttributes(
  props: ElementNode["props"],
): Record<string, string> {
  const sandbox = [
    props.allowScripts ? "allow-scripts" : "",
    props.allowForms ? "allow-forms" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const attrs: Record<string, string> = {
    title: String(props.title || "Embedded content"),
    sandbox,
    referrerPolicy: "no-referrer",
  };
  const error = embedError(props);
  if (error) return { ...attrs, srcDoc: `<p>${error}</p>` };
  if (props.embedType === "html" || props.embedType === "code")
    attrs.srcDoc = String(props.source);
  else attrs.src = String(props.src);
  return attrs;
}
