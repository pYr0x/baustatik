import { lookupProfile, profileData, profilesIn } from '@baustatik/steel-profiles';
import { describe, expect, it } from 'vitest';
import {
  type CrossSection,
  sectionProperties,
  type ShapeSpec,
  type StressPoint,
  stressPoints,
} from '../src/index';
import { rolledIGeometry } from '../src/stress-points/rolled-i';
import fixture from './fixtures/rolled-i-stress-points.json';

type ReferencePoint = {
  nr: number;
  y: number;
  z: number;
  Sy: number;
  Sz: number;
  t: number;
};
const reference = (
  fixture as { profiles: Record<string, ReferencePoint[]> }
).profiles;

// KEINE UMRECHNUNG MEHR: `StressPoint` fuehrt Koordinaten in mm und `S` in
// cm3 — dieselben Einheiten, in denen die Fixture und der gedruckte Ausdruck
// stehen. Frueher standen hier zwei Faktoren, durch die JEDER Vergleich lief.

/**
 * DIE ZUORDNUNGSTABELLE — gedruckte Nummer (1…13) auf unsere (1…15).
 *
 * Seit [ADR 0059](../../../docs/adr/0059-the-stress-point-lies-on-a-wall-element.md)
 * traegt jeder Verzweigungsknoten ZWEI Punkte, einen je Gurtelement. Die
 * Nummerierung faellt damit aus der Laufreihenfolge und ist kein Vertrag mehr
 * gegenueber dem Katalogblatt. Die Zuordnung ist es, was von diesem Vertrag
 * uebrig bleibt, und sie steht deshalb im Test und nicht im `src`.
 *
 * An den beiden Knoten (gedruckt 3 und 8) faellt die Wahl auf das LINKE
 * Element. Das ist keine Konvention, sondern ein Befund: der Ausdruck druckt
 * dort `Sz = -1,38` bzw. `+1,38`, und das sind genau die Werte des linken
 * Elements. `Sy` ist an beiden Punkten des Knotens ohnehin gleich.
 *
 * KEINE VORZEICHENSPALTE. Die Elementkonvention trifft alle 13 gedruckten
 * Werte Zeichen fuer Zeichen; es gibt nichts zu drehen.
 */
const PRINTED_TO_OURS = [1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15] as const;

/** Der Punkt, den unsere Liste der gedruckten Nummer `printedNr` zuordnet. */
function forPrinted(
  pts: readonly StressPoint[],
  printedNr: number,
): StressPoint {
  const ours = PRINTED_TO_OURS[printedNr - 1];
  if (ours === undefined) throw new Error(`gedruckte Nr ${printedNr} gibt es nicht`);
  return pts[ours - 1];
}

function points(cs: CrossSection): readonly StressPoint[] {
  const result = stressPoints(cs);
  if (result === undefined) throw new Error('stressPoints lieferte undefined');
  return result;
}

const profile = (name: string): CrossSection => {
  const row = lookupProfile(name);
  if (row === undefined) throw new Error(`${name} fehlt im Katalog`);
  return { kind: 'profile', id: 'x', profile: row.id, data: profileData(row) };
};

