import type { SectionGeometry } from '../model/section-geometry';
import type { SectionPolicy } from '../policy';
import { feBlock } from './fe-block';
import { greenValues } from './green';
import { scaleSegments, segments } from './wall-path/segments';
import { wallPath } from './wall-path/calculate-wall-path';
import type { CatalogueValues } from './to-si';
import { MM_TO_CM } from './units';

/**
 * Werte der gezeichneten Geometrie in Katalogeinheiten.
 *
 * Der mitgeführte Umriss liefert die Grundwerte. Beim dünnwandigen
 * Mittellinienmodell ergänzt der Wandweg, sonst ein vorhandener FE-Zustand.
 */
export function geometryValues(
  geometry: SectionGeometry,
  policy: SectionPolicy,
): CatalogueValues | undefined {
  const c = MM_TO_CM;
  const green = greenValues(
    geometry.outline.map((polygon) => ({
      points: polygon.points.map((point) => ({
        y: point.y * c,
        z: point.z * c,
      })),
    })),
  );
  if (green === undefined) return undefined;

  const outline = {
    A: green.A,
    Iy: green.Iy,
    Iz: green.Iz,
    Iyz: green.Iyz,
    ys: green.ys,
    zs: green.zs,
  };

  if (geometry.kind !== 'midline' || geometry.idealisation !== 'thin-walled') {
    return { ...outline, ...feBlock(geometry.feValues) };
  }

  const path = wallPath(
    scaleSegments(segments(geometry.nodes, geometry.walls, policy), c),
    outline,
  );
  if (path === undefined) return outline;

  return {
    ...outline,
    kappaY: path.kappaY,
    kappaZ: path.kappaZ,
    yM: path.yM,
    zM: path.zM,
    It: path.It,
  };
}
