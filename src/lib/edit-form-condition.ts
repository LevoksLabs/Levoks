import type { ElementNode } from "@/types";
import { useEditorStore } from "@/store/editorStore";
import { projectHistory } from "@/store/projectHistory";
import { conditionalGroups, validateFormConditions } from "./form-conditions";

export function editFormCondition(
  id: string,
  condition?: ElementNode["formCondition"],
) {
  const store = useEditorStore.getState(),
    node = store.elementsById[id];
  if (!node || !conditionalGroups.includes(node.definitionId || ""))
    throw new Error("Choose a native form group.");
  const ancestors = store
    .getBreadcrumbPath(id)
    .map((item) => store.elementsById[item.id]);
  if (ancestors.some((item) => item.layout.locked))
    throw new Error("Unlock this section before changing its condition.");
  validateFormConditions(
    {
      ...store.elementsById,
      [id]: { ...node, formCondition: condition },
    },
    id,
  );
  projectHistory.run("editor", () =>
    store.updateElement(id, {
      formCondition: condition,
      ...(!node.styles.height
        ? {
            styles: {
              height: "auto",
              minHeight: node.styles.minHeight || `${node.layout.h}px`,
            },
          }
        : {}),
    }),
  );
}
