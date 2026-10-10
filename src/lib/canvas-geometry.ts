/** CSS translations and transform origins cancel when converting pointer deltas. */
export function screenMatrix(node: HTMLElement) {
  let matrix = new DOMMatrix();
  for (
    let current: HTMLElement | null = node;
    current;
    current = current.parentElement
  ) {
    const transform = getComputedStyle(current).transform;
    if (transform !== "none")
      matrix = new DOMMatrix(transform).multiply(matrix);
  }
  return new DOMMatrix([matrix.a, matrix.b, matrix.c, matrix.d, 0, 0]);
}

export function localDelta(node: HTMLElement, x: number, y: number) {
  return new DOMPoint(x, y).matrixTransform(screenMatrix(node).inverse());
}

/** Recover the transformed border-box origin from its four corners and AABB. */
export function localPoint(node: HTMLElement, x: number, y: number) {
  const matrix = screenMatrix(node),
    rect = node.getBoundingClientRect();
  const corners = [
    [0, 0],
    [node.offsetWidth, 0],
    [0, node.offsetHeight],
    [node.offsetWidth, node.offsetHeight],
  ].map(([cx, cy]) => new DOMPoint(cx, cy).matrixTransform(matrix));
  const originX = rect.left - Math.min(...corners.map((p) => p.x));
  const originY = rect.top - Math.min(...corners.map((p) => p.y));
  return new DOMPoint(x - originX, y - originY).matrixTransform(
    matrix.inverse(),
  );
}

export function childPosition(node: HTMLElement, parent: HTMLElement) {
  const rect = node.getBoundingClientRect();
  const center = localPoint(
    parent,
    rect.left + rect.width / 2,
    rect.top + rect.height / 2,
  );
  const styles = getComputedStyle(node);
  return {
    x:
      center.x -
      node.offsetWidth / 2 -
      parent.clientLeft +
      parent.scrollLeft -
      (parseFloat(styles.marginLeft) || 0),
    y:
      center.y -
      node.offsetHeight / 2 -
      parent.clientTop +
      parent.scrollTop -
      (parseFloat(styles.marginTop) || 0),
  };
}
