/** Shared by the design canvas, preview and exported application. */
export const SHAPE_PATHS: Record<string, string> = {
  circle: "M50 2 A48 48 0 1 1 50 98 A48 48 0 1 1 50 2Z",
  triangle: "M50 2 L98 98 L2 98Z",
  star: "M50 2 L63 38 L98 38 L70 60 L80 98 L50 75 L20 98 L30 60 L2 38 L37 38Z",
  hexagon: "M50 2 L93 25 L93 75 L50 98 L7 75 L7 25Z",
  heart: "M50 88 C25 65 5 50 5 30 C5 15 15 5 30 5 C40 5 47 12 50 18 C53 12 60 5 70 5 C85 5 95 15 95 30 C95 50 75 65 50 88Z",
};
