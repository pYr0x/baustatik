import { lookupProfile } from '@baustatik/steel-profiles';
import { describe, expect, it } from 'vitest';
import { type CrossSection, sectionProperties } from '../src/index';
import { CM2_TO_M2, CM4_TO_M4 } from '../src/calculation/units';

function values(cs: CrossSection) {
  const p = sectionProperties(cs);
  if (p === undefined) throw new Error('sectionProperties lieferte undefined');
  return p;
}

describe('Rechteck 200 x 500 mm — die Handrechnung', () => {
  const rect = values({
    kind: 'shape',
    id: 'r',
    shape: { kind: 'rectangle', b: 200, h: 500 },
  });

  it('trifft A und Iy', () => {
    expect(rect.A).toBeCloseTo(0.1, 12);
    expect(rect.Iy).toBeCloseTo(2.0833333e-3, 9); // b*h^3/12
    expect(rect.Iz).toBeCloseTo(3.3333333e-4, 10); // h*b^3/12
    expect(rect.Iyz).toBe(0);
  });

  it('legt den Schwerpunkt auf halbe Hoehe', () => {
    // Eingabesystem: z = 0 an der Oberkante.
    expect(rect.ys).toBe(0);
    expect(rect.zs).toBeCloseTo(0.25, 12);
  });

  it('bleibt ohne FE-Block schubstarr — kein Grashof mehr', () => {
    // Bis [ADR 0062](../../../docs/adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md)
    // fiel hier 5/6 aus dem Flaechenschnitt durch die Figur. Das Vollrechteck
    // ist solid-only, sein kappa kommt jetzt aus derselben FE wie das der
    // gezeichneten Figur — und ohne aufgeloesten Block gibt es keines.
    //
    // DER BEWEIS FUER 5/6 IST NICHT WEG, er steht in `tests/kappa.test.ts` und
    // prueft `shearArea` unmittelbar.
    expect(rect.kappaY).toBeUndefined();
    expect(rect.kappaZ).toBeUndefined();
  });
});

describe('Plattenbalken — der Fall, der Steiner prueft', () => {
  // EINGABE IN MILLIMETERN, ERGEBNIS IN SI — genau das ist die Naht, die
  // dieser Test bewacht. Die erwarteten Zahlen sind unveraendert die von Hand
  // gerechneten Meterwerte:
  //   bf = 2000 / hf = 200 / bw = 250 / h = 500 [mm]
  //   Af = 0,400 m2, Schwerpunkt 0,100 m unter OK
  //   As = 0,075 m2, Schwerpunkt 0,350 m unter OK
  //   zs = (0,400*0,100 + 0,075*0,350) / 0,475 = 0,06625 / 0,475 = 0,139474 m
  const wide = {
    kind: 't-section',
    bf: 2000,
    hf: 200,
    bw: 250,
    h: 500,
  } as const;

  it('trifft die von Hand gerechnete Schwerpunktlage', () => {
    const t = values({
      kind: 'shape',
      id: 't',
      shape: { ...wide, idealisation: 'solid' },
    });
    expect(t.A).toBeCloseTo(0.475, 12);
    expect(t.zs).toBeCloseTo(0.1394737, 7);
    expect(t.ys).toBe(0);
    expect(t.Iyz).toBe(0);
  });

  it('legt die Nulllinie IM GURT — kein Sonderfall, sondern die Rechnung', () => {
    // zs = 0,1395 < hf = 0,2. Genau deshalb heisst die Vorlage-Regel
    // „Ecken + SCHWERPUNKT" und nicht „Ecken + Mitte Steg": der massgebende
    // Punkt liegt hier im Gurt, wo die Wanddicke bf betraegt.
    const t = values({
      kind: 'shape',
      id: 't',
      shape: { ...wide, idealisation: 'solid' },
    });
    // `zs` ist SI, `hf` ist mm — deshalb hier gegen den Meterwert.
    expect(t.zs).toBeLessThan(wide.hf * 1e-3);
  });

  it('rechnet Iy mit dem Steiner-Anteil beider Teile', () => {
    // Iy = bf*hf^3/12 + Af*(zs-hf/2)^2 + bw*hs^3/12 + As*(hf+hs/2-zs)^2
    //    = 0,0013333 + 0,400*0,0395^2 + 0,0005625 + 0,075*0,210526^2
    //    = 0,0013333 + 0,000624  + 0,0005625 + 0,003324 = 0,005843 m4
    const t = values({
      kind: 'shape',
      id: 't',
      shape: { ...wide, idealisation: 'solid' },
    });
    expect(t.Iy).toBeCloseTo(0.0058432, 7);
    // Um z liegen beide Teile mittig — kein Steiner-Anteil.
    expect(t.Iz).toBeCloseTo(
      (0.2 * 2.0 ** 3) / 12 + (0.3 * 0.25 ** 3) / 12,
      12,
    );
  });

  it('haelt die Idealisierung von den Werten fern', () => {
    // A, Iy, Iz, ys, zs sind IDENTISCH; nur kappa unterscheidet sich — und
    // seit ADR 0062 heisst das: der duennwandige Zweig hat eines, der solide
    // erst mit seinem FE-Block.
    const solid = values({
      kind: 'shape',
      id: 't',
      shape: { ...wide, idealisation: 'solid' },
    });
    const thin = values({
      kind: 'shape',
      id: 't',
      shape: { ...wide, idealisation: 'thin-walled' },
    });
    expect(thin.A).toBe(solid.A);
    expect(thin.Iy).toBe(solid.Iy);
    expect(thin.Iz).toBe(solid.Iz);
    expect(thin.zs).toBe(solid.zs);
    expect(thin.kappaZ).toBeGreaterThan(0);
    expect(solid.kappaZ).toBeUndefined();
  });

  it('gibt fuer den duennwandigen T praktisch die Stegflaeche als A_s', () => {
    // Das Lehrbuchergebnis: beim duennwandigen T traegt der Steg die Querkraft
    // in z fast allein. A_s = 0,0747 m2 gegen eine Stegflaeche von 0,075 m2.
    const thin = values({
      kind: 'shape',
      id: 't',
      shape: { ...wide, idealisation: 'thin-walled' },
    });
    const As = (thin.kappaZ as number) * thin.A;
    expect(As).toBeGreaterThan(0.9 * 0.075);
    expect(As).toBeLessThan(1.05 * 0.075);
  });
});

