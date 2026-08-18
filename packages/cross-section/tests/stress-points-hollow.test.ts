import { describe, expect, it } from 'vitest';
import { type CrossSection, type StressPoint, stressPoints } from '../src/index';
import { hollowRectanglePoints } from '../src/stress-points/compact';
import { hollowRectangleThinPoints } from '../src/stress-points/thin';
import fixture from './fixtures/hollow-rectangle-stress-points.json';

/**
 * DIE REFERENZ DES GESCHLOSSENEN KASTENS: die Dialoge zu
 * TO 300/200/10 und TO 400/200/10.
 *
 * Genau diese Daten haben bis zuletzt gefehlt. ADR 0029 hatte den Kasten nicht
 * aus Mangel an Theorie auf `undefined` gelassen — den umlaufenden Weg hat
 * `closedBoxPath` seit jeher — sondern weil eine Vorlage ohne Referenz geraten
 * und nicht gerechnet ist.
 *
 * ZWEI Querschnitte, und das ist kein Luxus: eine Vorlage, die nur an ihrem
 * eigenen Referenzfall stimmt, ist angepasst und nicht gerechnet. Die beiden
 * unterscheiden sich allein in der Hoehe, was Gurt- und Steganteil im Umlauf
 * gegeneinander verschiebt — und der Gurt liefert am 400er einen groesseren
 * Anteil von `Sy,max` als am 300er.
 */
const SECTIONS = Object.entries(fixture.sections);

/** Der Querschnitt, an dem die ausfuehrlichen Einzelbefunde haengen. */
const [, TO_REF] = SECTIONS[0];
const REF = TO_REF.points;
const TO = { b: TO_REF.b, h: TO_REF.h, t: TO_REF.t } as const;

const box = (
  idealisation: 'solid' | 'thin-walled',
  dims: { b: number; h: number; t: number } = TO,
): CrossSection => ({
  kind: 'shape',
  id: 'to',
  shape: { kind: 'hollow-rectangle', ...dims, idealisation },
});

function points(cs: CrossSection): readonly StressPoint[] {
  const result = stressPoints(cs);
  if (result === undefined) throw new Error('stressPoints lieferte undefined');
  return result;
}

describe('Der Umlauf: 16 Stellen, und wo sie liegen', () => {
  // Die Stellen gehoeren dem KASTEN, nicht der Idealisierung — deshalb steht
  // dieser Block einmal und prueft beide Zweige.
  for (const idealisation of ['solid', 'thin-walled'] as const) {
    describe(idealisation, () => {
      const pts = points(box(idealisation));

      it('liefert 16 Punkte in der Referenz-Nummerierung', () => {
        expect(pts).toHaveLength(16);
        expect(pts.map((p) => p.nr)).toEqual(REF.map((r) => r.nr));
      });

      it('trifft die gedruckten Koordinaten exakt', () => {
        expect(pts.map((p) => p.y)).toEqual(REF.map((r) => r.y));
        expect(pts.map((p) => p.z)).toEqual(REF.map((r) => r.z));
      });

      it('setzt die vier Wandmitten an die Stelle des Schwerpunkts', () => {
        // DIE ABWANDLUNG DER PACKAGE-REGEL. „Alle Ecken und der Schwerpunkt"
        // ginge hier ins Leere: der Schwerpunkt des Kastens liegt im LOCH.
        // Punkt 4/12 sind Gurtmitte, 8/16 Stegmitte — dort sitzt S,max.
        expect([pts[3], pts[11]].map((p) => [p.y, p.z])).toEqual([
          [0, -150],
          [0, 150],
        ]);
        expect([pts[7], pts[15]].map((p) => [p.y, p.z])).toEqual([
          [-100, 0],
          [100, 0],
        ]);
      });

      it('enthaelt die vier Aussenecken der Umrissfigur', () => {
        const corners = [pts[1], pts[5], pts[9], pts[13]].map((p) => [
          p.y,
          p.z,
        ]);
        expect(corners).toEqual([
          [100, -150],
          [-100, -150],
          [-100, 150],
          [100, 150],
        ]);
      });
    });
  }
});

