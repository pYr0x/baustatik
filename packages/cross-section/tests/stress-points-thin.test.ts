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
 * Damit erbt die neue Vorlage die Gültigkeit der gegen den Profilkatalog geprüften
 * Punkte, ohne eine einzige neue Fixture zu kosten — und das ist die Referenz,
 * die CONTEXT.md für jede Vorlage verlangt („eine Vorlage ohne Referenzdaten
 * wäre geraten und nicht gerechnet").
 *
 * ES GILT AN ALLEN DREIZEHN PUNKTEN, und dort exakt — Nummer für Nummer, ohne
 * Umrechnungstabelle. `rolled-i.ts` führt den Gurt als Wand (`t = tf`,
 * Hebelarm `zf = (h - tf)/2` auf der MITTELLINIE), und alle Gurtgrößen
 * enthalten überhaupt keinen Ausrundungsanteil. Am Steganfang (11/12) ist
 * abgetrennt genau der Gurt, und bei `r = 0` ist `aboveWebStart` nichts
 * anderes als `fromFlange`.
 *
 * DER SCHWERPUNKT KAM ERST MIT ADR 0053 DAZU. Bis dahin lief der Steg des
 * Wandmodells von Gurtmitte zu Gurtmitte (`±zf`) und `rolled-i.ts` über die
 * LICHTE Höhe (`h/2 - tf`) — 11,60 gegen 11,25 cm³ bei IPE-80-Massen. Das war
 * kein Unterschied zweier Idealisierungen, sondern eine doppelt gezählte
 * Gurthälfte; jetzt kacheln die Wände die Umrissfigur, und Punkt 13 trifft
 * ebenfalls auf das letzte Bit.
 *
 * DASS DIE NUMMERN SICH DECKEN, ist die eigentliche Nachricht dieses Blocks.
 * Bis ADR 0052 hatte das geschweißte I fünfzehn Punkte in eigener Zählung und
 * brauchte eine Tabelle, um überhaupt mit dem gewalzten verglichen zu werden.
 * Jetzt liest es dieselbe Stellenliste, und die Tabelle ist die Identität.
 */


describe('Die dünnwandige I-Vorlage gegen das gewalzte Profil mit r = 0', () => {
  // Die vier Abmessungen jedes Katalogprofils, aber OHNE Ausrundung — also
  // genau das geschweißte I, das die parametrische Form beschreibt.
  const catalogue = [...profilesIn('IPE'), ...profilesIn('HEA')];

  it('trifft an allen 13 Punkten |Sy| und |Sz| auf Gleitkommarauschen', () => {
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
      // NUMMER GEGEN NUMMER — beide Vorlagen lesen dieselbe Stellenliste.
      for (let nr = 1; nr <= 13; nr++) {
        const wall = thin[nr - 1];
        const printed = rolled[nr - 1];
        for (const key of ['Sy', 'Sz'] as const) {
          const mine = Math.abs(wall[key]);
          const theirs = Math.abs(printed[key]);
          expect(
            Math.abs(mine - theirs) <= ULP * Math.abs(theirs),
            `${p.id} P${nr}.${key}: ${mine} vs ${theirs}`,
          ).toBe(true);
        }
      }
    }
  });

  it('setzt an den zehn Gurtpunkten t = tf, an den drei Stegpunkten t = tw', () => {
    // DER ZWEITE TEIL DES BEFUNDS: das Umrissmodell setzte dort `t = b`, also
    // die SENKRECHTE Schubkomponente durch den ganzen Gurt. Am Gurt eines
    // dünnwandigen Profils bedeutet die nichts — der Schubfluss läuft LÄNGS
    // der Wand und verteilt sich über `tf`.
    for (const p of catalogue) {
      const thin = iSymmetricThinPoints(p.h, p.b, p.tw, p.tf);
      for (let nr = 1; nr <= 10; nr++) {
        expect(thin[nr - 1].t, `${p.id} P${nr}.t`).toBe(p.tf);
      }
      // 11/12 sind der SPRUNG: abgetrennt ist der Gurt, gefuehrt wird die Stegdicke.
      for (const nr of [11, 12, 13]) {
        expect(thin[nr - 1].t, `${p.id} P${nr}.t`).toBe(p.tw);
      }
    }
  });

  it('teilt Koordinaten und Nummern mit der kompakten Vorlage', () => {
    // Der Zuschnitt: NUR `t` und `S` wechseln aufs Wandmodell. Dass die
    // Koordinaten sich decken, ist seit ADR 0052 keine Absprache mehr,
    // sondern Bauart — beide lesen `iSymmetricStations`. Der Test bleibt
    // trotzdem stehen: er hält fest, dass der Dispatch keine der beiden
    // Vorlagen an der Liste vorbeiführt.
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
    expect(thin).toHaveLength(13);
    for (let i = 0; i < 13; i++) {
      expect(thin[i].nr, `P${i + 1}.nr`).toBe(solid[i].nr);
      expect(thin[i].y, `P${i + 1}.y`).toBe(solid[i].y);
      expect(thin[i].z, `P${i + 1}.z`).toBe(solid[i].z);
    }
  });
});