describe('IPE 80 gegen den gedruckten Ausdruck', () => {
  const pts = points(profile('IPE 80'));

  it('liefert genau 15 Punkte auf fuenf Elementen', () => {
    // 13 gedruckte Stellen, aber zwei davon liegen auf einem
    // Verzweigungsknoten und tragen deshalb je zwei Punkte (ADR 0059).
    expect(pts).toHaveLength(15);
    expect(pts.map((p) => p.nr)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(pts.map((p) => p.wall)).toEqual([
      'flange-top-left',
      'flange-top-left',
      'flange-top-left',
      'flange-top-right',
      'flange-top-right',
      'flange-top-right',
      'flange-bottom-left',
      'flange-bottom-left',
      'flange-bottom-left',
      'flange-bottom-right',
      'flange-bottom-right',
      'flange-bottom-right',
      'web',
      'web',
      'web',
    ]);
  });

  it('setzt die Koordinaten auf die gedruckten Werte', () => {
    // y: Gurtspitze +-23 = +-b/2, Ausrundungsende +-6,9 = +-(tw/2 + r), Mitte 0
    //    — und die Mitte steht zweimal, einmal je Gurtelement.
    // z: Gurtaussenseite +-40 = +-h/2, Steganfang +-29,8 = +-(h/2 - tf - r),
    //    Schwerpunkt 0.
    expect(pts.map((p) => Number(p.y.toFixed(2)))).toEqual([
      -23, -6.9, 0, 0, 6.9, 23, -23, -6.9, 0, 0, 6.9, 23, 0, 0, 0,
    ]);
    expect(pts.map((p) => Number(p.z.toFixed(2)))).toEqual([
      -40, -40, -40, -40, -40, -40, 40, 40, 40, 40, 40, 40, -29.8, 29.8, 0,
    ]);
  });

  it('setzt die Dicken: Gurt 5,2 / Steg 3,8', () => {
    expect(pts.map((p) => Number(p.t.toFixed(2)))).toEqual([
      5.2, 5.2, 5.2, 5.2, 5.2, 5.2, 5.2, 5.2, 5.2, 5.2, 5.2, 5.2, 3.8, 3.8, 3.8,
    ]);
  });

  it('liefert S = 0 an den vier Gurtspitzen', () => {
    // Die Spitze ist der freie Rand: dort ist nichts abgeschnitten. An den
    // Obergurtspitzen BEGINNT das Element, an den Untergurtspitzen ENDET es —
    // und beide Male ist `S` dort null.
    for (const nr of [1, 6, 7, 12]) {
      expect(pts[nr - 1].Sy, `P${nr}.Sy`).toBe(0);
      expect(pts[nr - 1].Sz, `P${nr}.Sz`).toBe(0);
    }
  });

  it('trifft Sy am Steganfang (P13) mit 9,92 cm3', () => {
    // Der von Hand nachgerechnete Wert: Gurt (46*5,2 bei z = -37,4), beide
    // Ausrundungen und das Stegstueck bis z = -29,8.
    expect(Math.abs(pts[12].Sy)).toBeCloseTo(9.92, 2);
  });

  it('trifft Sy im Schwerpunkt (P15) mit 11,61 cm3 = SyMax', () => {
    expect(Math.abs(pts[14].Sy)).toBeCloseTo(11.61, 2);
  });

  it('stellt am Knoten zwei Punkte nebeneinander', () => {
    // DIE AUSSAGE VON ADR 0059, an der kleinsten moeglichen Stelle. Gleicher
    // Ort, gleiches `t`, gleiches `Sy` — und entgegengesetztes `Sz`, weil die
    // beiden Gurtelemente in entgegengesetzte Richtungen laufen. Bis dahin
    // stand hier EIN Punkt mit einem Flag und einem von zwei moeglichen Werten.
    for (const [left, right] of [
      [3, 4],
      [9, 10],
    ]) {
      const a = pts[left - 1];
      const b = pts[right - 1];
      expect([a.y, a.z], `P${left}/P${right} Ort`).toEqual([b.y, b.z]);
      expect(a.t).toBe(b.t);
      expect(a.wall).not.toBe(b.wall);
      expect(a.Sy, `P${left}/P${right}.Sy`).toBeCloseTo(b.Sy, 12);
      expect(a.Sz, `P${left}/P${right}.Sz`).toBeCloseTo(-b.Sz, 12);
      // Entgegengesetzte Tangenten, beide waagerecht. Welches der beiden
      // Elemente in `+y` laeuft, haengt vom Gurt ab: oben das linke, unten das
      // rechte — es ist die Richtung des Schubflusses aus `+Vz`.
      expect(Math.abs(a.ty), `P${left} Tangente`).toBe(1);
      expect(a.ty, `P${left}/P${right} Tangente`).toBe(-b.ty);
      expect([a.tz, b.tz]).toEqual([0, 0]);
    }
  });
});

describe('Die Nummerierung faellt aus der Laufreihenfolge', () => {
  // Sie ist kein Vertrag mehr gegenueber dem gedruckten Ausdruck (ADR 0059),
  // aber sie ist weiterhin die IDENTITAET eines Punktes: der Viewer baut seine
  // Symbol-Id daraus, das Demo sein `data-nr`. Deshalb steht hier, was von ihr
  // gilt.
  const pts = points(profile('IPE 300'));

  it('vergibt jede Nummer genau einmal', () => {
    expect(new Set(pts.map((p) => p.nr)).size).toBe(pts.length);
  });

  it('legt 1-6 auf den oberen Gurt, von links nach rechts', () => {
    const top = pts.slice(0, 6);
    expect(top.every((p) => p.z < 0)).toBe(true);
    expect(top.map((p) => p.y)).toEqual(
      [...top.map((p) => p.y)].sort((a, b) => a - b),
    );
    expect(top[0].y).toBeLessThan(0);
    expect(top[5].y).toBeGreaterThan(0);
    // Die beiden Knotenpunkte in der Mitte, das linke Element zuerst.
    expect([top[2].y, top[3].y]).toEqual([0, 0]);
    expect(top[2].wall).toBe('flange-top-left');
    expect(top[3].wall).toBe('flange-top-right');
  });

  it('legt 7-12 auf den unteren Gurt, ebenso von links nach rechts', () => {
    const bottom = pts.slice(6, 12);
    expect(bottom.every((p) => p.z > 0)).toBe(true);
    expect(bottom.map((p) => p.y)).toEqual(
      [...bottom.map((p) => p.y)].sort((a, b) => a - b),
    );
  });

  it('legt 13/14 auf den Steganfang und 15 auf den Schwerpunkt', () => {
    expect(pts[12].z).toBeLessThan(0);
    expect(pts[13].z).toBeGreaterThan(0);
    expect(pts[12].z).toBe(-pts[13].z);
    expect(pts[14].y).toBe(0);
    expect(pts[14].z).toBe(0);
  });

  it('laesst die Gurtunterseiten-Ecken aus — die begruendete Ausnahme', () => {
    // Bei homogenem Querschnitt koennen sie nie massgebend werden: gleiches y,
    // kleineres |z| als die Gurtspitze darueber.
    const zValues = new Set(pts.map((p) => Number(p.z.toFixed(6))));
    expect(zValues.size).toBe(5); // +-h/2, +-Steganfang, 0
  });
});

describe('Die 546 Referenzpunkte', () => {
  // Alle 13 gedruckten Punkte von 42 Profilen, ueber `PRINTED_TO_OURS`
  // zugeordnet. Verglichen werden y, z, t, Sy und Sz.
  //
  // TOLERANZEN, und warum sie so und nicht enger sind:
  //
  //   Koordinaten und Dicken: 0,05 mm ABSOLUT. Die Quelle druckt eine
  //   Nachkommastelle in mm; `tw/2 + r` ist bei ungeradem `tw` aber ein
  //   Vielfaches von 0,05. Eine relative Toleranz waere an y = 0 sinnlos.
  //
  //   Sy und Sz: 0,7 % relativ plus eine absolute Schwelle. Die Quelle ist
  //   in sich nicht symmetrisch — IPE 220 druckt an den beiden Steganfaengen
  //   119,44 und 119,73 (+-0,12 %), obwohl die Punkte spiegelbildlich liegen.
  //   Die Referenz widerspricht ausserdem SICH SELBST: ihr Spannungspunkt 13 und
  //   ihr tabelliertes `Sy,max` gehen bei HEA 260 um 0,56 % auseinander.
  //   Unsere Rechnung trifft `Sy,max` auf 0,05 % — siehe den Selbstcheck
  //   weiter unten. Die 0,7 % sind die Spanne dieser Widersprueche, nicht
  //   unsere Unsicherheit.
  const RELATIVE = 0.007;
  /** cm3 — unterhalb davon ist eine relative Toleranz sinnlos (P1: Sy = 0). */
  const ABSOLUTE = 0.02;

  it('vergleicht Koordinaten und Dicken', () => {
    for (const series of ['IPE', 'HEA'] as const) {
      for (const p of profilesIn(series)) {
        const mine = points(profile(p.id));
        const theirs = reference[p.id];
        expect(mine, p.id).toHaveLength(15);
        expect(theirs, p.id).toHaveLength(13);
        for (const r of theirs) {
          const ours = forPrinted(mine, r.nr);
          for (const key of ['y', 'z', 't'] as const) {
            // 0,06 mm und nicht 0,05: die halbe Druckgenauigkeit IST 0,05, und
            // `tw/2 + r` faellt bei ungeradem `tw` genau darauf (IPE 100:
            // 9,05 gedruckt als 9,1). Eine Schwelle exakt auf dem Rand
            // entscheidet der Gleitkommazufall.
            expect(
              Math.abs(ours[key] - r[key]),
              `${p.id} P${r.nr}.${key}: ${ours[key]} vs ${r[key]}`,
            ).toBeLessThan(0.06);
          }
        }
      }
    }
  });

  it('stimmt an allen 13 gedruckten Werten Zeichen fuer Zeichen', () => {
    // DER TEST, DER DIE KEHRTWENDE TRAEGT. Bis ADR 0059 stand hier das
    // Gegenteil: eine Liste der drei Punkte (4, 7, 8), an denen wir vom
    // Ausdruck abwichen, mit der Begruendung, seine Konvention widerspreche
    // sich selbst.
    //
    // Sie tut es nicht. Sie ist je ELEMENT geschrieben, nicht je Querschnitt —
    // und die drei Abweichler waren exakt die Stellen, deren Element anders
    // orientiert ist als das globale `+y`, das die alte Fassung fuehrte.
    // Seit jede Wand ihre eigene Richtung traegt, ist die Liste leer.
    for (const series of ['IPE', 'HEA'] as const) {
      for (const p of profilesIn(series)) {
        const mine = points(profile(p.id));
        const differing = reference[p.id]
          .filter((r) => {
            const ours = forPrinted(mine, r.nr);
            return (
              (r.Sy !== 0 && Math.sign(r.Sy) !== Math.sign(ours.Sy)) ||
              (r.Sz !== 0 && Math.sign(r.Sz) !== Math.sign(ours.Sz))
            );
          })
          .map((r) => r.nr);
        expect(differing, p.id).toEqual([]);
      }
    }
  });

  it('vergleicht Sy und Sz mit Vorzeichen', () => {
    // MIT VORZEICHEN, und das ist seit ADR 0059 moeglich: die Elementkonvention
    // ist die des Ausdrucks, es gibt also nichts mehr wegzubetragen.
    //
    // Die gedruckten Punkte 3 und 8 sind ausgenommen und haben ihren eigenen
    // Test: dort weicht die Referenz im BETRAG systematisch und unerklaert ab
    // (das Vorzeichen prueft der Test darueber, ohne Ausnahme).
    for (const series of ['IPE', 'HEA'] as const) {
      for (const p of profilesIn(series)) {
        const mine = points(profile(p.id));
        for (const r of reference[p.id]) {
          if (r.nr === 3 || r.nr === 8) continue;
          const ours = forPrinted(mine, r.nr);
          for (const key of ['Sy', 'Sz'] as const) {
            expect(
              Math.abs(ours[key] - r[key]) <= ABSOLUTE + RELATIVE * Math.abs(r[key]),
              `${p.id} P${r.nr}.${key}: ${ours[key].toFixed(3)} vs ${r[key]}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('haelt die Abweichung an den gedruckten Punkten 3 und 8 fest', () => {
    // EIN BEKANNTER, NICHT ERKLAERTER UNTERSCHIED. Unser Wert ist das erste
    // Flaechenmoment des halben Gurts, `b/2 * tf * (h-tf)/2` — die geschlossene
    // Formel, die an den gedruckten Punkten 2 und 4 auf 0,45 % genau stimmt und
    // aus derselben Integration faellt, die `A`, `Iy` und `Sy,max` des ganzen
    // Katalogs trifft. Die Referenz druckt an genau diesen beiden Punkten etwas
    // anderes, bis zu 2,8 % daneben, ohne dass sich aus den Daten eine
    // Definition ablesen liesse (der Unterschied ist weder ein fester Anteil
    // der Ausrundung noch eine Funktion von r/tf).
    //
    // Der Test ist eine CHARAKTERISIERUNG, kein Nachweis: er haelt die Spanne
    // fest, damit ein spaeterer Erklaerungsversuch merkt, wenn er sie aendert.
    let worst = 0;
    for (const series of ['IPE', 'HEA'] as const) {
      for (const p of profilesIn(series)) {
        const mine = points(profile(p.id));
        for (const printedNr of [3, 8]) {
          const a = Math.abs(forPrinted(mine, printedNr).Sy);
          const b = Math.abs(reference[p.id][printedNr - 1].Sy);
          worst = Math.max(worst, Math.abs(a - b) / b);
        }
        // Die geschlossene Formel, unabhaengig nachgerechnet.
        // Die Formel rechnet in mm3, `Sy` steht in cm3.
        const halfFlange = ((p.b / 2) * p.tf * (p.h - p.tf)) / 2 / 1000;
        expect(Math.abs(forPrinted(mine, 3).Sy), p.id).toBeCloseTo(halfFlange, 6);
      }
    }
    expect(worst).toBeLessThan(0.03);
    expect(worst).toBeGreaterThan(0.02);
  });
});

describe('Selbstcheck ueber den ganzen Katalog', () => {
  it('trifft mit Sy(P15) den Tabellenwert SyMax', () => {
    // Der Prueffstein fuer die Ausrundungs-Integration: `Sy,max` ist keine
    // Groesse, die wir irgendwo abgeschrieben haetten — sie steht in der
    // Tabelle, und `2*Sy,max = Wpl,y` (in `steel-profiles` geprueft) belegt
    // unabhaengig, dass die Tabelle sich selbst treu ist.
    for (const series of ['IPE', 'HEA'] as const) {
      for (const p of profilesIn(series)) {
        const pts = points(profile(p.id));
        const Sy = Math.abs(pts[14].Sy);
        expect(
          Math.abs(Sy - p.SyMax) / p.SyMax,
          `${p.id}: ${Sy.toFixed(3)} vs ${p.SyMax}`,
        ).toBeLessThan(0.0005);
      }
    }
  });

  it('trifft mit Sz am Knoten den Tabellenwert SzMax', () => {
    // `Sz,max` sitzt in GURTMITTE, nicht im Schwerpunkt: der Wandschubfluss
    // fuer Vy laeuft durch die Gurte, und in der Mitte ist eine halbe
    // Gurtflaeche abgeschnitten. Die drei Stegpunkte haben `Sz = 0`.
    //
    // Die beiden Knotenpunkte tragen denselben BETRAG mit
    // entgegengesetztem Vorzeichen — `Sz,max` ist damit einwertig, obwohl der
    // Knoten zweiwertig ist.
    for (const series of ['IPE', 'HEA'] as const) {
      for (const p of profilesIn(series)) {
        const pts = points(profile(p.id));
        for (const nr of [3, 4]) {
          const Sz = Math.abs(pts[nr - 1].Sz);
          expect(
            Math.abs(Sz - p.SzMax) / p.SzMax,
            `${p.id} P${nr}: ${Sz.toFixed(3)} vs ${p.SzMax}`,
          ).toBeLessThan(0.004);
        }
      }
    }
  });
});

describe('Die Integration reproduziert den Katalog', () => {
  // DER EIGENTLICHE BELEG, dass die Ausrundung richtig sitzt: `A` und `Iy`,
  // gerechnet aus `h, b, tw, tf, r`, gegen die Tabelle. Ohne diesen Test
  // waeren die Spannungspunkte eine Behauptung.
  it('trifft A und Iy jedes Profils auf 0,2 %', () => {
    for (const series of ['IPE', 'HEA'] as const) {
      for (const p of profilesIn(series)) {
        const g = rolledIGeometry({
          h: p.h,
          b: p.b,
          tw: p.tw,
          tf: p.tf,
          r: p.r,
        });
        expect(
          Math.abs(g.A / 100 - p.A) / p.A,
          `${p.id}: A ${(g.A / 100).toFixed(3)} vs ${p.A}`,
        ).toBeLessThan(0.002);
        expect(
          Math.abs(g.Iy / 1e4 - p.Iy) / p.Iy,
          `${p.id}: Iy ${(g.Iy / 1e4).toFixed(2)} vs ${p.Iy}`,
        ).toBeLessThan(0.002);
      }
    }
  });

  it('rechnet IPE 80 von Hand nach', () => {
    // A = 2*46*5,2 + 69,6*3,8 + (4-pi)*25 = 764,3 mm2 = 7,643 cm2 (Tabelle 7,64)
    // Iy = 80,14 cm4 (Tabelle 80,14)
    const g = rolledIGeometry({ h: 80, b: 46, tw: 3.8, tf: 5.2, r: 5 });
    expect(g.A / 100).toBeCloseTo(7.643, 3);
    expect(g.Iy / 1e4).toBeCloseTo(80.14, 2);
  });
});

describe('Der Vollquerschnitt traegt gar keine Spannungspunkte', () => {
  // ADR 0057: `t` und `S` sind der Nenner eines SCHNITTMODELLS. Der
  // Vollquerschnitt hat keins — seine Spannungen kommen aus der FE. Bis dahin
  // ist `undefined` die ehrliche Antwort, und nicht eine Grashof-Zahl, die
  // aussieht, als waere sie geprueft.
  const solidShapes = [
    ['Vollrechteck', { kind: 'rectangle', b: 200, h: 500 }],
    [
      'Plattenbalken',
      {
        kind: 't-section',
        bf: 500,
        hf: 150,
        bw: 250,
        h: 600,
        idealisation: 'solid',
      },
    ],
    [
      'geschweisstes I',
      {
        kind: 'i-symmetric',
        h: 300,
        b: 150,
        tw: 7.1,
        tf: 10.7,
        idealisation: 'solid',
      },
    ],
    [
      'Kasten',
      { kind: 'hollow-rectangle', b: 200, h: 400, t: 10, idealisation: 'solid' },
    ],
  ] as const satisfies readonly (readonly [string, ShapeSpec])[];

  for (const [name, shape] of solidShapes) {
    it(`liefert fuer ${name} undefined`, () => {
      expect(stressPoints({ kind: 'shape', id: 's', shape })).toBeUndefined();
    });
  }

  it('laesst die Werte der Umrissfigur davon unberuehrt', () => {
    // Die Werte der Figur bleiben, was sie waren — sie sind geschlossene
    // Formel und brauchen keinen Lauf. Was seit
    // [ADR 0062](../../../docs/adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md)
    // NICHT mehr danebensteht, ist kappa: der solide Vollquerschnitt hat
    // keinen Schubflussweg mehr, und ohne aufgeloesten FE-Block ist er
    // schubstarr. Bis dahin stand hier 5/6 aus Grashof.
    const cs: CrossSection = {
      kind: 'shape',
      id: 'r',
      shape: { kind: 'rectangle', b: 200, h: 500 },
    };
    const props = sectionProperties(cs);
    expect(props?.A).toBeCloseTo(0.1, 12);
    expect(props?.Iy).toBeCloseTo(2.0833333e-3, 9);
    expect(props?.kappaZ).toBeUndefined();
  });

  it('haelt den duennwandigen Zweig offen', () => {
    // Die Gegenprobe zum Satz oben: dieselbe Form, andere Idealisierung.
    const pts = stressPoints({
      kind: 'shape',
      id: 'i',
      shape: {
        kind: 'i-symmetric',
        h: 300,
        b: 150,
        tw: 7.1,
        tf: 10.7,
        idealisation: 'thin-walled',
      },
    });
    expect(pts).toHaveLength(15);
  });
});

describe('Was undefined heisst', () => {
  // „Der geschlossene Kasten" stand hier, solange ihm die Referenzdaten
  // fehlten. Er hat sie jetzt (TO 300/200/10) — siehe
  // `stress-points-hollow.test.ts`.

  // „Unbekanntes Profil" steht hier nicht mehr: seit ADR 0027 traegt der Satz
  // die Zeile, der Profilzweig ist also total. Der Tippfehler wird beim
  // ANLEGEN gemeldet — siehe `@baustatik/script`, `builder.test.ts`.
  it('meldet unsinnige Masse', () => {
    // Die Gueltigkeitspruefung steht VOR der Weiche auf die Idealisierung,
    // also traegt sie auch der duennwandige Zweig.
    expect(
      stressPoints({
        kind: 'shape',
        id: 'i',
        shape: {
          kind: 'i-symmetric',
          h: 20,
          b: 150,
          tw: 7,
          tf: 20,
          idealisation: 'thin-walled',
        },
      }),
    ).toBeUndefined();
    expect(
      stressPoints({
        kind: 'shape',
        id: 't',
        shape: {
          kind: 't-section',
          bf: 200,
          hf: 50,
          bw: 300,
          h: 500,
          idealisation: 'thin-walled',
        },
      }),
    ).toBeUndefined();
  });
});
