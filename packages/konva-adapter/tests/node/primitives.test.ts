import type {
  ArcPathSpec,
  ArrowSpec,
  CircleSpec,
  LabelSpec,
  LineSpec,
  PolygonSpec,
  RectangleSpec,
  TriangleSpec,
} from '@baustatik/render-core';
import { describe, expect, it } from 'vitest';
import {
  arcPathConfig,
  arcPathData,
  arrowConfig,
  circleConfig,
  labelScale,
  labelTagConfig,
  labelTextConfig,
  labelTopLeft,
  lineConfig,
  polygonConfig,
  rectangleConfig,
  triangleConfig,
} from '../../src/primitives';

// Exakte toEqual-Vergleiche statt toMatchObject: der Patch-Pfad schickt genau
// diese Objekte durch setAttrs, deshalb muss ein weggefallenes ODER ein
// zusaetzliches Feld auffallen — nicht nur die erwarteten Treffer.

describe('lineConfig()', () => {
  const spec: LineSpec = {
    id: 'l1',
    kind: 'line',
    from: { u: 0, v: 0 },
    to: { u: 10, v: 4 },
    strokeColor: 'black',
    strokeWidth: 2,
  };

  it('maps the full spec to a Konva line config', () => {
    expect(lineConfig(spec)).toEqual({
      id: 'l1',
      points: [0, 0, 10, 4],
      stroke: 'black',
      strokeWidth: 2,
      strokeScaleEnabled: false,
      dash: undefined,
    });
  });

  it('carries strokeStyle through as a dash pattern', () => {
    expect(lineConfig({ ...spec, strokeStyle: 'dashed' }).dash).toEqual([8, 4]);
  });
});

describe('circleConfig()', () => {
  const spec: CircleSpec = {
    id: 'c1',
    kind: 'circle',
    center: { u: 5, v: 6 },
    radius: 3,
    fillColor: 'blue',
  };

  it('maps the full spec to a Konva circle config', () => {
    expect(circleConfig(spec)).toEqual({
      id: 'c1',
      x: 5,
      y: 6,
      radius: 3,
      fill: 'blue',
      stroke: undefined,
      strokeWidth: undefined,
      strokeScaleEnabled: false,
      dash: undefined,
    });
  });
});

describe('polygonConfig()', () => {
  const spec: PolygonSpec = {
    id: 'p1',
    kind: 'polygon',
    points: [
      { u: 0, v: 0 },
      { u: 10, v: 0 },
      { u: 5, v: 5 },
    ],
    closed: true,
    fillColor: 'green',
  };

  it('maps the full spec to a Konva line config', () => {
    expect(polygonConfig(spec)).toEqual({
      id: 'p1',
      points: [0, 0, 10, 0, 5, 5],
      closed: true,
      fill: 'green',
      stroke: undefined,
      strokeWidth: undefined,
      strokeScaleEnabled: false,
      dash: undefined,
    });
  });
});

describe('rectangleConfig()', () => {
  const spec: RectangleSpec = {
    id: 'r1',
    kind: 'rectangle',
    topLeft: { u: 2, v: 3 },
    width: 20,
    height: 10,
    cornerRadius: [1, 2, 3, 4],
    fillColor: 'orange',
  };

  it('maps the full spec to a Konva rect config', () => {
    expect(rectangleConfig(spec)).toEqual({
      id: 'r1',
      x: 2,
      y: 3,
      width: 20,
      height: 10,
      cornerRadius: [1, 2, 3, 4],
      fill: 'orange',
      stroke: undefined,
      strokeWidth: undefined,
      strokeScaleEnabled: false,
      dash: undefined,
    });
  });

  it('leaves cornerRadius undefined when the spec omits it', () => {
    const { cornerRadius, ...rest } = spec;
    expect(rectangleConfig(rest).cornerRadius).toBeUndefined();
  });
});

describe('arrowConfig()', () => {
  const spec: ArrowSpec = {
    id: 'a1',
    kind: 'arrow',
    tail: { u: 0, v: -3 },
    tip: { u: 0, v: 0 },
    pointerLength: 0.6,
    pointerWidth: 0.5,
    strokeColor: '#1d4ed8',
    strokeWidth: 2,
    fillColor: '#1d4ed8',
  };

  it('maps the full spec to a Konva arrow config', () => {
    expect(arrowConfig(spec)).toEqual({
      id: 'a1',
      points: [0, -3, 0, 0],
      pointerLength: 0.6,
      pointerWidth: 0.5,
      fill: '#1d4ed8',
      stroke: '#1d4ed8',
      strokeWidth: 2,
      strokeScaleEnabled: false,
      dash: undefined,
    });
  });

  it('orders the points tail -> tip, because Konva draws the head last', () => {
    const reversed = arrowConfig({ ...spec, tail: spec.tip, tip: spec.tail });

    expect(arrowConfig(spec).points).toEqual([0, -3, 0, 0]);
    expect(reversed.points).toEqual([0, 0, 0, -3]);
  });
});

