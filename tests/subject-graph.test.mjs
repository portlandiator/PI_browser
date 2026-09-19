import {test} from 'node:test';
import assert from 'node:assert/strict';
import {circularLayout} from '../src/subject-graph.mjs';

test('circular neighborhoods keep full labels separated and inside the canvas', () => {
  for (const width of [146, 206]) for (let count = 1; count <= 12; count++) for (const height of [40, 68, 116]) {
    const layout = circularLayout(count, width, height), points = [layout.center, ...layout.neighbors];
    const radii = layout.neighbors.map(([x, y]) => Math.hypot(x-layout.center[0], y-layout.center[1]));
    assert.ok(radii.every(r => Math.abs(r-radii[0]) < 1e-6));
    for (const [x, y] of points) assert.ok(x >= width/2 && x <= layout.width-width/2 && y >= height/2 && y <= layout.height-height/2);
    for (let i=0;i<points.length;i++) for(let j=i+1;j<points.length;j++) {
      assert.ok(Math.abs(points[i][0]-points[j][0]) >= width+24-1e-6 || Math.abs(points[i][1]-points[j][1]) >= height+24-1e-6);
    }
  }
});