describe('Querprobe Parametrik gegen Katalog', () => {
  // Das geschweisste I hat KEINE Ausrundung. Mit den Abmessungen von IPE 80
  // muss deshalb weniger Flaeche und weniger Traegheit herauskommen — nahe
  // dran, aber darunter. Der Test BELEGT die Invariante, statt eine Toleranz
  // zu behaupten.
  const ipe80 = lookupProfile('IPE 80');
  const welded = values({
    kind: 'shape',
    id: 'i',
    shape: {
      kind: 'i-symmetric',
      h: 80,
      b: 46,
      tw: 3.8,
      tf: 5.2,
      idealisation: 'thin-walled',
    },
  });

  it('liegt nahe unter dem Katalogwert — die fehlende Ausrundung', () => {
    const Acat = (ipe80?.A as number) * CM2_TO_M2;
    const Icat = (ipe80?.Iy as number) * CM4_TO_M4;
    expect(welded.A).toBeLessThan(Acat);
    expect(welded.A).toBeGreaterThan(0.95 * Acat);
    expect(welded.Iy).toBeLessThan(Icat);
    expect(welded.Iy).toBeGreaterThan(0.95 * Icat);
  });
});

/**
 * `It` steht bei jeder Form als GESCHLOSSENER Ausdruck da — und nur bei der
 * duennwandigen Idealisierung
 * ([ADR 0040](../../../docs/adr/0040-the-wall-path-is-positioned.md)).
 *
 * Die Ausdruecke sind zugleich das ORAKEL fuer den gerechneten Wandweg
 * (`tests/wall-path.test.ts`); hier stehen sie gegen die Handrechnung.
 *
 * KOMPAKT HEISST `undefined` NICHT MEHR „NIE": seit
 * [ADR 0062](../../../docs/adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md)
 * schreibt die Form sich als Umriss aus, und `It` faellt aus derselben FE wie
 * bei der gezeichneten Figur. Was diese Saetze pruefen, ist deshalb das
 * Ergebnis OHNE aufgeloesten FE-Block — der Zustand, in dem eine frisch
 * eingegebene Form ist. Mit Block steht die Zahl da; das prueft
 * `cross-section-fe/tests/door.test.ts`, weil es dafuer ein Netz braucht.
 */
