import type { ElementNode } from "@/types";
export function mapUrl(props: ElementNode["props"]) {
  const lat = Number(props.latitude ?? 51.505),
    lon = Number(props.longitude ?? -0.09),
    zoom = Number(props.zoom ?? 13);
  if (
    !Number.isFinite(lat + lon + zoom) ||
    lat < -85 ||
    lat > 85 ||
    lon < -180 ||
    lon > 180 ||
    !Number.isInteger(zoom) ||
    zoom < 1 ||
    zoom > 19
  )
    throw new Error(
      "Map location needs latitude −85…85, longitude −180…180 and zoom 1…19.",
    );
  const span = 360 / 2 ** zoom,
    vertical = span * Math.cos((lat * Math.PI) / 180);
  const query = new URLSearchParams({
    bbox: [
      Math.max(-180, lon - span),
      Math.max(-85, lat - vertical),
      Math.min(180, lon + span),
      Math.min(85, lat + vertical),
    ].join(","),
    layer: "mapnik",
    marker: `${lat},${lon}`,
  });
  return `https://www.openstreetmap.org/export/embed.html?${query}`;
}
