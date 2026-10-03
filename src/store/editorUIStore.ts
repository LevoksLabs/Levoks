import { create } from "zustand";
import type { Breakpoint } from "@/lib/design";

// Session-only editor chrome. These preferences are never application IR.
export const useEditorUIStore = create<{
  tool: "select" | "hand" | "marquee" | "pen";
  canvasMode: "ui" | "backend" | "routes";
  breakpoint: "base" | "tablet" | "mobile";
  viewportSize: { width: number; height: number } | null;
  setBreakpoint: (breakpoint: Breakpoint) => void;
  motionOpen: boolean;
  trayWidth: number;
  inspectorWidth: number;
  viewportLocked: boolean;
  gridVisible: boolean;
  hideOverflow: boolean;
  snapEnabled: boolean;
  inspectorVisible: boolean;
  trayCollapsed: boolean;
  helpOpen: boolean;
  setTool: (tool: "select" | "hand" | "marquee" | "pen") => void;
  toggle: (
    key:
      | "viewportLocked"
      | "gridVisible"
      | "hideOverflow"
      | "snapEnabled"
      | "inspectorVisible"
      | "trayCollapsed"
      | "helpOpen",
  ) => void;
}>((set) => ({
  tool: "select",
  canvasMode: "ui",
  breakpoint: "base",
  viewportSize: null,
  setBreakpoint: (breakpoint) => set({ breakpoint, viewportSize: null }),
  motionOpen: false,
  trayWidth: 252,
  inspectorWidth: 284,
  viewportLocked: false,
  gridVisible: true,
  hideOverflow: false,
  snapEnabled: true,
  inspectorVisible: true,
  trayCollapsed: false,
  helpOpen: false,
  setTool: (tool) => set({ tool }),
  toggle: (key) => set((state) => ({ [key]: !state[key] })),
}));
