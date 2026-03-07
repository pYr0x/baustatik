import type { WorldPoint } from '@baustatik/render-core';
import type { ArcType as SectionArc } from '@baustatik/section-geometry';
import { Arc } from '@baustatik/section-geometry';

import { InvalidArcSamplingOptionsError } from './errors';
import { sectionPointToWorld } from './mapping';

export type ArcSamplingOptions = {
  readonly segments?: number;
  readonly maxChordLength?: number;
};

function validateSamplingOptions(options: ArcSamplingOptions): void {
  if (options.segments !== undefined) {
    if (!Number.isInteger(options.segments) || options.segments < 1) {
      throw new InvalidArcSamplingOptionsError(
        'segments muss eine ganze Zahl >= 1 sein',
      );
    }
  }

  if (options.maxChordLength !== undefined) {
    if (
      !Number.isFinite(options.maxChordLength) ||
      options.maxChordLength <= 0
    ) {
      throw new InvalidArcSamplingOptionsError(
        'maxChordLength muss > 0 und endlich sein',
      );
    }
  }
}

export function sampleSectionArcToWorldPoints(
  arc: SectionArc,
  options: ArcSamplingOptions = {},
): WorldPoint[] {
  validateSamplingOptions(options);

  const polyline =
    options.maxChordLength !== undefined
      ? Arc.toPolyline(arc, { tolerance: options.maxChordLength })
      : Arc.toPolyline(arc, { segments: options.segments ?? 16 });

  return polyline.points.map((p) => sectionPointToWorld(p));
}
