import { atOrThrow } from '@baustatik/core';
import type { WorldPoint } from '@baustatik/viewport-2d';
import { InvalidWorldPointError } from '@baustatik/viewport-2d';
import { InvalidSpecError, DuplicateSpecIdError } from './errors';
import type { Spec } from './specs';

function checkWorldPoint(
  point: WorldPoint,
  specId: string,
  path: string,
): void {
  if (point === undefined || point === null) {
    throw new InvalidSpecError(specId, `${path} darf nicht undefiniert sein`);
  }
  if (!Number.isFinite(point.u) || !Number.isFinite(point.v)) {
    throw new InvalidWorldPointError(
      `${path} in Spec ${specId} hat unendliche oder NaN-Koordinaten: u=${point.u}, v=${point.v}`,
    );
  }
}

function checkStrokeAndFill(spec: Spec): void {
  if (spec.strokeWidth !== undefined) {
    if (!Number.isFinite(spec.strokeWidth) || spec.strokeWidth < 0) {
      throw new InvalidSpecError(
        spec.id,
        `strokeWidth muss eine nicht-negative endliche Zahl sein, erhalten: ${spec.strokeWidth}`,
      );
    }
  }
  if (spec.strokeColor !== undefined) {
    if (
      typeof spec.strokeColor !== 'string' ||
      spec.strokeColor.trim() === ''
    ) {
      throw new InvalidSpecError(
        spec.id,
        'strokeColor darf kein leerer String sein',
      );
    }
  }
  if ('fillColor' in spec && spec.fillColor !== undefined) {
    if (typeof spec.fillColor !== 'string' || spec.fillColor.trim() === '') {
      throw new InvalidSpecError(
        spec.id,
        'fillColor darf kein leerer String sein',
      );
    }
  }
}

export function validateSpec(spec: Spec): void {
  if (!spec) {
    throw new InvalidSpecError('', 'Spec darf nicht undefiniert sein');
  }
  if (!spec.id || typeof spec.id !== 'string' || spec.id.trim() === '') {
    throw new InvalidSpecError('', 'Spec ID muss ein nicht-leerer String sein');
  }

  checkStrokeAndFill(spec);

  switch (spec.kind) {
    case 'line':
      checkWorldPoint(spec.from, spec.id, 'from');
      checkWorldPoint(spec.to, spec.id, 'to');
      break;

    case 'circle':
      checkWorldPoint(spec.center, spec.id, 'center');
      if (!Number.isFinite(spec.radius) || spec.radius <= 0) {
        throw new InvalidSpecError(
          spec.id,
          `radius muss eine positive endliche Zahl sein, erhalten: ${spec.radius}`,
        );
      }
      break;

    case 'polygon':
      if (!Array.isArray(spec.points)) {
        throw new InvalidSpecError(spec.id, 'points muss ein Array sein');
      }
      if (spec.points.length < 3) {
        throw new InvalidSpecError(
          spec.id,
          `polygon points muss mindestens 3 Punkte enthalten, erhalten: ${spec.points.length}`,
        );
      }
      for (let i = 0; i < spec.points.length; i++) {
        checkWorldPoint(
          atOrThrow(spec.points as WorldPoint[], i),
          spec.id,
          `points[${i}]`,
        );
      }
      break;

    case 'triangle':
      checkWorldPoint(spec.center, spec.id, 'center');
      if (!Number.isFinite(spec.sideLength) || spec.sideLength <= 0) {
        throw new InvalidSpecError(
          spec.id,
          `sideLength muss eine positive endliche Zahl sein, erhalten: ${spec.sideLength}`,
        );
      }
      break;

    default:
      // Typescript exhaustive check fallback at runtime
      throw new InvalidSpecError(
        (spec as any).id,
        `Unbekannter Spec-Typ: ${(spec as any).kind}`,
      );
  }
}

export function validateSpecs(specs: readonly Spec[]): void {
  if (!Array.isArray(specs)) {
    throw new InvalidSpecError('', 'specs muss ein Array sein');
  }
  const seenIds = new Set<string>();
  for (let i = 0; i < specs.length; i++) {
    const spec = atOrThrow(specs as Spec[], i);
    validateSpec(spec);
    if (seenIds.has(spec.id)) {
      throw new DuplicateSpecIdError(spec.id);
    }
    seenIds.add(spec.id);
  }
}
