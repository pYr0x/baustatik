import { atOrThrow } from '@baustatik/core';
import type { WorldPoint } from '@baustatik/viewport-2d';
import { InvalidWorldPointError } from '@baustatik/viewport-2d';
import { DuplicateSpecIdError, InvalidSpecError } from './errors';
import type { LabelSpec, ShapeSpec, Spec } from './specs';

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

function checkLayer(spec: Spec): void {
  if (spec.layer === undefined) return;
  if (typeof spec.layer !== 'string' || spec.layer.trim() === '') {
    throw new InvalidSpecError(spec.id, 'layer darf kein leerer String sein');
  }
}

function checkColor(
  value: string | undefined,
  specId: string,
  field: string,
): void {
  if (value === undefined) return;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidSpecError(specId, `${field} darf kein leerer String sein`);
  }
}

function checkNumber(
  value: number,
  specId: string,
  field: string,
  { positive }: { positive: boolean },
): void {
  const ok = Number.isFinite(value) && (positive ? value > 0 : value >= 0);
  if (!ok) {
    throw new InvalidSpecError(
      specId,
      `${field} muss eine ${positive ? 'positive' : 'nicht-negative'} endliche Zahl sein, erhalten: ${value}`,
    );
  }
}

function checkStrokeAndFill(spec: ShapeSpec): void {
  if (spec.strokeWidth !== undefined) {
    checkNumber(spec.strokeWidth, spec.id, 'strokeWidth', { positive: false });
  }
  checkColor(spec.strokeColor, spec.id, 'strokeColor');
  if ('fillColor' in spec) {
    checkColor(spec.fillColor, spec.id, 'fillColor');
  }
}

function checkRequiredString(
  value: string,
  specId: string,
  field: string,
): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidSpecError(
      specId,
      `${field} muss ein nicht-leerer String sein`,
    );
  }
}

function checkLabel(spec: LabelSpec): void {
  checkRequiredString(spec.text, spec.id, 'text');
  checkWorldPoint(spec.anchor, spec.id, 'anchor');
  checkWorldPoint(spec.direction, spec.id, 'direction');
  // Eine Richtung der Laenge 0 waehlt keine Seite — der Adapter koennte die Box
  // nirgendwo hinlegen, und der Fehler faende sich erst im Bild wieder.
  if (spec.direction.u === 0 && spec.direction.v === 0) {
    throw new InvalidSpecError(
      spec.id,
      'direction darf nicht der Nullvektor sein',
    );
  }
  checkNumber(spec.gap, spec.id, 'gap', { positive: false });
  checkNumber(spec.fontSize, spec.id, 'fontSize', { positive: true });
  checkNumber(spec.padding, spec.id, 'padding', { positive: false });
  checkRequiredString(spec.fontFamily, spec.id, 'fontFamily');
  checkRequiredString(spec.textColor, spec.id, 'textColor');
  checkRequiredString(spec.backgroundColor, spec.id, 'backgroundColor');
  checkColor(spec.borderColor, spec.id, 'borderColor');
  if (spec.borderWidth !== undefined) {
    checkNumber(spec.borderWidth, spec.id, 'borderWidth', { positive: false });
  }
  if (spec.cornerRadius !== undefined) {
    checkNumber(spec.cornerRadius, spec.id, 'cornerRadius', {
      positive: false,
    });
  }
}