describe('Der Schwerpunkt des dünnwandigen I: die Kachelung (ADR 0053)', () => {
  // DER BEFUND, um den es hier geht, und die Kehrtwende gegenüber dem Stand
  // davor. Der Steg des Wandmodells lief von GURTMITTE zu Gurtmitte und
  // lieferte 11,60 cm³ — auffällig nah an `Sy,max` = 11,61 des Katalogs.
  // Diese Nähe war ZUFALL, und der Zufall ist bezifferbar: der Katalogwert
  // gehört zum GEWALZTEN Profil, dessen Ausrundungen 0,361 cm³ beitragen
  // (2 * r²(1-pi/4) * (h/2 - tf - 0,2234r)), und die doppelt gezählte
  // Gurthälfte des Mittellinienmodells trägt 0,357 cm³. Zwei verschiedene
  // Dinge, fast dieselbe Zahl.
  //
  // Das geschweißte I hat keine Ausrundung. Sein richtiger Wert ist der der
  // Umrissfigur, und den liefert die Kachelung.
  const IPE_80 = { h: 80, b: 46, tw: 3.8, tf: 5.2 } as const;

  it('liefert 11,25 cm³ — den Wert der Umrissfigur', () => {
    const thin = iSymmetricThinPoints(IPE_80.h, IPE_80.b, IPE_80.tw, IPE_80.tf);
    const { h, b, tw, tf } = IPE_80;
    // Von Hand: Gurt mal Mittellinienhebel plus lichte halbe Steghöhe.
    const exact = (b * tf * ((h - tf) / 2) + (tw * (h / 2 - tf) ** 2) / 2) / 1000;
    expect(Math.abs(thin[12].Sy)).toBeCloseTo(exact, 9);
    expect(Math.abs(thin[12].Sy)).toBeCloseTo(11.25, 2);
  });

  it('erklärt die Lücke zum Katalogwert 11,61 mit der Ausrundung', () => {
    // Der Katalog ist der unabhängige Zeuge — aber er beschreibt ein anderes
    // Profil. Rechnet man die zwei Ausrundungen OBERHALB der Schwerachse
    // hinzu, schließt sich die Lücke auf 0,02 %. Genau das ist der Beleg
    // dafür, dass 11,25 richtig ist und 11,61 einer anderen Form gehört.
    const row = lookupProfile('IPE 80');
    if (row === undefined) throw new Error('IPE 80 fehlt im Katalog');
    const { h, tw, tf } = IPE_80;
    const r = row.r;
    const aFillet = r * r * (1 - Math.PI / 4);
    const zFillet = h / 2 - tf - (r * (10 - 3 * Math.PI)) / (3 * (4 - Math.PI));
    const thin = iSymmetricThinPoints(IPE_80.h, IPE_80.b, tw, tf);
    const withFillets = Math.abs(thin[12].Sy) + (2 * aFillet * zFillet) / 1000;
    expect((withFillets - row.SyMax) / row.SyMax).toBeCloseTo(0, 3);
  });

  it('bleibt über den ganzen Katalog unter dem Tabellenwert', () => {
    // GLEICHGERICHTET, NICHT STREUEND — und das ist die eigentliche Aussage.
    // Das fehlende Material sitzt an der Ausrundung, also fehlt es IMMER und
    // nie umgekehrt. Streute das Vorzeichen, wäre es kein Modellunterschied,
    // sondern ein Fehler.
    //
    // Die Spanne ist eine CHARAKTERISIERUNG: HEA 1000 liegt 2,7 % darunter,
    // HEA 260 5,8 %. Vor ADR 0053 reichte sie von 0,05 % (IPE 80) bis 4,6 %,
    // und die 0,05 % waren die zufällige Deckung, die den falschen Steg
    // jahrelang gedeckt hat.
    let worst = 0;
    let best = -1;
    for (const series of ['IPE', 'HEA'] as const) {
      for (const p of profilesIn(series)) {
        const thin = iSymmetricThinPoints(p.h, p.b, p.tw, p.tf);
        const deviation = (Math.abs(thin[12].Sy) - p.SyMax) / p.SyMax;
        expect(deviation, `${p.id}`).toBeLessThan(0);
        worst = Math.min(worst, deviation);
        best = Math.max(best, deviation);
      }
    }
    expect(worst).toBeGreaterThan(-0.06);
    expect(best).toBeLessThan(-0.025);
  });
});

