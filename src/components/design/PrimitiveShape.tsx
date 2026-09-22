import { SHAPE_PATHS } from "@/lib/shape-paths";
export default function PrimitiveShape({
  shapeType,
  color,
}: {
  shapeType: string;
  color: string;
}) {
  const path = SHAPE_PATHS[shapeType];
  return path ? (
    <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}>
      <path d={path} fill={color} />
    </svg>
  ) : (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: color,
        borderRadius: "inherit",
      }}
    />
  );
}
