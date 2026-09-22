import type { ElementNode } from "@/types";
import { useEditorStore } from "@/store/editorStore";
export type Alignment =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom"
  | "horizontal"
  | "vertical";
export function alignSelection(alignment: Alignment) {
  const state = useEditorStore.getState();
  const elements = state.selectedElementIds
    .map((id) => state.getElement(id))
    .filter((element): element is ElementNode => Boolean(element));
  if (
    elements.length < 2 ||
    elements.some(
      (el) => el.layout.locked || el.parentId !== elements[0].parentId,
    )
  )
    return;
  const left = Math.min(...elements.map((el) => el.layout.x)),
    right = Math.max(...elements.map((el) => el.layout.x + el.layout.w));
  const top = Math.min(...elements.map((el) => el.layout.y)),
    bottom = Math.max(...elements.map((el) => el.layout.y + el.layout.h));
  state.beginInteraction();
  try {
    if (alignment === "horizontal" || alignment === "vertical") {
      if (elements.length < 3) return;
      const horizontal = alignment === "horizontal",
        axis = horizontal ? "x" : "y",
        size = horizontal ? "w" : "h";
      const ordered = [...elements].sort(
        (a, b) => a.layout[axis] - b.layout[axis],
      );
      const span = horizontal ? right - left : bottom - top;
      const gap =
        (span - ordered.reduce((sum, el) => sum + el.layout[size], 0)) /
        (ordered.length - 1);
      let position = horizontal ? left : top;
      ordered.forEach((el) => {
        state.updateElementPosition(
          el.id,
          horizontal ? position : el.layout.x,
          horizontal ? el.layout.y : position,
        );
        position += el.layout[size] + gap;
      });
    } else
      elements.forEach((el) => {
        const x =
          alignment === "left"
            ? left
            : alignment === "center"
              ? (left + right - el.layout.w) / 2
              : alignment === "right"
                ? right - el.layout.w
                : el.layout.x;
        const y =
          alignment === "top"
            ? top
            : alignment === "middle"
              ? (top + bottom - el.layout.h) / 2
              : alignment === "bottom"
                ? bottom - el.layout.h
                : el.layout.y;
        state.updateElementPosition(el.id, x, y);
      });
  } finally {
    state.endInteraction();
  }
}
