import type { WorldPoint } from '@baustatik/render-core';
import type { ArcType as SectionArc } from '@baustatik/section-geometry';

export type ArcSamplingOptions = {
  readonly segments?: number;
  readonly maxChordLength?: number;
};

export function sampleSectionArcToWorldPoints(
  _arc: SectionArc,
  _options?: ArcSamplingOptions,
): WorldPoint[] {
  throw new Error('TODO: sampleSectionArcToWorldPoints not implemented');
}
