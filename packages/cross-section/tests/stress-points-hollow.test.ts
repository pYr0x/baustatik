import { describe, expect, it } from 'vitest';
import { type CrossSection, type StressPoint, stressPoints } from '../src/index';
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
  // Die Stellen gehoeren dem KASTEN, nicht der Idealisierung — sie standen
  // deshalb einmal fuer beide Zweige. Seit ADR 0057 hat der kompakte Kasten
  // gar keine Punkte mehr, geblieben ist der Umlauf des Wandmodells.
  const pts = points(box('thin-walled'));

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
    const corners = [pts[1], pts[5], pts[9], pts[13]].map((p) => [p.y, p.z]);
    expect(corners).toEqual([
      [100, -150],
      [-100, -150],
      [-100, 150],
      [100, 150],
    ]);
  });
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
        // MIT VORZEICHEN, seit der Umlauf des Packages so herum laeuft wie der
        // des Ausdrucks. Vorher stand hier ein Betragsvergleich, und ein
        // Betragsvergleich haette ein global gekipptes Feld nie gemerkt.
        const theirs = r[key];
        const mine = p[key];
        if (theirs === 0) {
          // Kein relativer Vergleich gegen null: der Symmetrieschnitt muss
          // EXAKT aufgehen, nicht nur beinahe.
          expect(mine, `P${r.nr}.${key}`).toBeCloseTo(0, 12);
          continue;
        }
        expect(
          Math.abs(mine - theirs) / Math.abs(theirs),
          `P${r.nr}.${key}: ${mine} gegen ${theirs}`,
        ).toBeLessThan(0.001);
      }
    }
  });

  it.each(SECTIONS)(
    'kippt an %s an denselben Stellen wie der Ausdruck — keine einzige weicht ab',
    (_name, ref) => {
      // BIS ZUR VORZEICHENKONVENTION STAND HIER DAS GEGENTEIL: eine Liste der
      // Nummern, an denen sich die Vorzeichen unterschieden (5-11 fuer `Sy`,
      // 9-15 fuer `Sz`), mit der Begruendung, fuer |tau| sei die Richtung
      // gleichgueltig. Das Package fuehrte durchweg <= 0.
      //
      // Der Unterschied war ein GLOBALES Vorzeichen — und ein globales
      // Vorzeichen ist nichts anderes als die Wahl der Laufrichtung. Seit
      // `hollowStations` sie so legt wie der Ausdruck, ist die Liste leer.
      // Das ist die eigentliche Nachricht: die Referenz fuehrt fuer den Kasten
      // eine STIMMIGE Umlaufkonvention, und wir fuehren jetzt dieselbe.
      const all = points(box('thin-walled', ref));
      const differing = ref.points
        .filter(
          (r, i) =>
            (r.Sy !== 0 && Math.sign(r.Sy) !== Math.sign(all[i].Sy)) ||
            (r.Sz !== 0 && Math.sign(r.Sz) !== Math.sign(all[i].Sz)),
        )
        .map((r) => r.nr);
      expect(differing).toEqual([]);

      // Und der Umlauf ist wirklich einer: `Sy` kippt zwischen den beiden
      // STEGEN, `Sz` zwischen den beiden GURTEN. P8 ist die linke Stegmitte,
      // P16 die rechte; P4 die Obergurtmitte, P12 die Untergurtmitte.
      expect(Math.sign(all[7].Sy)).toBe(-Math.sign(all[15].Sy));
      expect(Math.sign(all[3].Sz)).toBe(-Math.sign(all[11].Sz));
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

  it('fuehrt die Vorzeichen des UMLAUFS, nicht ein pauschales Minus', () => {
    // `Sy` haengt am Nullschnitt in GURTMITTE, `Sz` an dem in STEGMITTE. Die
    // Seite, auf der man steht, entscheidet das Vorzeichen — deshalb liest es
    // sich als `-sign(y)` und `sign(z)`.
    for (const p of pts) {
      if (p.y !== 0) {
        expect(Math.sign(p.Sy), `P${p.nr}.Sy`).toBe(-Math.sign(p.y));
      }
      if (p.z !== 0) {
        expect(Math.sign(p.Sz), `P${p.nr}.Sz`).toBe(Math.sign(p.z));
      }
    }
    // Die vier Nullschnitte: Gurtmitte traegt kein `Sy`, Stegmitte kein `Sz`.
    for (const nr of [4, 12]) expect(pts[nr - 1].Sy, `P${nr}.Sy`).toBe(0);
    for (const nr of [8, 16]) expect(pts[nr - 1].Sz, `P${nr}.Sz`).toBe(0);
  });

  it('traegt an jedem Punkt eine Tangente der Laenge eins und eine Wand', () => {
    // Der geschlossene Kasten ist UNVERZWEIGT — ein Weg, keine Aeste. Deshalb
    // hat ADR 0059 hier nichts geaendert: kein Ort traegt zwei Punkte, jede
    // Nummer kommt einmal vor, und die Aussenecke ist einwertig. Sie verbindet
    // ZWEI Waende, sie teilt nichts auf.
    for (const p of pts) {
      expect(Math.hypot(p.ty, p.tz), `P${p.nr}`).toBeCloseTo(1, 12);
    }
    expect(new Set(pts.map((p) => p.nr)).size).toBe(16);
    expect(new Set(pts.map((p) => `${p.y}/${p.z}`)).size).toBe(16);

    // Acht Elemente: vier Waende und die vier Gehrungen dazwischen.
    expect(pts.map((p) => p.wall)).toEqual([
      'web-right',
      'corner-top-right',
      'flange-top',
      'flange-top',
      'flange-top',
      'corner-top-left',
      'web-left',
      'web-left',
      'web-left',
      'corner-bottom-left',
      'flange-bottom',
      'flange-bottom',
      'flange-bottom',
      'corner-bottom-right',
      'web-right',
      'web-right',
    ]);

    // P2 ist die obere rechte Aussenecke: der Umlauf laeuft dort vom Obergurt
    // (nach rechts) in den rechten Steg (nach unten), also nach `(+1,+1)/√2`.
    expect(pts[1].ty).toBeCloseTo(Math.SQRT1_2, 12);
    expect(pts[1].tz).toBeCloseTo(Math.SQRT1_2, 12);
  });
});