describe('It: geschlossener Ausdruck duennwandig, `undefined` kompakt', () => {
  const It = (cs: CrossSection) => values(cs).It;

  it('I-Profil: ⅓·(2·b·tf³ + (h−tf)·tw³)', () => {
    const [h, b, tw, tf] = [300, 150, 7.1, 10.7];
    const shape = (idealisation: 'solid' | 'thin-walled'): CrossSection => ({
      kind: 'shape',
      id: 'i',
      shape: { kind: 'i-symmetric', h, b, tw, tf, idealisation },
    });

    // In cm gerechnet, wie das ganze Package innen, und dann nach m⁴.
    const c = 0.1;
    const expected =
      ((2 * (b * c) * (tf * c) ** 3 + (h - tf) * c * (tw * c) ** 3) / 3) *
      CM4_TO_M4;
    expect(It(shape('thin-walled'))).toBeCloseTo(expected, 15);
    expect(It(shape('solid'))).toBeUndefined();
  });

  it('T-Profil: ⅓·(bf·hf³ + (h − hf/2)·bw³)', () => {
    const [bf, hf, bw, h] = [200, 20, 10, 200];
    const c = 0.1;
    const expected =
      (((bf * c) * (hf * c) ** 3 + (h - hf / 2) * c * (bw * c) ** 3) / 3) *
      CM4_TO_M4;

    expect(
      It({
        kind: 'shape',
        id: 't',
        shape: { kind: 't-section', bf, hf, bw, h, idealisation: 'thin-walled' },
      }),
    ).toBeCloseTo(expected, 15);
    expect(
      It({
        kind: 'shape',
        id: 't',
        shape: { kind: 't-section', bf, hf, bw, h, idealisation: 'solid' },
      }),
    ).toBeUndefined();
  });

  it('geschlossener Kasten: Bredt, und das sind Zehnerpotenzen mehr', () => {
    const [b, h, t] = [100, 200, 8];
    const c = 0.1;
    const [bc, hc, tc] = [b * c, h * c, t * c];
    const bredt =
      ((2 * tc * (bc - tc) ** 2 * (hc - tc) ** 2) / (bc - tc + (hc - tc))) *
      CM4_TO_M4;
    const open =
      ((2 * (bc - tc) * tc ** 3 + 2 * (hc - tc) * tc ** 3) / 3) * CM4_TO_M4;

    const closed = It({
      kind: 'shape',
      id: 'k',
      shape: { kind: 'hollow-rectangle', b, h, t, idealisation: 'thin-walled' },
    });
    expect(closed).toBeCloseTo(bredt, 15);
    // DER GRUND, warum `idealisation` bei `It` nicht geraten werden darf:
    // haette derselbe Kasten offen gerechnet, waere `It` bei diesem
    // Seitenverhaeltnis um Faktor 181 zu klein — und der Faktor waechst, je
    // duenner die Wand wird.
    expect((closed ?? 0) / open).toBeCloseTo(181.3, 1);
  });

  it('das Vollrechteck traegt keins — es ist ein Randwertproblem', () => {
    // Und ohne FE-Block bleibt es dabei: die Reihe fuer `k(b/h)·h·b³` steht
    // nirgends im Code, und sie soll dort auch nicht hin (ADR 0062).
    expect(
      It({ kind: 'shape', id: 'r', shape: { kind: 'rectangle', b: 200, h: 500 } }),
    ).toBeUndefined();
  });
});

describe('Der Schubmittelpunkt des duennwandigen T liegt in der Gurtmitte', () => {
  it('`zM = hf/2` — exakt, und nicht mehr `undefined`', () => {
    // Im duennwandigen Modell ist das T zweier Linien Schnittpunkt; jeder
    // Wandzug hat um ihn den Hebelarm 0, das Moment des Schubflusses also
    // ebenfalls. Bis P5 stand hier `undefined`, und Satz 4 des Gates feuerte
    // damit bei JEDEM T.
    const [bf, hf, bw, h] = [2000, 200, 250, 500];
    const thin = values({
      kind: 'shape',
      id: 't',
      shape: { kind: 't-section', bf, hf, bw, h, idealisation: 'thin-walled' },
    });

    expect(thin.zM).toBeCloseTo(hf / 2 / 1000, 15);
    expect(thin.yM).toBe(0);
    // Und er faellt NICHT mit dem Schwerpunkt zusammen — das ist der Punkt.
    expect(thin.zM).not.toBeCloseTo(thin.zs, 4);
  });

  it('kompakt bleibt er ohne FE-Block unermittelt', () => {
    // Nicht mehr `hf/2`: das war eine Aussage ueber ZWEI LINIEN. Der solide
    // Vollquerschnitt bekommt seinen Schubmittelpunkt nach Trefftz aus der FE
    // (ADR 0045/0062) — und bis der Block da ist, steht hier nichts.
    expect(
      values({
        kind: 'shape',
        id: 't',
        shape: {
          kind: 't-section',
          bf: 2000,
          hf: 200,
          bw: 250,
          h: 500,
          idealisation: 'solid',
        },
      }).zM,
    ).toBeUndefined();
  });
});

describe('Unsinnige Abmessungen liefern undefined statt NaN', () => {
  it('lehnt nicht-positive und widerspruechliche Masse ab', () => {
    expect(
      sectionProperties({
        kind: 'shape',
        id: 'x',
        shape: { kind: 'rectangle', b: 0, h: 500 },
      }),
    ).toBeUndefined();
    expect(
      sectionProperties({
        kind: 'shape',
        id: 'x',
        // Wandstaerke groesser als die halbe Hoehe: kein Hohlkasten.
        shape: {
          kind: 'hollow-rectangle',
          b: 60,
          h: 60,
          t: 30,
          idealisation: 'thin-walled',
        },
      }),
    ).toBeUndefined();
    expect(
      sectionProperties({
        kind: 'shape',
        id: 'x',
        // Flanschdicke groesser als die halbe Hoehe: kein I.
        shape: {
          kind: 'i-symmetric',
          h: 80,
          b: 46,
          tw: 3.8,
          tf: 40,
          idealisation: 'solid',
        },
      }),
    ).toBeUndefined();
    expect(
      sectionProperties({
        kind: 'shape',
        id: 'x',
        // Steg breiter als der Gurt: kein Plattenbalken.
        shape: {
          kind: 't-section',
          bf: 200,
          hf: 50,
          bw: 300,
          h: 500,
          idealisation: 'solid',
        },
      }),
    ).toBeUndefined();
  });
});