describe('Die Vorzeichenkonvention der dünnwandigen Vorlagen', () => {
  // Sie führen die Konvention der PARAMETRISCHEN Formen, nicht einer Umlaufzählung:
  // `Sy`/`Sz` ist das erste Flächenmoment des Teils OBERHALB bzw. LINKS vom
  // Punkt, also durchweg <= 0. Ein Vorzeichen aus einem Umlaufmodell kodiert stattdessen die
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
    // Der sichtbare Unterschied zu einem Umlaufmodell: dort ist `Sz` an Punkt 8 das
    // Negative von Punkt 3. Hier sind beide gleich, weil „links vom Punkt"
    // nicht weiß, an welchem Gurt es steht.
    const thin = iSymmetricThinPoints(300, 150, 7.1, 10.7);
    expect(thin[7].Sz).toBe(thin[2].Sz); // P8 (unten Mitte) gegen P3 (oben)
    expect(thin[7].Sy).toBe(thin[2].Sy);
  });
});

describe('Die dünnwandige T-Vorlage', () => {
  // Ein geschweißtes T-Profil ist ein echter Stahlquerschnitt, also bekommt
  // die Form eine Vorlage. Ihr Orakel ist die
  // SELBSTPRÜFUNG des Weges: er muss am freien Stegende auf null schließen.
  const T = { bf: 300, hf: 15, bw: 10, h: 200 } as const;

  const thinT = () =>
    tSectionThinPoints(
      T.bf,
      T.hf,
      T.bw,
      T.h,
      tGeometry(T.bf, T.hf, T.bw, T.h).zs,
    );

  it('liefert 9 Punkte mit den Koordinaten der kompakten Vorlage', () => {
    // Beide lesen `tSectionStations`; der Test hält fest, dass der Dispatch
    // keine der beiden Vorlagen an der Liste vorbeiführt.
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

  it('schließt am freien Stegende (P8/P9) auf S = 0', () => {
    // DIE SELBSTPRÜFUNG, und seit ADR 0053 prüft sie die KACHELUNG. `S` läuft
    // um `zs`, den Schwerpunkt der Umrissfigur; dass der Weg trotzdem auf null
    // schließt, geht nur, wenn Gurt (`bf × hf`) und Steg (`bw × (h − hf)`) die
    // Figur lückenlos und überschneidungsfrei überdecken. Ein Steg ab der
    // Gurtmittellinie ließe hier einen Rest stehen.
    const thin = thinT();
    expect(thin[7].Sy).toBeCloseTo(0, 12);
    expect(thin[8].Sy).toBeCloseTo(0, 12);
  });

  it('liefert an den Gurtspitzen S = 0, am Gurt t = hf, am Steg t = bw', () => {
    const thin = thinT();
    for (const nr of [1, 5]) {
      expect(thin[nr - 1].Sy, `P${nr}.Sy`).toBeCloseTo(0, 12);
      expect(thin[nr - 1].Sz, `P${nr}.Sz`).toBeCloseTo(0, 12);
    }
    for (const nr of [1, 2, 3, 4, 5]) {
      expect(thin[nr - 1].t, `P${nr}.t`).toBe(T.hf);
    }
    for (const nr of [6, 7, 8, 9]) {
      expect(thin[nr - 1].t, `P${nr}.t`).toBe(T.bw);
    }
  });

  it('trägt an der Stegoberkante (P6) genau den Gurt, aber schon bw', () => {
    // DER SPRUNG VON TAU, und der Punkt, den die Vorlage bis ADR 0052 nicht
    // hatte: derselbe Schubfluss muss plötzlich durch `bw` statt `hf`.
    //
    // Abgetrennt ist GENAU der Gurt — nicht mehr. Den Stegweg zu benutzen
    // zählte das Stück zwischen Gurtmittellinie und Gurtunterkante ein
    // zweites Mal; das ist dieselbe Ecklücke, die beim Kasten `t³/8` hieß.
    const { zs } = tGeometry(T.bf, T.hf, T.bw, T.h);
    const armF = T.hf / 2 - zs;
    const thin = thinT();
    expect(thin[5].t).toBe(T.bw);
    expect(thin[5].Sy).toBeCloseTo((armF * T.hf * T.bf) / 1000, 9);
    // Zwischen Gurt und Schwerpunkt wächst `S` weiter — der Steg trägt bei.
    expect(Math.abs(thin[6].Sy)).toBeGreaterThan(Math.abs(thin[5].Sy));
  });

  it('rechnet den Gurt mit derselben Maschine wie das I', () => {
    // Der halbe Gurt an der Stegachse: `armF * hf * bf/2`. Dieselbe Formel,
    // die beim I gegen die Katalogpunkte geprüft ist — nur mit EINEM Gurt.
    const { zs } = tGeometry(T.bf, T.hf, T.bw, T.h);
    const armF = T.hf / 2 - zs;
    const thin = thinT();
    // P2 sitzt bei y = -bw/2, also fehlt am halben Gurt das Stück bis zur
    // Stegflanke.
    expect(thin[1].Sy).toBeCloseTo(
      (armF * T.hf * (T.bf - T.bw)) / 2 / 1000,
      9,
    );
    expect(thin[1].Sz).toBeCloseTo(
      (T.hf * ((T.bw / 2) ** 2 - (T.bf / 2) ** 2)) / 2 / 1000,
      9,
    );
  });

  it('setzt Punkt 7 GENAU ins Maximum von S', () => {
    // WAS ADR 0053 HIER GEWONNEN HAT. Bis dahin lief `S` um `zsWall` und die
    // Koordinaten um `zs`; der Versatz von 0,30 mm war die benannte Näherung
    // dieser Form, und Punkt 7 lag knapp neben dem Maximum. Jetzt gibt es nur
    // noch EINEN Schwerpunkt, also fällt Maximum und Punkt zusammen — und das
    // ist prüfbar: der Stegweg noch einmal von Hand hingeschrieben, an drei
    // Stellen ausgewertet.
    const { zs } = tGeometry(T.bf, T.hf, T.bw, T.h);
    const S = (z: number) =>
      Math.abs(
        T.bf * T.hf * (T.hf / 2 - zs) + (T.bw * (z * z - (T.hf - zs) ** 2)) / 2,
      ) / 1000;

    const atCentroid = Math.abs(thinT()[6].Sy);
    expect(atCentroid).toBeCloseTo(S(0), 9);
    expect(S(-0.5)).toBeLessThan(atCentroid);
    expect(S(0.5)).toBeLessThan(atCentroid);
  });

  it('kacheln Gurt und Steg auch beim breiten Gurt die Umrissfigur', () => {
    // Der Plattenbalken 2000/200/250/500 ist derselbe Formsatz mit
    // `idealisation: 'thin-walled'` — erlaubt, weil die Idealisierung eine
    // ANGABE ist und keine Formeigenschaft. Bis ADR 0053 war er der Fall, in
    // dem der Versatz `zs - zsWall` das VORZEICHEN wechselte (-0,53 mm statt
    // +0,30 mm); genau daran hing, dass die Vorlage zwei Schwerpunkte
    // getrennt bekommen musste. Jetzt gibt es nichts mehr zu unterscheiden.
    const { zs } = tGeometry(2000, 200, 250, 500);
    const thin = tSectionThinPoints(2000, 200, 250, 500, zs);

    // Der Weg schließt am freien Stegende auf null — mit demselben `zs`, um
    // den auch die Koordinaten laufen. RELATIV geprüft, weil diese Form mit
    // 2 m Gurtbreite bei `S` in der Größenordnung 10^4 cm³ liegt: eine
    // absolute Schranke von 1e-12 wäre dort schärfer als die doppelte
    // Genauigkeit der Zwischenwerte.
    expect(Math.abs(thin[7].Sy)).toBeLessThan(1e-12 * Math.abs(thin[6].Sy));
    // Und der Schwerpunkt sitzt auch bei DIESEM Gurt am Steg — `zs > hf/2`
    // gilt, solange es unter dem Gurt überhaupt einen Steg gibt. Die
    // kompakte Vorlage liefert an derselben Stelle `t = bf = 2000`.
    expect(thin[6].t).toBe(250);
  });

  it('trifft unter dem Gurt dieselben Zahlen wie das Umrissmodell', () => {
    // DIE FOLGE DER KACHELUNG, und die Probe gegen die Referenz. Unterhalb der
    // Gurtunterkante ist der Wandschnitt DERSELBE Schnitt wie der waagerechte
    // Schnitt durch die Umrissfigur: abgetrennt ist Gurt plus Stegstück,
    // geführt wird `bw`. Beide Idealisierungen müssen dort dieselbe Zahl
    // liefern — vor ADR 0053 lagen sie 1,2 % auseinander.
    //
    // Für ein TS 300/200/15/10 druckt die Referenz an Punkt 7 (Schwerpunkt) 240,73
    // cm³; das ist auf die letzte gedruckte Stelle diese Zahl.
    const solid = points({
      kind: 'shape',
      id: 't',
      shape: { kind: 't-section', bf: 200, hf: 15, bw: 10, h: 300, idealisation: 'solid' },
    });
    const thin = points({
      kind: 'shape',
      id: 't',
      shape: {
        kind: 't-section',
        bf: 200,
        hf: 15,
        bw: 10,
        h: 300,
        idealisation: 'thin-walled',
      },
    });
    for (const nr of [6, 7, 8, 9]) {
      expect(thin[nr - 1].Sy, `P${nr}`).toBeCloseTo(solid[nr - 1].Sy, 12);
    }
    expect(Math.abs(thin[6].Sy)).toBeCloseTo(240.73, 2);
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
    // Dieselben vier Zahlen, zwei Idealisierungen, zwei Spannungspunktsätze.
    //
    // AM SCHWERPUNKT SAGEN SIE SEIT ADR 0053 DASSELBE (11,25 cm³), und das ist
    // kein Rückschritt: unterhalb des Gurts ist der Wandschnitt derselbe
    // Schnitt wie der waagerechte. Der Unterschied sitzt dort, wo die beiden
    // Modelle wirklich etwas Verschiedenes behaupten — IM GURT. Das
    // Wandmodell lässt den Schubfluss längs laufen (`Sy != 0`), das
    // Umrissmodell schneidet waagerecht und findet an der Außenfaser nichts.
    expect(points(iShape('solid'))[1].Sy).toBe(0);
    expect(points(iShape('thin-walled'))[1].Sy).toBeLessThan(0);
    expect(Math.abs(points(iShape('solid'))[12].Sy)).toBeCloseTo(11.25, 2);
  });

  it('setzt am Gurt t = b im kompakten und t = tf im dünnwandigen Fall', () => {
    expect(points(iShape('solid'))[1].t).toBe(46);
    expect(points(iShape('thin-walled'))[1].t).toBe(5.2);
  });

  it('reicht dem dünnwandigen T seinen Schwerpunkt durch', () => {
    // Der Beleg, dass `zs` wirklich ankommt: käme dort etwas anderes an,
    // schlösse der Weg am freien Stegende nicht auf null.
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
    expect(pts[7].Sy).toBeCloseTo(0, 12);
    expect(pts[6].t).toBe(10);
  });

  it('liefert den Kasten in beiden Fällen mit 16 Punkten', () => {
    // Er stand hier lange auf `undefined` — ihm fehlten die REFERENZDATEN,
    // nicht der Weg. Die stehen nun für TO 300/200/10 in
    // `tests/fixtures/hollow-rectangle-stress-points.json`; geprüft wird die Vorlage in
    // `stress-points-hollow.test.ts`. Hier bleibt nur, dass der Dispatch
    // beide Zweige trifft.
    for (const idealisation of ['solid', 'thin-walled'] as const) {
      expect(
        stressPoints({
          kind: 'shape',
          id: 'b',
          shape: { kind: 'hollow-rectangle', b: 60, h: 60, t: 6.3, idealisation },
        }),
        idealisation,
      ).toHaveLength(16);
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
 * Der Schwerpunkt des T, unabhängig vom `src` noch einmal hingeschrieben — der
 * Test soll die Vorlage prüfen und nicht ihre eigene Eingabe aus derselben
 * Quelle beziehen.
 *
 * EINER, nicht zwei. Bis ADR 0053 stand hier auch `zsWall`, der Schwerpunkt
 * des Mittellinienmodells; die Spannungspunkte brauchen ihn nicht mehr. Für
 * kappa gibt es ihn weiter, in `shapes/t-section.ts`.
 */
function tGeometry(bf: number, hf: number, bw: number, h: number) {
  const hs = h - hf;
  const zs = (bf * hf * (hf / 2) + bw * hs * (hf + hs / 2)) / (bf * hf + bw * hs);
  return { zs };
}