describe('Die Gleichgewichtsprobe des Kastens', () => {
  // DIE STELLE, AN DER SICH DER UMLAUF BEWEISEN MUSS. Die beiden Stege tragen
  // `Vz` gemeinsam nach unten ab — ihre TANGENTEN zeigen dabei in
  // entgegengesetzte Richtungen (rechts `+z`, links `-z`), ihre Fluesse also
  // im Vorzeichen ebenfalls. Erst beides zusammen ergibt zweimal dieselbe
  // Kraft nach unten.
  //
  // Genau das kann ein Feld aus Betraegen nicht: es haette in beiden Stegen
  // dasselbe Vorzeichen und wuerde sich beim Integrieren aufheben statt zu
  // addieren.
  //
  // SEIT ADR 0059 STEHT DIE PROJEKTION IN DER PROBE selbst: der Beitrag einer
  // Stelle zur globalen z-Richtung ist `q*tz`. Vorher drehte der Test das
  // Vorzeichen des linken Stegs von Hand um — dieselbe Rechnung, nur mit dem
  // Wissen ueber die Tangente im Test statt am Punkt.
  const B = { b: 200, h: 300, t: 10 } as const;
  const Iy =
    (B.b * B.h ** 3 - (B.b - 2 * B.t) * (B.h - 2 * B.t) ** 3) / 12;
  const simpson = (span: number, a: number, m: number, b: number) =>
    (span / 6) * (a + 4 * m + b);

  it('laesst beide Stege gleich viel von Vz abtragen', () => {
    const pts = hollowRectangleThinPoints(B.b, B.h, B.t);
    /** Der Anteil an der globalen z-Richtung: `q*tz`. */
    const g = (nr: number) =>
      (-(pts[nr - 1].Sy * 1000) / Iy) * pts[nr - 1].tz;
    const span = 2 * (B.h / 2 - B.t);
    // Rechter Steg (P1 oben, P16 Mitte, P15 unten), Tangente `(0,+1)`.
    const right = simpson(span, g(1), g(16), g(15));
    // Linker Steg (P7, P8, P9), Tangente `(0,-1)` — dieselbe Kraft nach unten,
    // und die Projektion holt sie sich selbst.
    const left = simpson(span, g(7), g(8), g(9));
    expect(right).toBeCloseTo(left, 12);
    // Zusammen 97,5 % von `Vz`; der Rest ist die senkrechte Komponente in den
    // Gurten, die das Wandmodell nicht fuehrt.
    expect(right + left).toBeGreaterThan(0.97);
    expect(right + left).toBeLessThan(1);
  });
});

describe('Die Gueltigkeitspruefung gilt auch fuer den Kasten', () => {
  it('meldet eine Wand, die dicker ist als der halbe Querschnitt', () => {
    // EINE Pruefung, nicht zwei: `sectionProperties` steht vor der
    // Verzweigung, also gibt es keine Spannungspunkte ohne Querschnittswerte.
    expect(
      stressPoints({
        kind: 'shape',
        id: 'b',
        shape: {
          kind: 'hollow-rectangle',
          b: 60,
          h: 60,
          t: 30,
          idealisation: 'thin-walled',
        },
      }),
    ).toBeUndefined();
  });
});

describe('Der kompakte Kasten hat keine Spannungspunkte mehr', () => {
  it('antwortet fuer idealisation solid mit undefined', () => {
    // ADR 0057: `idealisation: 'solid'` heisst „diese Figur traegt kein
    // Schnittmodell". Bis dahin stand hier ein Umrissmodell, das `Sy` allein
    // aus der Hoehe las und an den fuenf Punkten der Gurtaussenseite null
    // lieferte, wo das Wandmodell laengs des Gurts anwaechst — zwei Zahlen
    // fuer eine Stelle, von denen nur eine eine Referenz hatte.
    expect(stressPoints(box('solid'))).toBeUndefined();
  });
});

describe('Die Vorlage skaliert mit den Abmessungen', () => {
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
});
