import { profilesIn } from '@baustatik/steel-profiles';
import { describe, expect, it } from 'vitest';
import { type CrossSection, type StressPoint, stressPoints } from '../src/index';
import { rolledIGeometry } from '../src/stress-points/rolled-i';
import fixture from './fixtures/rstab-stress-points.json';

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

function points(cs: CrossSection): readonly StressPoint[] {
  const result = stressPoints(cs);
  if (result === undefined) throw new Error('stressPoints lieferte undefined');
  return result;
}

const profile = (name: string): CrossSection => ({
  kind: 'profile',
  id: 'x',
  profile: name,
});

describe('IPE 80 gegen den gedruckten Ausdruck', () => {
  const pts = points(profile('IPE 80'));

  it('liefert genau 13 Punkte', () => {
    expect(pts).toHaveLength(13);
    expect(pts.map((p) => p.nr)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
  });

  it('setzt die Koordinaten auf die gedruckten Werte', () => {
    // y: Gurtspitze +-23 = +-b/2, Ausrundungsende +-6,9 = +-(tw/2 + r), Mitte 0.
    // z: Gurtaussenseite +-40 = +-h/2, Steganfang +-29,8 = +-(h/2 - tf - r),
    //    Schwerpunkt 0.
    expect(pts.map((p) => Number((p.y).toFixed(2)))).toEqual([
      -23, -6.9, 0, 6.9, 23, -23, -6.9, 0, 6.9, 23, 0, 0, 0,
    ]);
    expect(pts.map((p) => Number((p.z).toFixed(2)))).toEqual([
      -40, -40, -40, -40, -40, 40, 40, 40, 40, 40, -29.8, 29.8, 0,
    ]);
  });

  it('setzt die Dicken: Gurt 5,2 / Steg 3,8', () => {
    expect(pts.map((p) => Number((p.t).toFixed(2)))).toEqual([
      5.2, 5.2, 5.2, 5.2, 5.2, 5.2, 5.2, 5.2, 5.2, 5.2, 3.8, 3.8, 3.8,
    ]);
  });

  it('liefert S = 0 an den vier Gurtspitzen', () => {
    // Die Spitze ist der freie Rand: dort ist nichts abgeschnitten.
    for (const nr of [1, 5, 6, 10]) {
      expect(pts[nr - 1].Sy, `P${nr}.Sy`).toBe(0);
      expect(pts[nr - 1].Sz, `P${nr}.Sz`).toBe(0);
    }
  });

  it('trifft Sy am Steganfang (P11) mit 9,92 cm3', () => {
    // Der von Hand nachgerechnete Wert: Gurt (46*5,2 bei z = -37,4), beide
    // Ausrundungen und das Stegstueck bis z = -29,8.
    expect(Math.abs(pts[10].Sy)).toBeCloseTo(9.92, 2);
  });

  it('trifft Sy im Schwerpunkt (P13) mit 11,61 cm3 = SyMax', () => {
    expect(Math.abs(pts[12].Sy)).toBeCloseTo(11.61, 2);
  });
});

describe('Die Nummerierung ist ein Vertrag', () => {
  // RSTAB druckt „S-Punkt Nr. 1…13". Der Test haelt fest, WELCHE Nummer WO
  // sitzt — bevor der erste Bericht sie druckt und die Zuordnung damit nach
  // draussen gegeben ist.
  const pts = points(profile('IPE 300'));

  it('legt 1-5 auf den oberen Gurt, von links nach rechts', () => {
    const top = pts.slice(0, 5);
    expect(top.every((p) => p.z < 0)).toBe(true);
    expect(top.map((p) => p.y)).toEqual([...top.map((p) => p.y)].sort((a, b) => a - b));
    expect(top[0].y).toBeLessThan(0);
    expect(top[4].y).toBeGreaterThan(0);
    expect(top[2].y).toBe(0);
  });

  it('legt 6-10 auf den unteren Gurt, ebenso von links nach rechts', () => {
    const bottom = pts.slice(5, 10);
    expect(bottom.every((p) => p.z > 0)).toBe(true);
    expect(bottom.map((p) => p.y)).toEqual([
      ...bottom.map((p) => p.y),
    ].sort((a, b) => a - b));
  });

  it('legt 11/12 auf den Steganfang und 13 auf den Schwerpunkt', () => {
    expect(pts[10].z).toBeLessThan(0);
    expect(pts[11].z).toBeGreaterThan(0);
    expect(pts[10].z).toBe(-pts[11].z);
    expect(pts[12].y).toBe(0);
    expect(pts[12].z).toBe(0);
  });

  it('laesst die Gurtunterseiten-Ecken aus — die begruendete Ausnahme', () => {
    // Bei homogenem Querschnitt koennen sie nie massgebend werden: gleiches y,
    // kleineres |z| als die Gurtspitze darueber. Deshalb 13 Punkte und nicht
    // 15 wie beim geschweissten I.
    const zValues = new Set(pts.map((p) => Number(p.z.toFixed(6))));
    expect(zValues.size).toBe(5); // +-h/2, +-Steganfang, 0
  });
});

describe('Die 546 Referenzpunkte', () => {
  // Alle 13 Punkte von 42 Profilen. Verglichen werden y, z, t, Sy und Sz.
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
  //   RSTAB widerspricht ausserdem SICH SELBST: sein Spannungspunkt 13 und
  //   sein tabelliertes `Sy,max` gehen bei HEA 260 um 0,56 % auseinander.
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
        expect(mine, p.id).toHaveLength(theirs.length);
        for (let i = 0; i < theirs.length; i++) {
          for (const key of ['y', 'z', 't'] as const) {
            // 0,06 mm und nicht 0,05: die halbe Druckgenauigkeit IST 0,05, und
            // `tw/2 + r` faellt bei ungeradem `tw` genau darauf (IPE 100:
            // 9,05 gedruckt als 9,1). Eine Schwelle exakt auf dem Rand
            // entscheidet der Gleitkommazufall.
            expect(
              Math.abs(mine[i][key] - theirs[i][key]),
              `${p.id} P${i + 1}.${key}: ${mine[i][key]} vs ${theirs[i][key]}`,
            ).toBeLessThan(0.06);
          }
        }
      }
    }
  });

  it('vergleicht Sy und Sz', () => {
    // Punkt 3 und 8 sind ausgenommen und haben ihren eigenen Test: dort weicht
    // RSTAB systematisch und unerklaert ab.
    for (const series of ['IPE', 'HEA'] as const) {
      for (const p of profilesIn(series)) {
        const mine = points(profile(p.id));
        const theirs = reference[p.id];
        for (let i = 0; i < theirs.length; i++) {
          if (i === 2 || i === 7) continue;
          for (const key of ['Sy', 'Sz'] as const) {
            const a = mine[i][key];
            const b = theirs[i][key];
            expect(
              Math.abs(a - b) <= ABSOLUTE + RELATIVE * Math.abs(b),
              `${p.id} P${i + 1}.${key}: ${a.toFixed(3)} vs ${b}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('haelt die Abweichung an den Punkten 3 und 8 fest', () => {
    // EIN BEKANNTER, NICHT ERKLAERTER UNTERSCHIED. Unser Wert ist das erste
    // Flaechenmoment des halben Gurts, `b/2 * tf * (h-tf)/2` — die geschlossene
    // Formel, die an Punkt 2 und 4 auf 0,45 % genau stimmt und aus derselben
    // Integration faellt, die `A`, `Iy` und `Sy,max` des ganzen Katalogs
    // trifft. RSTAB druckt an genau diesen beiden Punkten etwas anderes, bis
    // zu 2,8 % daneben, ohne dass sich aus den Daten eine Definition ablesen
    // liesse (der Unterschied ist weder ein fester Anteil der Ausrundung noch
    // eine Funktion von r/tf).
    //
    // Der Test ist eine CHARAKTERISIERUNG, kein Nachweis: er haelt die Spanne
    // fest, damit ein spaeterer Erklaerungsversuch merkt, wenn er sie aendert.
    let worst = 0;
    for (const series of ['IPE', 'HEA'] as const) {
      for (const p of profilesIn(series)) {
        const mine = points(profile(p.id));
        const theirs = reference[p.id];
        for (const i of [2, 7]) {
          const a = mine[i].Sy;
          const b = theirs[i].Sy;
          worst = Math.max(worst, Math.abs(a - b) / Math.abs(b));
        }
        // Die geschlossene Formel, unabhaengig nachgerechnet.
        // Die Formel rechnet in mm3, `Sy` steht in cm3.
        const halfFlange = ((p.b / 2) * p.tf * (p.h - p.tf)) / 2 / 1000;
        expect(Math.abs(mine[2].Sy), p.id).toBeCloseTo(halfFlange, 6);
      }
    }
    expect(worst).toBeLessThan(0.03);
    expect(worst).toBeGreaterThan(0.02);
  });
});

describe('Selbstcheck ueber den ganzen Katalog', () => {
  it('trifft mit Sy(P13) den Tabellenwert SyMax', () => {
    // Der Prueffstein fuer die Ausrundungs-Integration: `Sy,max` ist keine
    // Groesse, die wir irgendwo abgeschrieben haetten — sie steht in der
    // Tabelle, und `2*Sy,max = Wpl,y` (in `steel-profiles` geprueft) belegt
    // unabhaengig, dass die Tabelle sich selbst treu ist.
    for (const series of ['IPE', 'HEA'] as const) {
      for (const p of profilesIn(series)) {
        const pts = points(profile(p.id));
        const Sy = Math.abs(pts[12].Sy);
        expect(
          Math.abs(Sy - p.SyMax) / p.SyMax,
          `${p.id}: ${Sy.toFixed(3)} vs ${p.SyMax}`,
        ).toBeLessThan(0.0005);
      }
    }
  });

  it('trifft mit Sz(P3) den Tabellenwert SzMax', () => {
    // `Sz,max` sitzt in GURTMITTE, nicht im Schwerpunkt: der Wandschubfluss
    // fuer Vy laeuft durch die Gurte, und in der Mitte ist eine halbe
    // Gurtflaeche abgeschnitten. Punkt 13 hat `Sz = 0`.
    for (const series of ['IPE', 'HEA'] as const) {
      for (const p of profilesIn(series)) {
        const pts = points(profile(p.id));
        const Sz = Math.abs(pts[2].Sz);
        expect(
          Math.abs(Sz - p.SzMax) / p.SzMax,
          `${p.id}: ${Sz.toFixed(3)} vs ${p.SzMax}`,
        ).toBeLessThan(0.004);
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

describe('Die Vorlage-Regel: alle Ecken und der Schwerpunkt', () => {
  it('gibt dem Rechteck 5 Punkte, mit dem Maximum auf halber Hoehe', () => {
    const pts = points({
      kind: 'shape',
      id: 'r',
      shape: { kind: 'rectangle', b: 200, h: 500 },
    });
    expect(pts).toHaveLength(5);
    // Vier Ecken allein haetten ueberall S = 0 — deshalb steht der Schwerpunkt
    // in der Regel.
    for (const i of [0, 1, 2, 3]) expect(pts[i].Sy).toBeCloseTo(0, 12);
    // b*h^2/8 in mm3, umgerechnet auf die cm3 von `Sy`.
    expect(Math.abs(pts[4].Sy)).toBeCloseTo((200 * 500 ** 2) / 8 / 1000, 9);
    expect(Math.abs(pts[4].Sz)).toBeCloseTo((500 * 200 ** 2) / 8 / 1000, 9);
    expect(pts[4].t).toBeCloseTo(200, 12);
  });

  it('gibt dem Plattenbalken 9 Punkte', () => {
    const pts = points({
      kind: 'shape',
      id: 't',
      shape: {
        kind: 't-beam',
        bf: 500,
        hf: 150,
        bw: 250,
        h: 600,
        idealisation: 'solid',
      },
    });
    expect(pts).toHaveLength(9);
  });

  it('gibt dem geschweissten I 15 Punkte', () => {
    const pts = points({
      kind: 'shape',
      id: 'i',
      shape: {
        kind: 'i-symmetric',
        h: 300,
        b: 150,
        tw: 7.1,
        tf: 10.7,
        idealisation: 'solid',
      },
    });
    expect(pts).toHaveLength(15);
    // 12 Ecken + Schwerpunkt + die beiden Punkte auf der Stegachse (0, +-h/2),
    // die das gewalzte Profil nicht hat.
    expect(pts.filter((p) => p.y === 0)).toHaveLength(3);
  });

  it('setzt beim breiten Gurt t = bf am Schwerpunkt', () => {
    // DER TEST, DER „MITTE STEG" VON „SCHWERPUNKT" TRENNT: bei
    // bf=2000 / hf=200 / bw=250 / h=500 mm liegt zs = 139,5 mm und damit IM GURT.
    // Der Schwerpunktpunkt sieht dort die Gurtbreite, nicht die Stegbreite.
    const pts = points({
      kind: 'shape',
      id: 't',
      shape: {
        kind: 't-beam',
        bf: 2000,
        hf: 200,
        bw: 250,
        h: 500,
        idealisation: 'solid',
      },
    });
    const centroid = pts[8];
    expect(centroid.y).toBe(0);
    expect(centroid.z).toBe(0);
    expect(centroid.t).toBeCloseTo(2000, 12);
    // Und die Gurtunterkante, wo die Breite auf bw springt: dort gilt die
    // KLEINERE Breite, weil die Schubspannung dort nach oben springt.
    expect(pts[3].t).toBeCloseTo(250, 12);
  });

  it('liefert an jedem freien Rand S = 0', () => {
    // Selbstpruefung der Bandmaschine: am oberen Rand ist nichts abgeschnitten,
    // am unteren alles — und das erste Flaechenmoment des GANZEN Querschnitts
    // um seinen Schwerpunkt ist null.
    const pts = points({
      kind: 'shape',
      id: 't',
      shape: {
        kind: 't-beam',
        bf: 500,
        hf: 150,
        bw: 250,
        h: 600,
        idealisation: 'solid',
      },
    });
    expect(pts[0].Sy).toBeCloseTo(0, 12); // Gurtoberkante
    expect(pts[6].Sy).toBeCloseTo(0, 12); // Stegunterkante
    expect(pts[0].Sz).toBeCloseTo(0, 12); // linker Rand
    expect(pts[1].Sz).toBeCloseTo(0, 12); // rechter Rand
  });
});

describe('Was undefined heisst', () => {
  it('hat fuer den geschlossenen Kasten (noch) keine Vorlage', () => {
    // Eine Vorlage ohne Referenzdaten waere geraten und nicht gerechnet. Der
    // Kasten kommt mit den QRO-Daten, die ausserdem Bogentangenten mitbringen.
    expect(
      stressPoints({
        kind: 'shape',
        id: 'b',
        shape: {
          kind: 'hollow-rectangle',
          b: 60,
          h: 60,
          t: 6.3,
          idealisation: 'thin-walled',
        },
      }),
    ).toBeUndefined();
  });

  it('meldet ein unbekanntes Profil und unsinnige Masse', () => {
    expect(stressPoints(profile('IPE 201'))).toBeUndefined();
    expect(
      stressPoints({
        kind: 'shape',
        id: 'r',
        shape: { kind: 'rectangle', b: 0, h: 500 },
      }),
    ).toBeUndefined();
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
          idealisation: 'solid',
        },
      }),
    ).toBeUndefined();
    expect(
      stressPoints({
        kind: 'shape',
        id: 't',
        shape: {
          kind: 't-beam',
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