export function validateSpec(spec: Spec): void {
  if (!spec) {
    throw new InvalidSpecError('', 'Spec darf nicht undefiniert sein');
  }
  if (!spec.id || typeof spec.id !== 'string' || spec.id.trim() === '') {
    throw new InvalidSpecError('', 'Spec ID muss ein nicht-leerer String sein');
  }

  checkLayer(spec);

  switch (spec.kind) {
    case 'line':
      checkStrokeAndFill(spec);
      checkWorldPoint(spec.from, spec.id, 'from');
      checkWorldPoint(spec.to, spec.id, 'to');
      break;

    case 'circle':
      checkStrokeAndFill(spec);
      checkWorldPoint(spec.center, spec.id, 'center');
      if (!Number.isFinite(spec.radius) || spec.radius <= 0) {
        throw new InvalidSpecError(
          spec.id,
          `radius muss eine positive endliche Zahl sein, erhalten: ${spec.radius}`,
        );
      }
      break;

    case 'polygon':
      checkStrokeAndFill(spec);
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
      checkStrokeAndFill(spec);
      checkWorldPoint(spec.center, spec.id, 'center');
      if (!Number.isFinite(spec.sideLength) || spec.sideLength <= 0) {
        throw new InvalidSpecError(
          spec.id,
          `sideLength muss eine positive endliche Zahl sein, erhalten: ${spec.sideLength}`,
        );
      }
      break;

    case 'arrow':
      checkStrokeAndFill(spec);
      checkWorldPoint(spec.tail, spec.id, 'tail');
      checkWorldPoint(spec.tip, spec.id, 'tip');
      checkNumber(spec.pointerLength, spec.id, 'pointerLength', {
        positive: true,
      });
      checkNumber(spec.pointerWidth, spec.id, 'pointerWidth', {
        positive: true,
      });
      break;

    case 'arcPath':
      checkStrokeAndFill(spec);
      checkWorldPoint(spec.center, spec.id, 'center');
      checkNumber(spec.radius, spec.id, 'radius', { positive: true });
      if (!Number.isFinite(spec.startAngle)) {
        throw new InvalidSpecError(
          spec.id,
          `startAngle muss endlich sein, erhalten: ${spec.startAngle}`,
        );
      }
      // Beide Grenzen sind ZEICHNERISCH, nicht kosmetisch: ein Umlauf von 0
      // zeichnet nichts, und ein voller Umlauf ist ein Kreis — als Bogen
      // faellt er mit seinem eigenen Anfang zusammen und verschwindet ebenso.
      // Dafuer gibt es `circle`.
      if (
        !Number.isFinite(spec.sweepAngle) ||
        spec.sweepAngle === 0 ||
        Math.abs(spec.sweepAngle) >= 2 * Math.PI
      ) {
        throw new InvalidSpecError(
          spec.id,
          `sweepAngle muss endlich und 0 < |sweepAngle| < 2π sein, erhalten: ${spec.sweepAngle}`,
        );
      }
      break;

    case 'label':
      checkLabel(spec);
      break;

    case 'group':
      checkWorldPoint(spec.position, spec.id, 'position');
      checkWorldPoint(spec.translation, spec.id, 'translation');
      if (
        spec.rotationDeg !== undefined &&
        !Number.isFinite(spec.rotationDeg)
      ) {
        throw new InvalidSpecError(
          spec.id,
          `rotationDeg muss endlich sein, erhalten: ${spec.rotationDeg}`,
        );
      }
      if (!Array.isArray(spec.children) || spec.children.length === 0) {
        throw new InvalidSpecError(
          spec.id,
          'children muss mindestens ein Primitive enthalten',
        );
      }
      for (const child of spec.children) {
        // Dieselbe Begruendung fuer beide: ein Label ist im Renderer eine
        // Gruppe aus Box und Text. Als Kind entstuende also eine verschachtelte
        // Gruppe, und genau die sagt der Konva-Adapter ab.
        const childKind = (child as Spec).kind;
        if (childKind === 'group' || childKind === 'label') {
          throw new InvalidSpecError(
            spec.id,
            'verschachtelte Gruppen werden nicht unterstuetzt (auch nicht als label)',
          );
        }
        if (child.layer !== undefined) {
          throw new InvalidSpecError(
            child.id,
            'Kind-Primitives einer Gruppe duerfen kein layer tragen',
          );
        }
        validateSpec(child);
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

  function checkUniqueIds(spec: Spec): void {
    if (seenIds.has(spec.id)) {
      throw new DuplicateSpecIdError(spec.id);
    }
    seenIds.add(spec.id);
    if (spec.kind === 'group') {
      for (const child of spec.children) checkUniqueIds(child);
    }
  }

  for (let i = 0; i < specs.length; i++) {
    const spec = atOrThrow(specs as Spec[], i);
    validateSpec(spec);
    checkUniqueIds(spec);
  }
}