describe('arcPathConfig()', () => {
  // Viertelbogen von rechts nach unten: bei v nach unten ist das der wachsende
  // Winkel, also der Uhrzeigersinn auf dem Schirm.
  const spec: ArcPathSpec = {
    id: 'arc1',
    kind: 'arcPath',
    center: { u: 0, v: 0 },
    radius: 2,
    startAngle: 0,
    sweepAngle: Math.PI / 2,
    strokeColor: '#1d4ed8',
    strokeWidth: 2,
  };

  // 'M x0 y0 A rx ry rotation large-arc sweep x1 y1'
  function tokens(data: string) {
    const t = data.split(' ');
    return {
      from: { u: Number(t[1]), v: Number(t[2]) },
      radii: { rx: Number(t[4]), ry: Number(t[5]) },
      rotation: t[6],
      largeArc: t[7],
      sweepFlag: t[8],
      to: { u: Number(t[9]), v: Number(t[10]) },
    };
  }

  it('maps the full spec to a Konva path config', () => {
    expect(arcPathConfig(spec)).toEqual({
      id: 'arc1',
      data: arcPathData(spec),
      stroke: '#1d4ed8',
      strokeWidth: 2,
      strokeScaleEnabled: false,
      dash: undefined,
    });
  });

  it('draws the arc from the start angle to start + sweep', () => {
    const t = tokens(arcPathData(spec));

    expect(t.from.u).toBeCloseTo(2, 10);
    expect(t.from.v).toBeCloseTo(0, 10);
    expect(t.to.u).toBeCloseTo(0, 10);
    expect(t.to.v).toBeCloseTo(2, 10);
    // Ein Kreisbogen, keine Ellipse: beide Radien gleich, keine Drehung.
    expect(t.radii).toEqual({ rx: 2, ry: 2 });
    expect(t.rotation).toBe('0');
  });

  it('sets the large-arc-flag above half a turn', () => {
    expect(tokens(arcPathData(spec)).largeArc).toBe('0');
    expect(
      tokens(arcPathData({ ...spec, sweepAngle: (3 * Math.PI) / 2 })).largeArc,
    ).toBe('1');
  });

  it('takes the sweep-flag from the sign, not from the endpoints', () => {
    // Beide Boegen haben dieselben Endpunkte; nur das Vorzeichen unterscheidet
    // sie — ohne das Flag waere der Umlauf nicht darstellbar.
    expect(tokens(arcPathData(spec)).sweepFlag).toBe('1');
    expect(
      tokens(arcPathData({ ...spec, startAngle: Math.PI / 2, sweepAngle: -Math.PI / 2 }))
        .sweepFlag,
    ).toBe('0');
  });

  it('shifts the arc with its centre', () => {
    const t = tokens(arcPathData({ ...spec, center: { u: 10, v: -5 } }));

    expect(t.from.u).toBeCloseTo(12, 10);
    expect(t.from.v).toBeCloseTo(-5, 10);
  });
});

describe('labelTextConfig() und labelTagConfig()', () => {
  const spec: LabelSpec = {
    id: 'lb1',
    kind: 'label',
    text: '10 kN',
    anchor: { u: 0, v: -3 },
    direction: { u: 0, v: -1 },
    gap: 0.3,
    fontSize: 0.6,
    fontFamily: 'sans-serif',
    textColor: '#1d4ed8',
    padding: 0.15,
    backgroundColor: '#dbeafe',
    borderColor: '#1d4ed8',
    borderWidth: 1,
    cornerRadius: 0.15,
  };

  it('builds the text at the REFERENCE size, not at the spec size', () => {
    // `fontSize` ist ein WELTMASS und wird beim Zoomen beliebig klein. Direkt in
    // den Fontstring gesetzt („0.012px") quantisieren die Browser die Schrift
    // oder verwerfen sie — die Groesse waere beim Reinzoomen nicht mehr konstant.
    // Die Verkleinerung macht deshalb die Skalierung der Gruppe.
    expect(labelTextConfig(spec)).toEqual({
      text: '10 kN',
      fontSize: 100,
      fontFamily: 'sans-serif',
      fill: '#1d4ed8',
      // In Referenzeinheiten: 0.15 Welt / (0.6/100) = 25.
      padding: 25,
    });
  });

  it('maps the box fields to a Konva tag config without a pointer', () => {
    expect(labelTagConfig(spec)).toEqual({
      fill: '#dbeafe',
      stroke: '#1d4ed8',
      strokeWidth: 1,
      strokeScaleEnabled: false,
      // Wie das padding in Referenzeinheiten; `strokeWidth` dagegen NICHT — es
      // ist ueber `strokeScaleEnabled: false` ohnehin ein Screen-Pixel.
      cornerRadius: 25,
      pointerDirection: 'none',
    });
  });

  it('keeps the on-screen size constant however small fontSize gets', () => {
    // Der Kern der Regel: Referenzgroesse mal Skalierung ergibt immer wieder das
    // Weltmass — und zwar OHNE dass eine winzige Zahl je im Fontstring landet.
    for (const fontSize of [12, 0.6, 0.012, 1e-5]) {
      const tiny = { ...spec, fontSize };

      expect(labelTextConfig(tiny).fontSize).toBe(100);
      expect(labelScale(tiny) * 100).toBeCloseTo(fontSize, 12);
    }
  });

  it('passes optional border and corner fields through as undefined', () => {
    const { borderColor, borderWidth, cornerRadius, ...bare } = spec;

    expect(labelTagConfig(bare)).toMatchObject({
      stroke: undefined,
      strokeWidth: undefined,
      cornerRadius: undefined,
    });
  });
});