describe('Das Wandmodell gegen den gedruckten Ausdruck', () => {
  const pts = points(box('thin-walled'));

  it.each(SECTIONS)('trifft an %s alle 32 Betraege auf 0,1 %%', (_name, ref) => {
    const all = points(box('thin-walled', ref));
    for (const [i, r] of ref.points.entries()) {
      const p = all[i];
      expect([p.y, p.z], `P${r.nr} Koordinate`).toEqual([r.y, r.z]);
      expect(p.t, `P${r.nr}.t`).toBe(r.t);
      for (const key of ['Sy', 'Sz'] as const) {
        const theirs = Math.abs(r[key]);
        const mine = Math.abs(p[key]);
        if (theirs === 0) {
          // Kein relativer Vergleich gegen null: der Symmetrieschnitt muss
          // EXAKT aufgehen, nicht nur beinahe.
          expect(mine, `P${r.nr}.${key}`).toBeCloseTo(0, 12);
          continue;
        }
        expect(
          Math.abs(mine - theirs) / theirs,
          `P${r.nr}.${key}: ${mine} gegen ${theirs}`,
        ).toBeLessThan(0.001);
      }
    }
  });

  it.each(SECTIONS)(
    'weicht an %s NUR im Vorzeichen ab, und dort nach der Umlaufregel des Referenzmodells',
    (_name, ref) => {
      // DIE HAEUFIGSTE FEHLLESUNG DES VERGLEICHS. Wer die beiden Tabellen
      // uebereinanderlegt, sieht ab Punkt 5 andere Vorzeichen und haelt die
      // Werte fuer verschieden — sie sind es nicht.
      //
      // Das Vorzeichen des Referenzmodells kodiert die UMLAUFRICHTUNG des Schubflusses: `Sy`
      // kippt zwischen linkem und rechtem Steg, `Sz` zwischen oberem und
      // unterem Gurt, weil der Umlauf sie in entgegengesetzter Richtung
      // durchlaeuft. Unsere Konvention ist die der parametrischen Formen
      // (Teil oberhalb bzw. links, durchweg <= 0). Fuer |tau| ist die
      // Richtung gleichgueltig.
      const all = points(box('thin-walled', ref));
      // Der Umlauf spiegelt genau dort, wo die Referenz spiegelt: die Nummern mit
      // gekipptem `Sy` sind die der LINKEN Stegseite plus der Gurthaelften,
      // die zu ihr laufen.
      const flippedSy = ref.points
        .filter((r, i) => r.Sy !== 0 && Math.sign(r.Sy) !== Math.sign(all[i].Sy))
        .map((r) => r.nr);
      expect(flippedSy).toEqual([5, 6, 7, 8, 9, 10, 11]);
      const flippedSz = ref.points
        .filter((r, i) => r.Sz !== 0 && Math.sign(r.Sz) !== Math.sign(all[i].Sz))
        .map((r) => r.nr);
      expect(flippedSz).toEqual([9, 10, 11, 12, 13, 14, 15]);
    },
  );

  it.each(SECTIONS)(
    'ist an %s an allen zwoelf Wandpunkten EXAKT',
    (_name, ref) => {
      // DER EIGENTLICHE NACHWEIS seit ADR 0051. `S` ist das erste
      // Flaechenmoment der UMRISSFIGUR zwischen Symmetrieschnitt und Punkt,
      // und das laesst sich fuer jeden Wandschnitt geschlossen hinschreiben —
      // ohne Weg, ohne Mittellinie, ohne Idealisierung. Zwei Rechnungen,
      // dieselbe Zahl bis aufs Gleitkommarauschen.
      const { b, h, t } = ref;
      const a = b / 2;
      const c = h / 2;
      const yi = a - t;
      const zi = c - t;
      const ym = a - t / 2;
      const zm = c - t / 2;
      const all = points(box('thin-walled', ref));

      for (const [i, r] of ref.points.entries()) {
        const p = all[i];
        const corner = Math.abs(p.y) === a && Math.abs(p.z) === c;
        if (corner) continue; // eigener Test, siehe Gehrung
        const web = Math.abs(p.y) === a;

        // Sy: Gurt bis zur AUSSENKANTE a, Steg ueber die lichte Hoehe zi.
        const Sy = web
          ? zm * t * a + (t * (zi * zi - p.z * p.z)) / 2
          : zm * t * Math.abs(p.y);
        // Sz: Steg bis zur AUSSENKANTE c, Gurt ueber die lichte Breite yi.
        const Sz = web
          ? ym * t * Math.abs(p.z)
          : ym * t * c + (t * (yi * yi - p.y * p.y)) / 2;

        expect(Math.abs(p.Sy), `P${r.nr}.Sy`).toBeCloseTo(Sy / 1000, 9);
        expect(Math.abs(p.Sz), `P${r.nr}.Sz`).toBeCloseTo(Sz / 1000, 9);
      }
    },
  );

  it.each(SECTIONS)(
    'trifft an %s die Wandmitten auf die gedruckte Referenzzahl',
    (_name, ref) => {
      // Die Probe gegen die REFERENZ, und sie ist an diesen vier Punkten
      // nicht mehr „auf 0,1 %", sondern gleich: das erste Flaechenmoment der
      // halben Umrissfigur, aufgeteilt auf die beiden Waende, ist eine
      // eindeutige Zahl — und die Referenz druckt sie.
      const all = points(box('thin-walled', ref));
      for (const nr of [8, 16]) {
        expect(Math.abs(all[nr - 1].Sy), `P${nr}.Sy`).toBeCloseTo(
          Math.abs(ref.points[nr - 1].Sy),
          6,
        );
      }
      for (const nr of [4, 12]) {
        expect(Math.abs(all[nr - 1].Sz), `P${nr}.Sz`).toBeCloseTo(
          Math.abs(ref.points[nr - 1].Sz),
          6,
        );
      }
    },
  );

  it.each(SECTIONS)(
    'ist an %s an den Gurtstationen exakt, die Referenz dort leicht abweichend',
    (_name, ref) => {
      // DIE UMKEHRUNG, und sie gehoert dazu: an den Gurtpunkten P3/P5/P11/P13
      // ist der abgetrennte Teil REINER GURT — ein Rechteck mal seinem
      // Schwerpunktsabstand, ohne passierte Ecke. Die einzige
      // Modellentscheidung (wo der Gurt endet) liegt jenseits des Schnitts und
      // kann diesen Wert nicht erreichen; Mittellinie und Parkettierung
      // drucken hier dieselbe Zahl.
      //
      // Die Referenz druckt 0,02 bis 0,03 % anderes. WELCHES MODELL DAHINTERSTEHT,
      // IST AUS DEM AUSDRUCK NICHT ABLESBAR — moeglich ist auch ein aus einer
      // 2D-Schubloesung zurueckgerechnetes S = tau*I*t/V, also gar nicht
      // dieselbe Groesse. Dieser Test behauptet deshalb nur, dass wir den
      // geschlossen hinschreibbaren Wert treffen, und haelt die Groesse der
      // Differenz fest, damit eine kuenftige Aenderung daran sichtbar wird.
      const { b, h, t } = ref;
      const zm = h / 2 - t / 2;
      const all = points(box('thin-walled', ref));
      let worst = 0;
      for (const nr of [3, 5, 11, 13]) {
        const p = all[nr - 1];
        expect(Math.abs(p.Sy), `P${nr}.Sy`).toBeCloseTo(
          (zm * t * (b / 2 - t)) / 1000,
          9,
        );
        const theirs = Math.abs(ref.points[nr - 1].Sy);
        worst = Math.max(worst, Math.abs(Math.abs(p.Sy) - theirs) / theirs);
      }
      expect(worst).toBeGreaterThan(0.0001);
      expect(worst).toBeLessThan(0.0004);
    },
  );

  it.each(SECTIONS)(
    'bleibt an %s ueberall innerhalb von 0,1 % um den Ausdruck',
    (_name, ref) => {
      // Die Gesamtschranke bleibt stehen: keine der 32 Zahlen laeuft weg,
      // egal auf welcher Seite die Restdifferenz liegt.
      const all = points(box('thin-walled', ref));
      for (const [i, r] of ref.points.entries()) {
        for (const key of ['Sy', 'Sz'] as const) {
          const theirs = Math.abs(r[key]);
          if (theirs === 0) continue;
          expect(
            Math.abs(Math.abs(all[i][key]) - theirs) / theirs,
            `P${r.nr}.${key}`,
          ).toBeLessThan(0.001);
        }
      }
    },
  );

  it('setzt t = 10 an allen 16 Punkten, ohne Sprungstelle', () => {
    // Der Schubfluss laeuft LAENGS der Wand, und die ist umlaufend gleich
    // dick. Die Referenz druckt dieselbe Spalte.
    for (const [i, r] of REF.entries()) {
      expect(pts[i].t, `P${r.nr}.t`).toBe(r.t);
    }
  });

  it('schliesst an den Symmetrieschnitten auf null — je Richtung ein anderer', () => {
    // DIE SELBSTPRUEFUNG DES UMLAUFS. Der geschlossene Querschnitt hat keinen
    // freien Rand; der Startschnitt kommt aus der Symmetrie und liegt fuer
    // `Vz` in GURTMITTE, fuer `Vy` in STEGMITTE. Kein Punkt hat beides.
    expect(pts[3].Sy).toBeCloseTo(0, 12); // P4  Gurtmitte oben
    expect(pts[11].Sy).toBeCloseTo(0, 12); // P12 Gurtmitte unten
    expect(pts[7].Sz).toBeCloseTo(0, 12); // P8  Stegmitte links
    expect(pts[15].Sz).toBeCloseTo(0, 12); // P16 Stegmitte rechts
    for (const nr of [4, 12]) expect(pts[nr - 1].Sz).not.toBeCloseTo(0, 6);
    for (const nr of [8, 16]) expect(pts[nr - 1].Sy).not.toBeCloseTo(0, 6);
  });

  it.each(SECTIONS)(
    'liest die Aussenecke von %s als Gehrung, von beiden Waenden gleich',
    (_name, ref) => {
      // AN DER ECKE GIBT ES KEINEN WANDSCHNITT: dort stossen zwei freie
      // Flaechen zusammen. Der kuerzeste Weg durchs Material geht zur
      // Innenecke, also diagonal. Der abgeschnittene Teil ist dann der
      // Gurtstreifen bis zur lichten Breite plus das halbe Eckquadrat:
      //
      //   S = zm*t*yi + (t^2/2)*(c - t/3) = t*(a*c - a*t/2 - c*t/2 + t^2/3)
      //
      // Der Ausdruck ist in `a` und `c` SYMMETRISCH — deshalb kommt von der
      // Stegseite dieselbe Zahl heraus, und deshalb ist `Sy = Sz`. Beides
      // wird hier gerechnet, nicht behauptet.
      const { b, h, t } = ref;
      const a = b / 2;
      const c = h / 2;
      const all = points(box('thin-walled', ref));

      // Von der Gurtseite: Streifen bis zur lichten Breite + Dreieck.
      const fromFlange =
        (c - t / 2) * t * (a - t) + (t * t * (c - t / 3)) / 2;
      // Von der Stegseite: Streifen bis zur lichten Hoehe + das andere Dreieck.
      const fromWeb = (a - t / 2) * t * (c - t) + (t * t * (a - t / 3)) / 2;
      expect(fromFlange).toBeCloseTo(fromWeb, 6);

      for (const nr of [2, 6, 10, 14]) {
        const p = all[nr - 1];
        expect(Math.abs(p.Sy), `P${nr}.Sy`).toBeCloseTo(fromFlange / 1000, 9);
        expect(Math.abs(p.Sz), `P${nr}.Sz`).toBeCloseTo(fromWeb / 1000, 9);
        // Und sie liegt zwischen ihren beiden Nachbarn — P3 davor, P1 danach.
        expect(Math.abs(p.Sy)).toBeGreaterThan(Math.abs(all[2].Sy));
        expect(Math.abs(p.Sy)).toBeLessThan(Math.abs(all[0].Sy));
      }
    },
  );

  it('fuehrt die Vorzeichenkonvention der parametrischen Formen', () => {
    // Durchweg <= 0. Das Referenzmodell kippt stattdessen zwischen linkem und rechtem Steg
    // (P8: +243,00 gegen P16: -243,00), weil sein Vorzeichen die
    // UMLAUFRICHTUNG kodiert. Fuer |tau| ist die Richtung gleichgueltig.
    for (const p of pts) {
      expect(p.Sy, `P${p.nr}.Sy`).toBeLessThanOrEqual(0);
      expect(p.Sz, `P${p.nr}.Sz`).toBeLessThanOrEqual(0);
    }
    expect(Math.sign(REF[7].Sy)).toBe(-Math.sign(REF[15].Sy));
  });
});

