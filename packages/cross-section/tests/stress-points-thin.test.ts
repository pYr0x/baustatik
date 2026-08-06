import { lookupProfile, profilesIn } from '@baustatik/steel-profiles';
import { describe, expect, it } from 'vitest';
import { type CrossSection, type StressPoint, stressPoints } from '../src/index';
import { rolledIStressPoints } from '../src/stress-points/rolled-i';
import {
  iSymmetricThinPoints,
  tSectionThinPoints,
} from '../src/stress-points/thin';

/**
 * DAS ORAKEL DER DÜNNWANDIGEN VORLAGEN: `r = 0`.
 *
 * Ein GESCHWEISSTES I ohne Ausrundung IST das gewalzte Profil mit `r = 0`.
 * Damit erbt die neue Vorlage die Gültigkeit der 546 gegen RSTAB geprüften
 * Punkte, ohne eine einzige neue Fixture zu kosten — und das ist die Referenz,
 * die CONTEXT.md für jede Vorlage verlangt („eine Vorlage ohne Referenzdaten
 * wäre geraten und nicht gerechnet").
 *
 * WO DAS ORAKEL GILT, UND WO NICHT. Es gilt an den 14 GURTSTATIONEN, und dort
 * exakt: `rolled-i.ts` führt den Gurt bereits als Wand — `t = tf` und der
 * Hebelarm `zf = (h - tf)/2` auf der MITTELLINIE —, und alle Gurtgrößen
 * enthalten überhaupt keinen Ausrundungsanteil.
 *
 * Am STEG führt `rolled-i.ts` dagegen die Umrissfigur: sein Steg läuft über
 * die LICHTE Höhe `h/2 - tf`, das Wandmodell von Gurtmitte zu Gurtmitte
 * (`±zf`). Bei IPE-80-Massen sind das 11,25 gegen 11,60 cm³. Das ist kein
 * Fehler auf einer der beiden Seiten, sondern der Unterschied zwischen zwei
 * Idealisierungen — und der Schwerpunkt bekommt deshalb seinen eigenen Test,
 * gegen den Katalogwert 11,61.
 */

/**
 * Welcher der 15 geschweißten Punkte auf welcher gedruckten RSTAB-Nummer
 * sitzt — die Stelle im WANDMODELL, nicht die Koordinate.
 *
 * Warum das nicht dieselbe Nummer ist: im Wandmodell ist der Gurt eine LINIE.
 * Ober- und Unterseite fallen auf dieselbe Station, also treffen die vier
 * Punkte einer Gurtkante nur zwei RSTAB-Nummern. Der geschweißte Punkt 4
 * (Gurtunterseite außen) und der Punkt 1 (Gurtoberseite außen) sind DIESELBE
 * Wandstelle — genau der Grund, warum das gewalzte Profil die
 * Gurtunterseiten-Ecken gar nicht erst druckt.
 *
 * Punkt 15 fehlt: der Schwerpunkt sitzt am Steg, und dort trennen sich die
 * beiden Modelle (siehe oben).
 */
const STATION: readonly (readonly [thin: number, rolled: number])[] = [
  [1, 1],
  [2, 3],
  [3, 5],
  [4, 1],
  [5, 2],
  [6, 4],
  [7, 5],
  [8, 6],
  [9, 7],
  [10, 9],
  [11, 10],
  [12, 6],
  [13, 8],
  [14, 10],
];

