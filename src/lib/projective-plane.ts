export type Point2 = { x: number; y: number };
/** A CSS-transformed flat surface is a projective plane, including perspective. */
export function projectivePlane(
  corners: Point2[],
  width: number,
  height: number,
) {
  const [p0, p1, p2, p3] = corners;
  const dx1 = p1.x - p2.x,
    dx2 = p3.x - p2.x,
    dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y,
    dy2 = p3.y - p2.y,
    dy3 = p0.y - p1.y + p2.y - p3.y;
  const denominator = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(denominator) < 1e-8 || width <= 0 || height <= 0)
    throw new Error("This surface is edge-on or has no editable area.");
  const g = (dx3 * dy2 - dx2 * dy3) / denominator,
    h = (dx1 * dy3 - dx3 * dy1) / denominator;
  const m = [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
    1,
  ];
  const [a, b, c, d, e, f, i, j, k] = m;
  const inverse = [
    e * k - f * j,
    c * j - b * k,
    b * f - c * e,
    f * i - d * k,
    a * k - c * i,
    c * d - a * f,
    d * j - e * i,
    b * i - a * j,
    a * e - b * d,
  ];
  const map = (matrix: number[], x: number, y: number) => {
    const w = matrix[6] * x + matrix[7] * y + matrix[8];
    if (Math.abs(w) < 1e-10)
      throw new Error("Pointer lies on the perspective horizon.");
    const point = {
      x: (matrix[0] * x + matrix[1] * y + matrix[2]) / w,
      y: (matrix[3] * x + matrix[4] * y + matrix[5]) / w,
    };
    if (!Number.isFinite(point.x + point.y))
      throw new Error("Invalid surface coordinates.");
    return point;
  };
  return {
    toScreen: (x: number, y: number) => map(m, x / width, y / height),
    toLocal: (x: number, y: number) => {
      const p = map(inverse, x, y);
      return { x: p.x * width, y: p.y * height };
    },
  };
}