describe('Das Umrissmodell des Kastens', () => {
  const solid = points(box('solid'));
  const thin = points(box('thin-walled'));

  it('haelt Nummern und Koordinaten des Wandmodells, Ziffer fuer Ziffer', () => {
    for (let i = 0; i < 16; i++) {
      expect(solid[i].nr, `P${i + 1}.nr`).toBe(thin[i].nr);
      expect(solid[i].y, `P${i + 1}.y`).toBe(thin[i].y);
      expect(solid[i].z, `P${i + 1}.z`).toBe(thin[i].z);
    }
  });

  it('schneidet in Stegmitte BEIDE Stege — und liefert damit dasselbe tau', () => {
    // DIE STELLE, AN DER DIE BEIDEN MODELLE ZUSAMMENFALLEN. Der waagerechte
    // Schnitt trifft beide Stege: `S` doppelt, `t = 2t`. Das Wandmodell laesst
    // den Fluss durch EINEN Steg laufen: `S` einfach, `t`. Der Quotient S/t,
    // aus dem tau faellt, ist bis auf die Eckkorrektur derselbe.
    expect(solid[15].t).toBe(2 * TO.t);
    // Der Bandschnitt kennt keinen Eckblock und trifft die exakten 2*243,00.
    expect(Math.abs(solid[15].Sy)).toBeCloseTo(486, 9);
    const tauSolid = Math.abs(solid[15].Sy) / solid[15].t;
    const tauThin = Math.abs(thin[15].Sy) / thin[15].t;
    expect(Math.abs(tauSolid - tauThin) / tauSolid).toBeLessThan(0.001);
  });

  it('liest Sy allein aus der Hoehe — und damit die Gurtaussenseite als null', () => {
    // DER SICHTBARE UNTERSCHIED ZUM WANDMODELL, und er ist kein Fehler:
    // oberhalb von z = -h/2 liegt nichts, der abgeschnittene Teil ist leer.
    // Das Wandmodell laesst dort den Schubfluss laengs des Gurts von null auf
    // 137,75 cm3 anwachsen.
    for (const nr of [2, 3, 4, 5, 6]) {
      expect(solid[nr - 1].Sy, `P${nr}.Sy`).toBeCloseTo(0, 12);
    }
    // Der Gehrungswert der Ecke, nicht null.
    expect(Math.abs(thin[1].Sy)).toBeCloseTo(137.8333333, 6);
  });

  it('setzt t auf die WAAGERECHTE Schnittbreite: b am Gurt, 2t am Steg', () => {
    // Dieselbe Regel wie bei allen kompakten Vorlagen — `t` gehoert zum
    // waagerechten Schnitt, und an der Sprungstelle z = -h/2 + t gilt die
    // kleinere der beiden Breiten.
    for (const nr of [2, 3, 4, 5, 6, 10, 11, 12, 13, 14]) {
      expect(solid[nr - 1].t, `P${nr}.t`).toBe(TO.b);
    }
    for (const nr of [1, 7, 8, 9, 15, 16]) {
      expect(solid[nr - 1].t, `P${nr}.t`).toBe(2 * TO.t);
    }
  });
});

