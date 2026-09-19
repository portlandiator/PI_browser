// Expand the circle just enough to keep full rectangular labels separated.
export function circularLayout(count, nodeWidth, nodeHeight) {
  const points = Array.from({length: count}, (_, i) => {
    const angle = -Math.PI / 2 + i * 2 * Math.PI / count;
    return [Math.cos(angle), Math.sin(angle)];
  });
  let radius = 230;
  const all = [[0, 0], ...points];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const dx = Math.abs(all[i][0] - all[j][0]), dy = Math.abs(all[i][1] - all[j][1]);
    radius = Math.max(radius, Math.min((nodeWidth + 24) / dx, (nodeHeight + 24) / dy));
  }
  radius = Math.ceil(radius);
  const width = 2 * radius + nodeWidth + 40, height = 2 * radius + nodeHeight + 40;
  const center = [width / 2, height / 2];
  return {width, height, center, neighbors: points.map(([x, y]) => [center[0] + radius * x, center[1] + radius * y])};
}