describe('Die dünnwandige I-Vorlage gegen das gewalzte Profil mit r = 0', () => {
  // Die vier Abmessungen jedes Katalogprofils, aber OHNE Ausrundung — also
  // genau das geschweißte I, das die parametrische Form beschreibt.
  const catalogue = [...profilesIn('IPE'), ...profilesIn('HEA')];

  it('trifft an allen 14 Gurtstationen |Sy| und |Sz| auf Gleitkommarauschen', () => {
    // 1e-12 RELATIV — und das ist KEINE Modelltoleranz, sondern die Breite
    // eines ulp. Beide Seiten rechnen dieselbe Größe, klammern sie aber
    // verschieden: `rolled-i.ts` als `-outstand*tf*((bb+yFillet)/2)`, die Wand
    // als `tf*(y² - (b/2)²)/2`. Algebraisch identisch, im letzten Bit nicht
    // (IPE 120: 3,210353999999… gegen 3,210354). Eine echte Toleranz wäre
    // Größenordnungen größer und ließe offen, ob die Vorlage die Größe
    // RECHNET oder nur in ihre Nähe kommt.
    const ULP = 1e-12;
    for (const p of catalogue) {
      const thin = iSymmetricThinPoints(p.h, p.b, p.tw, p.tf);
      const rolled = rolledIStressPoints({
        h: p.h,
        b: p.b,
        tw: p.tw,
        tf: p.tf,
        r: 0,
      });
      for (const [thinNr, rolledNr] of STATION) {
        const wall = thin[thinNr - 1];
        const printed = rolled[rolledNr - 1];
        for (const key of ['Sy', 'Sz'] as const) {
          const mine = Math.abs(wall[key]);
          const theirs = Math.abs(printed[key]);
          expect(
            Math.abs(mine - theirs) <= ULP * Math.abs(theirs),
            `${p.id} P${thinNr} -> R${rolledNr}.${key}: ${mine} vs ${theirs}`,
          ).toBe(true);
        }
      }
    }
  });

  it('setzt an allen 14 Gurtstationen t = tf, nicht b', () => {
    // DER ZWEITE TEIL DES BEFUNDS: das Umrissmodell setzte dort `t = b`, also
    // die SENKRECHTE Schubkomponente durch den ganzen Gurt. Am Gurt eines
    // dünnwandigen Profils bedeutet die nichts — der Schubfluss läuft LÄNGS
    // der Wand und verteilt sich über `tf`.
    for (const p of catalogue) {
      const thin = iSymmetricThinPoints(p.h, p.b, p.tw, p.tf);
      for (const [thinNr] of STATION) {
        expect(thin[thinNr - 1].t, `${p.id} P${thinNr}.t`).toBe(p.tf);
      }
      expect(thin[14].t, `${p.id} P15.t`).toBe(p.tw);
    }
  });

  it('behält Koordinaten und Nummern der kompakten Vorlage', () => {
    // Der Zuschnitt: NUR `t` und `S` wechseln aufs Wandmodell. Die 15 Punkte
    // liegen, wo sie lagen, und heißen, wie sie hießen — die Nummerierung
    // ist ein veröffentlichter Vertrag.
    const solid = points({
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
    const thin = iSymmetricThinPoints(300, 150, 7.1, 10.7);
    expect(thin).toHaveLength(15);
    for (let i = 0; i < 15; i++) {
      expect(thin[i].nr, `P${i + 1}.nr`).toBe(solid[i].nr);
      expect(thin[i].y, `P${i + 1}.y`).toBe(solid[i].y);
      expect(thin[i].z, `P${i + 1}.z`).toBe(solid[i].z);
    }
  });
});

describe('Der Schwerpunkt des dünnwandigen I: der behobene Widerspruch', () => {
  // DER BEFUND, um den es in diesem Schritt geht. Ein `i-symmetric` mit
  // `idealisation: 'thin-walled'` bekam sein kappa aus dem Wandweg, dessen
  // `Sy,max` 11,60 cm³ ist — und einen Spannungspunkt am Schwerpunkt aus der
  // Umrissmodell mit 11,25 cm³. Zwei Antworten auf EINE Zahl, in einem
  // Querschnitt.
  const IPE_80 = { h: 80, b: 46, tw: 3.8, tf: 5.2 } as const;

  it('liefert 11,60 cm³ und nicht mehr 11,25', () => {
    const thin = iSymmetricThinPoints(IPE_80.h, IPE_80.b, IPE_80.tw, IPE_80.tf);
    expect(Math.abs(thin[14].Sy)).toBeCloseTo(11.6, 2);
  });

  it('liegt damit am Katalogwert 11,61 statt 3 % darunter', () => {
    // Der Katalog ist der unabhängige Zeuge: `Sy,max` von IPE 80 ist 11,61,
    // und `2*Sy,max = Wpl,y` belegt in `steel-profiles`, dass die Tabelle sich
    // selbst treu ist. Die Restlücke von 0,06 % ist die fehlende Ausrundung.
    const row = lookupProfile('IPE 80');
    if (row === undefined) throw new Error('IPE 80 fehlt im Katalog');
    const thin = iSymmetricThinPoints(IPE_80.h, IPE_80.b, IPE_80.tw, IPE_80.tf);
    const deviation = (Math.abs(thin[14].Sy) - row.SyMax) / row.SyMax;
    expect(Math.abs(deviation)).toBeLessThan(0.001);
  });

  it('bleibt über den ganzen Katalog unter dem Tabellenwert', () => {
    // GLEICHGERICHTET, NICHT STREUEND — und das ist die eigentliche Aussage.
    // Das fehlende Material sitzt an der Ausrundung, also fehlt es IMMER und
    // nie umgekehrt. Streute das Vorzeichen, wäre es kein
    // Modellunterschied, sondern ein Fehler.
    //
    // Die Spanne ist eine CHARAKTERISIERUNG: IPE 80 liegt 0,05 % darunter,
    // HEA 260 4,6 %. Das ist dasselbe Muster, das kappa zeigt (`Az` trifft auf
    // 6,5 % und liegt immer zu klein): die HEA-Reihe hat die dicksten
    // Ausrundungen relativ zum Steg.
    let worst = 0;
    for (const series of ['IPE', 'HEA'] as const) {
      for (const p of profilesIn(series)) {
        const thin = iSymmetricThinPoints(p.h, p.b, p.tw, p.tf);
        const deviation = (Math.abs(thin[14].Sy) - p.SyMax) / p.SyMax;
        expect(deviation, `${p.id}`).toBeLessThan(0);
        worst = Math.min(worst, deviation);
      }
    }
    expect(worst).toBeGreaterThan(-0.05);
    expect(worst).toBeLessThan(-0.04);
  });
});

describe('Die Vorzeichenkonvention der dünnwandigen Vorlagen', () => {
  // Sie führen die Konvention der PARAMETRISCHEN Formen, nicht RSTABs:
  // `Sy`/`Sz` ist das erste Flächenmoment des Teils OBERHALB bzw. LINKS vom
  // Punkt, also durchweg <= 0. RSTABs Vorzeichen kodiert stattdessen die
  // Umlaufrichtung des Schubflusses und spiegelt deshalb zwischen oberem und
  // unterem Gurt. Für `|tau|` ist die Richtung gleichgültig — festgehalten
  // wird sie, weil zwei Konventionen in einem Package nur dann harmlos sind,
  // wenn beide aufgeschrieben stehen.
  it('hält jedes Sy und Sz des dünnwandigen I bei <= 0', () => {
    for (const p of iSymmetricThinPoints(300, 150, 7.1, 10.7)) {
      expect(p.Sy, `P${p.nr}.Sy`).toBeLessThanOrEqual(0);
      expect(p.Sz, `P${p.nr}.Sz`).toBeLessThanOrEqual(0);
    }
  });

  it('spiegelt nicht zwischen oberem und unterem Gurt', () => {
    // Der sichtbare Unterschied zu RSTAB: dort ist `Sz` an Punkt 8 das
    // Negative von Punkt 3. Hier sind beide gleich, weil „links vom Punkt"
    // nicht weiß, an welchem Gurt es steht.
    const thin = iSymmetricThinPoints(300, 150, 7.1, 10.7);
    expect(thin[12].Sz).toBe(thin[1].Sz); // P13 (unten Mitte) gegen P2 (oben)
    expect(thin[12].Sy).toBe(thin[1].Sy);
  });
});

describe('Die dünnwandige T-Vorlage', () => {
  // Ein geschweißtes T-Profil ist ein echter Stahlquerschnitt, also bekommt
  // die Form eine Vorlage. Ihr Orakel ist nicht RSTAB, sondern die
  // SELBSTPRÜFUNG des Weges: er muss am freien Stegende auf null schließen.
  const T = { bf: 300, hf: 15, bw: 10, h: 200 } as const;

  const thinT = () => {
    const { zs, zsWall } = tGeometry(T.bf, T.hf, T.bw, T.h);
    return tSectionThinPoints(T.bf, T.hf, T.bw, T.h, zs, zsWall);
  };

  it('liefert 9 Punkte mit den Koordinaten der kompakten Vorlage', () => {
    const solid = points({
      kind: 'shape',
      id: 't',
      shape: { kind: 't-section', ...T, idealisation: 'solid' },
    });
    const thin = thinT();
    expect(thin).toHaveLength(9);
    for (let i = 0; i < 9; i++) {
      expect(thin[i].nr, `P${i + 1}.nr`).toBe(solid[i].nr);
      expect(thin[i].y, `P${i + 1}.y`).toBe(solid[i].y);
      expect(thin[i].z, `P${i + 1}.z`).toBe(solid[i].z);
    }
  });

  it('schließt am freien Stegende (P7/P8) auf S = 0', () => {
    // DIE SELBSTPRÜFUNG. `S` wird um den Schwerpunkt des WANDMODELLS
    // gerechnet, und nur deshalb verschwindet es hier. Um den Schwerpunkt der
    // Umrissfigur gerechnet bliebe ein Rest stehen — und `S` wäre zweideutig,
    // je nachdem, von welcher Seite man schneidet.
    const thin = thinT();
    expect(thin[6].Sy).toBeCloseTo(0, 12);
    expect(thin[7].Sy).toBeCloseTo(0, 12);
  });

  it('liefert an den Gurtspitzen S = 0 und dazwischen t = hf', () => {
    const thin = thinT();
    for (const nr of [1, 2, 3, 6]) {
      expect(thin[nr - 1].Sy, `P${nr}.Sy`).toBeCloseTo(0, 12);
      expect(thin[nr - 1].Sz, `P${nr}.Sz`).toBeCloseTo(0, 12);
    }
    for (const nr of [1, 2, 3, 4, 5, 6]) {
      expect(thin[nr - 1].t, `P${nr}.t`).toBe(T.hf);
    }
    for (const nr of [7, 8, 9]) {
      expect(thin[nr - 1].t, `P${nr}.t`).toBe(T.bw);
    }
  });

  it('rechnet den Gurt mit derselben Maschine wie das I', () => {
    // Der halbe Gurt an der Stegachse: `armF * hf * bf/2`. Dieselbe Formel,
    // die beim I gegen 546 RSTAB-Punkte geprüft ist — nur mit EINEM Gurt.
    const { zsWall } = tGeometry(T.bf, T.hf, T.bw, T.h);
    const armF = T.hf / 2 - zsWall;
    const thin = thinT();
    // P4 sitzt bei y = -bw/2, also fehlt am halben Gurt das Stück bis zur
    // Stegflanke.
    expect(thin[3].Sy).toBeCloseTo(
      (armF * T.hf * (T.bf - T.bw)) / 2 / 1000,
      9,
    );
    expect(thin[3].Sz).toBeCloseTo(
      (T.hf * ((T.bw / 2) ** 2 - (T.bf / 2) ** 2)) / 2 / 1000,
      9,
    );
  });

  it('hält den Versatz zs - zsWall als Näherung dieser Form fest', () => {
    // CHARAKTERISIERUNG, kein Nachweis. `S` läuft um den Schwerpunkt des
    // WANDMODELLS, die Koordinaten aber um den der UMRISSFIGUR — denn `A` und
    // `Iy` kommen aus der Umrissfigur, und sigma braucht dieselbe Achse. Punkt
    // 9 liegt damit NICHT ganz im Maximum von `S`; der Abstand der beiden
    // Schwerpunkte ist die Näherung dieser Form.
    //
    // Bei den doppeltsymmetrischen Formen ist der Versatz exakt null — dort
    // fällt er nicht auf, und genau deshalb steht die Zahl hier.
    //
    // WAS DIE ZAHL SAGT: der Versatz ist klein (0,30 mm bei 200 mm Höhe), und
    // weil `S` an seinem Maximum flach ist, kostet er nur 3,3e-6 von `S`. Die
    // Näherung ist also benannt und belanglos — der Test hält fest, dass sie
    // belanglos BLEIBT.
    const { zs, zsWall } = tGeometry(T.bf, T.hf, T.bw, T.h);
    expect(zs - zsWall).toBeCloseTo(0.2963, 4);

    // Das Maximum von `S` sitzt am WANDschwerpunkt. Es zu treffen, kostete die
    // Achse, um die sigma rechnet — deshalb steht der Punkt, wo er steht.
    const thin = thinT();
    const atCentroid = Math.abs(thin[8].Sy);
    const atMaximum = Math.abs(
      tSectionThinPoints(T.bf, T.hf, T.bw, T.h, zsWall, zsWall)[8].Sy,
    );
    expect(atCentroid).toBeLessThan(atMaximum);
    expect((atMaximum - atCentroid) / atMaximum).toBeLessThan(1e-5);
  });

  it('lässt den Versatz auch beim breiten Gurt das Vorzeichen wechseln', () => {
    // Der Plattenbalken 2000/200/250/500 ist derselbe Formsatz mit
    // `idealisation: 'thin-walled'` — erlaubt, weil die Idealisierung eine
    // ANGABE ist und keine Formeigenschaft. Hier liegt der Umrissschwerpunkt
    // OBERHALB des Wandschwerpunkts, der Versatz ist also negativ. Dass das
    // Vorzeichen kippen kann, ohne dass sich etwas anderes ändert, ist der
    // Grund, warum die Vorlage `zs` und `zsWall` GETRENNT bekommt und nicht
    // eine Differenz mit angenommenem Vorzeichen.
    const { zs, zsWall } = tGeometry(2000, 200, 250, 500);
    expect(zs - zsWall).toBeCloseTo(-0.5263, 4);

    const thin = tSectionThinPoints(2000, 200, 250, 500, zs, zsWall);
    // Der Weg schließt am freien Stegende trotzdem auf null: er hängt an
    // `zsWall`, nicht am Vorzeichen des Versatzes.
    expect(thin[6].Sy).toBeCloseTo(0, 12);
    // Und der Schwerpunkt sitzt auch bei DIESEM Gurt am Steg — `zs > hf/2`
    // gilt, solange es unter dem Gurt überhaupt einen Steg gibt. Die
    // kompakte Vorlage liefert an derselben Stelle `t = bf = 2000`.
    expect(thin[8].t).toBe(250);
  });
});

describe('stressPoints verzweigt über die Idealisierung', () => {
  // DER ANSCHLUSS. Die Vorlagen oben sind für sich geprüft; hier steht, dass
  // `stressPoints` sie überhaupt erreicht — vorher verzweigte es AUSSCHLIESSLICH
  // über `shape.kind`, und `idealisation` kam darin nicht vor.
  const iShape = (idealisation: 'solid' | 'thin-walled'): CrossSection => ({
    kind: 'shape',
    id: 'i',
    shape: { kind: 'i-symmetric', h: 80, b: 46, tw: 3.8, tf: 5.2, idealisation },
  });

  it('gibt demselben I zwei verschiedene Antworten', () => {
    // Dieselben vier Zahlen, zwei Idealisierungen — und jetzt auch zwei
    // Spannungspunktsätze. Der Schwerpunkt sagt 11,25 gegen 11,60 cm³.
    expect(Math.abs(points(iShape('solid'))[14].Sy)).toBeCloseTo(11.25, 2);
    expect(Math.abs(points(iShape('thin-walled'))[14].Sy)).toBeCloseTo(11.6, 2);
  });

  it('setzt am Gurt t = b im kompakten und t = tf im dünnwandigen Fall', () => {
    expect(points(iShape('solid'))[1].t).toBe(46);
    expect(points(iShape('thin-walled'))[1].t).toBe(5.2);
  });

  it('reicht dem dünnwandigen T beide Schwerpunkte durch', () => {
    // Der Beleg, dass `zsWall` wirklich ankommt: mit dem Schwerpunkt der
    // Umrissfigur schlösse der Weg am freien Stegende nicht auf null.
    const pts = points({
      kind: 'shape',
      id: 't',
      shape: {
        kind: 't-section',
        bf: 300,
        hf: 15,
        bw: 10,
        h: 200,
        idealisation: 'thin-walled',
      },
    });
    expect(pts).toHaveLength(9);
    expect(pts[6].Sy).toBeCloseTo(0, 12);
    expect(pts[8].t).toBe(10);
  });

  it('lässt den Kasten in beiden Fällen undefined', () => {
    // Ihm fehlen die Referenzdaten, nicht der Weg — `closedBoxPath` hat ihn
    // längst, und kappa fällt daraus.
    for (const idealisation of ['solid', 'thin-walled'] as const) {
      expect(
        stressPoints({
          kind: 'shape',
          id: 'b',
          shape: { kind: 'hollow-rectangle', b: 60, h: 60, t: 6.3, idealisation },
        }),
        idealisation,
      ).toBeUndefined();
    }
  });

  it('meldet unsinnige Masse auch im dünnwandigen Zweig', () => {
    // Die EINE Gültigkeitsprüfung steht vor der Verzweigung und gilt damit
    // für beide Zweige.
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

// ---------------------------------------------------------------------------

function points(cs: CrossSection): readonly StressPoint[] {
  const result = stressPoints(cs);
  if (result === undefined) throw new Error('stressPoints lieferte undefined');
  return result;
}

/**
 * Die beiden Schwerpunkte des T, unabhängig vom `src` noch einmal
 * hingeschrieben — der Test soll die Vorlage prüfen und nicht ihre eigene
 * Eingabe aus derselben Quelle beziehen.
 */
function tGeometry(bf: number, hf: number, bw: number, h: number) {
  const hs = h - hf;
  const zs = (bf * hf * (hf / 2) + bw * hs * (hf + hs / 2)) / (bf * hf + bw * hs);
  const webLength = h - hf / 2;
  const zsWall =
    (bf * hf * (hf / 2) + bw * webLength * (hf / 2 + webLength / 2)) /
    (bf * hf + bw * webLength);
  return { zs, zsWall };
}
