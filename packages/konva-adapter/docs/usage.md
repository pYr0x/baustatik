# @baustatik/konva-adapter Usage
Location: `packages/konva-adapter`

## Overview
Adapter layer between section-domain geometry (`@baustatik/section-geometry`) and neutral render world coordinates.

For the mapping layer:
- Section point: `y` right, `z` down
- World point: `u` right, `v` down
- Mapping rule: `u = y`, `v = z`

## Planned Mapping API

```ts
import type {
  PointType as SectionPoint,
  PolylineType as SectionPolyline,
  PolygonType as SectionPolygon,
  ArcType as SectionArc,
} from '@baustatik/section-geometry';

import type { WorldPoint } from '@baustatik/render-core';

export function sectionPointToWorld(p: SectionPoint): WorldPoint;
export function sectionPolylineToWorldPoints(pl: SectionPolyline): WorldPoint[];
export function sectionPolygonToWorldPoints(pg: SectionPolygon): WorldPoint[];
export function sectionArcStartPointToWorld(arc: SectionArc): WorldPoint;
export function sectionArcMidPointToWorld(arc: SectionArc): WorldPoint;
export function sectionArcEndPointToWorld(arc: SectionArc): WorldPoint;
```