describe('Die Gueltigkeitspruefung gilt auch fuer den Kasten', () => {
  it('meldet eine Wand, die dicker ist als der halbe Querschnitt', () => {
    // EINE Pruefung, nicht zwei: `sectionProperties` steht vor der
    // Verzweigung, also gibt es keine Spannungspunkte ohne Querschnittswerte.
    for (const idealisation of ['solid', 'thin-walled'] as const) {
      expect(
        stressPoints({
          kind: 'shape',
          id: 'b',
          shape: { kind: 'hollow-rectangle', b: 60, h: 60, t: 30, idealisation },
        }),
        idealisation,
      ).toBeUndefined();
    }
  });
});

describe('Beide Vorlagen skalieren mit den Abmessungen', () => {
  // Die Referenz ist EIN Querschnitt. Dass die Vorlage nicht auf ihn
  // zugeschnitten ist, zeigt der geschlossene Ausdruck an einem zweiten: beim
  // QUADRATISCHEN Kasten muessen Gurt und Steg dieselbe Rolle spielen.
  it('vertauscht am quadratischen Kasten Sy und Sz sauber', () => {
    const square = hollowRectangleThinPoints(200, 200, 8);
    // P2 ist die Aussenecke: dort ist der Knotenwert in beiden Richtungen
    // gleich, unabhaengig von der Form.
    expect(square[1].Sy).toBeCloseTo(square[1].Sz, 12);
    // P4 (Gurtmitte) und P16 (Stegmitte) sind am Quadrat spiegelbildlich.
    expect(Math.abs(square[3].Sz)).toBeCloseTo(Math.abs(square[15].Sy), 12);
    expect(square[3].Sy).toBeCloseTo(0, 12);
    expect(square[15].Sz).toBeCloseTo(0, 12);
  });

  it('haelt beim Umrissmodell S = 0 an allen vier Aussenraendern', () => {
    const square = hollowRectanglePoints(200, 200, 8);
    for (const nr of [2, 6, 10, 14]) {
      expect(square[nr - 1].Sy, `P${nr}.Sy`).toBeCloseTo(0, 12);
      expect(square[nr - 1].Sz, `P${nr}.Sz`).toBeCloseTo(0, 12);
    }
  });
});