describe('labelTopLeft() — die Platzierungsregel', () => {
  const spec: LabelSpec = {
    id: 'lb1',
    kind: 'label',
    text: '10 kN',
    anchor: { u: 0, v: 0 },
    direction: { u: 0, v: -1 },
    gap: 6,
    fontSize: 12,
    fontFamily: 'sans-serif',
    textColor: '#000',
    padding: 0,
    backgroundColor: '#fff',
  };

  // Box 40 x 20, Halbmaße 20 / 10.
  const W = 40;
  const H = 20;

  it('puts the near edge at exactly gap for an axis-parallel direction', () => {
    // Nach oben: Mittelpunkt bei v = -(6 + 10) = -16, linke obere Ecke -26.
    expect(labelTopLeft(spec, W, H)).toEqual({ x: -20, y: -26 });
    // Nach rechts: Mittelpunkt bei u = 6 + 20 = 26, Ecke bei 6.
    expect(labelTopLeft({ ...spec, direction: { u: 1, v: 0 } }, W, H)).toEqual({
      x: 6,
      y: -10,
    });
  });

  it('normalises the direction — only its heading matters', () => {
    expect(labelTopLeft({ ...spec, direction: { u: 0, v: -7 } }, W, H)).toEqual(
      labelTopLeft(spec, W, H),
    );
  });

  it('uses the ray-rectangle intersection for a skewed direction', () => {
    // d = (1,-1)/sqrt(2). t = min(20 / 0.7071, 10 / 0.7071) = 10*sqrt(2).
    const t = 10 * Math.SQRT2;
    const distance = 6 + t;
    const box = labelTopLeft({ ...spec, direction: { u: 1, v: -1 } }, W, H);

    expect(box.x).toBeCloseTo(Math.SQRT1_2 * distance - 20, 10);
    expect(box.y).toBeCloseTo(-Math.SQRT1_2 * distance - 10, 10);
  });

  it('keeps the ray hitting the box edge at distance gap, skewed included', () => {
    // Der eigentliche Inhalt der Regel: von A aus in Richtung d liegt der
    // Boxrand immer bei gap — egal ob achsparallel oder schraeg.
    for (const direction of [
      { u: 0, v: -1 },
      { u: 1, v: 0 },
      { u: 1, v: -1 },
      { u: -3, v: 1 },
    ]) {
      const box = labelTopLeft({ ...spec, direction }, W, H);
      const length = Math.hypot(direction.u, direction.v);
      const du = direction.u / length;
      const dv = direction.v / length;

      // Von A in Richtung d bis zum Rand laufen und pruefen, dass genau dort
      // die Box beginnt: eine Komponente sitzt exakt auf dem Rand.
      const hitU = spec.anchor.u + du * spec.gap;
      const hitV = spec.anchor.v + dv * spec.gap;
      const onVerticalEdge =
        Math.abs(hitU - box.x) < 1e-9 || Math.abs(hitU - (box.x + W)) < 1e-9;
      const onHorizontalEdge =
        Math.abs(hitV - box.y) < 1e-9 || Math.abs(hitV - (box.y + H)) < 1e-9;

      expect(onVerticalEdge || onHorizontalEdge).toBe(true);
    }
  });
});

describe('triangleConfig()', () => {
  const spec: TriangleSpec = {
    id: 't1',
    kind: 'triangle',
    center: { u: 0, v: 0 },
    sideLength: 6,
    fillColor: 'red',
  };

  it('maps the full spec to a 3-sided regular polygon config', () => {
    expect(triangleConfig(spec)).toEqual({
      id: 't1',
      x: 0,
      y: 0,
      sides: 3,
      // Umkreisradius R = a / sqrt(3) fuer ein gleichseitiges Dreieck.
      radius: 6 / Math.sqrt(3),
      fill: 'red',
      stroke: undefined,
      strokeWidth: undefined,
      strokeScaleEnabled: false,
      dash: undefined,
    });
  });

  it('derives the circumradius R = a / sqrt(3) from sideLength', () => {
    expect(triangleConfig(spec).radius).toBeCloseTo(6 / Math.sqrt(3), 10);
    expect(triangleConfig({ ...spec, sideLength: 12 }).radius).toBeCloseTo(
      12 / Math.sqrt(3),
      10,
    );
  });
});
