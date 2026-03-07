import type { Viewport } from '@baustatik/render-core';
import type {
  ArcType as Arc,
  LineType as Line,
} from '@baustatik/section-geometry';

import {
  type ArcSamplingOptions,
  sampleSectionArcToWorldPoints,
} from './arc-sampling';
import {
  worldPolylineToKonvaPoints,
  worldToKonvaPoint,
} from './konva-builders';
import { sectionPointToWorld } from './mapping';

export type LineWithThickness = {
  readonly axis: Line;
  readonly thickness: number;
};

export type ArcWithThickness = {
  readonly axis: Arc;
  readonly thickness: number;
};

type ThickLineProps = {
  readonly points: number[];
  readonly strokeWidth: number;
  readonly lineCap: 'butt';
  readonly lineJoin: 'miter';
};

export type ArcRenderMode = 'sampled-line' | 'native-arc';

type NativeArcProps = {
  readonly x: number;
  readonly y: number;
  readonly innerRadius: number;
  readonly outerRadius: number;
  readonly angle: number;
  readonly rotation: number;
  readonly clockwise: boolean;
};

type ArcShapeSpec =
  | {
      readonly shapeType: 'Line';
      readonly props: ReturnType<typeof arcWithThicknessToKonvaLineProps>;
    }
  | {
      readonly shapeType: 'Arc';
      readonly props: ReturnType<typeof arcWithThicknessToNativeKonvaArcProps>;
    };

type LineShapeSpec = {
  readonly shapeType: 'Line';
  readonly props: ReturnType<typeof lineWithThicknessToKonvaLineProps>;
};

const TAU = 2 * Math.PI;

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function normalizeAngleRadians(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

function positiveSweepRadians(startAngle: number, endAngle: number): number {
  return normalizeAngleRadians(endAngle - startAngle);
}

function innerRadiusWorld(radius: number, thickness: number): number {
  return radius - thickness / 2;
}

function ensurePositiveInnerRadius(radius: number, thickness: number): void {
  if (innerRadiusWorld(radius, thickness) <= 0) {
    throw new RangeError('Arc thickness erzeugt keinen gueltigen innerRadius');
  }
}

function arcToKonvaAngleProps(axis: Arc): {
  readonly angle: number;
  readonly rotation: number;
  readonly clockwise: boolean;
} {
  const sweep = positiveSweepRadians(axis.startAngle, axis.endAngle);
  const sweepDegrees = toDegrees(sweep);
  const konvaAngle = sweepDegrees === 0 ? 0 : 360 - sweepDegrees;

  return {
    angle: konvaAngle,
    rotation: toDegrees(axis.startAngle),
    clockwise: true,
  };
}

function toStrokeWidth(thickness: number, vp: Viewport): number {
  return thickness * vp.scale;
}

export function lineWithThicknessToKonvaLineProps(
  item: LineWithThickness,
  vp: Viewport,
): ThickLineProps {
  const start = sectionPointToWorld(item.axis.p1);
  const end = sectionPointToWorld(item.axis.p2);
  const points = worldPolylineToKonvaPoints([start, end], vp);

  return {
    points,
    strokeWidth: toStrokeWidth(item.thickness, vp),
    lineCap: 'butt',
    lineJoin: 'miter',
  };
}

export function arcWithThicknessToKonvaLineProps(
  item: ArcWithThickness,
  vp: Viewport,
  options: ArcSamplingOptions = {},
): ThickLineProps {
  const sampled = sampleSectionArcToWorldPoints(item.axis, options);
  const points = worldPolylineToKonvaPoints(sampled, vp);

  return {
    points,
    strokeWidth: toStrokeWidth(item.thickness, vp),
    lineCap: 'butt',
    lineJoin: 'miter',
  };
}

export function arcWithThicknessToNativeKonvaArcProps(
  item: ArcWithThickness,
  vp: Viewport,
): NativeArcProps {
  const radius = item.axis.radius;
  const thickness = item.thickness;
  ensurePositiveInnerRadius(radius, thickness);

  const centerWorld = sectionPointToWorld(item.axis.center);
  const centerScreen = worldToKonvaPoint(centerWorld, vp);
  const innerRadius = innerRadiusWorld(radius, thickness) * vp.scale;
  const outerRadius = (radius + thickness / 2) * vp.scale;
  const angleProps = arcToKonvaAngleProps(item.axis);

  return {
    x: centerScreen.x,
    y: centerScreen.y,
    innerRadius,
    outerRadius,
    angle: angleProps.angle,
    rotation: angleProps.rotation,
    clockwise: angleProps.clockwise,
  };
}

export function arcWithThicknessToKonvaShapeSpec(
  item: ArcWithThickness,
  vp: Viewport,
  options: {
    readonly renderMode?: ArcRenderMode;
    readonly sampling?: ArcSamplingOptions;
  } = {},
): ArcShapeSpec {
  if (options.renderMode === 'native-arc') {
    return {
      shapeType: 'Arc',
      props: arcWithThicknessToNativeKonvaArcProps(item, vp),
    };
  }

  return {
    shapeType: 'Line',
    props: arcWithThicknessToKonvaLineProps(item, vp, options.sampling),
  };
}

export function lineWithThicknessToKonvaShapeSpec(
  item: LineWithThickness,
  vp: Viewport,
): LineShapeSpec {
  return {
    shapeType: 'Line',
    props: lineWithThicknessToKonvaLineProps(item, vp),
  };
}
