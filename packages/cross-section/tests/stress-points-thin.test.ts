import { lookupProfile, profilesIn } from '@baustatik/steel-profiles';
import { describe, expect, it } from 'vitest';
import { type CrossSection, type StressPoint, stressPoints } from '../src/index';
import {
  iSymmetricStations,
  tSectionStations,
} from '../src/stress-points/open-stations';
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
 * ES GILT AN ALLEN FÜNFZEHN PUNKTEN, und dort exakt — Nummer für Nummer, ohne
 * Umrechnungstabelle. `rolled-i.ts` führt den Gurt als Wand (`t = tf`,
 * Hebelarm `zf = (h - tf)/2` auf der MITTELLINIE), und alle Gurtgrößen
 * enthalten überhaupt keinen Ausrundungsanteil. Am Steganfang (13/14) ist
 * abgetrennt genau der Gurt, und bei `r = 0` ist `aboveWebStart` nichts
 * anderes als `fromFlange`.
 *
 * DER SCHWERPUNKT KAM ERST MIT ADR 0053 DAZU. Bis dahin lief der Steg des
 * Wandmodells von Gurtmitte zu Gurtmitte (`±zf`) und `rolled-i.ts` über die
 * LICHTE Höhe (`h/2 - tf`) — 11,60 gegen 11,25 cm³ bei IPE-80-Massen. Das war
 * kein Unterschied zweier Idealisierungen, sondern eine doppelt gezählte
 * Gurthälfte; jetzt kacheln die Wände die Umrissfigur, und der Schwerpunkt
 * trifft ebenfalls auf das letzte Bit.
 *
 * DASS DIE NUMMERN SICH DECKEN, ist die eigentliche Nachricht dieses Blocks.
 * Beide Vorlagen lesen dieselbe Elementliste, und die Tabelle ist die
 * Identität. Seit ADR 0059 sind es fünfzehn Punkte statt dreizehn: die beiden
 * Verzweigungsknoten tragen je zwei.
 */

describe('Die dünnwandige I-Vorlage gegen das gewalzte Profil mit r = 0', () => {
  // Die vier Abmessungen jedes Katalogprofils, aber OHNE Ausrundung — also
  // genau das geschweißte I, das die parametrische Form beschreibt.
  const catalogue = [...profilesIn('IPE'), ...profilesIn('HEA')];

  it('trifft an allen 15 Punkten Sy und Sz auf Gleitkommarauschen', () => {
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
      expect(rolled).toHaveLength(15);
      // NUMMER GEGEN NUMMER — beide Vorlagen lesen dieselbe Elementliste, und
      // sie teilen auch die Wand-Ids und die Tangenten.
      for (let nr = 1; nr <= 15; nr++) {
        const wall = thin[nr - 1];
        const printed = rolled[nr - 1];
        expect(printed.wall, `P${nr}.wall`).toBe(wall.wall);
        expect([printed.ty, printed.tz], `P${nr} Tangente`).toEqual([
          wall.ty,
          wall.tz,
        ]);
        for (const key of ['Sy', 'Sz'] as const) {
          // MIT VORZEICHEN. Vorher stand hier ein Betragsvergleich, und er hat
          // verdeckt, dass die beiden Vorlagen verschiedene `Sz`-Vorzeichen
          // fuehrten. Seit beide dieselbe Elementorientierung fuehren, ist der
          // Vergleich total.
          const mine = wall[key];
          const theirs = printed[key];
          expect(
            Math.abs(mine - theirs) <= ULP * Math.abs(theirs),
            `${p.id} P${nr}.${key}: ${mine} vs ${theirs}`,
          ).toBe(true);
        }
      }
    }
  });

  it('setzt an den zwölf Gurtpunkten t = tf, an den drei Stegpunkten t = tw', () => {
    // DER ZWEITE TEIL DES BEFUNDS: das Umrissmodell setzte dort `t = b`, also
    // die SENKRECHTE Schubkomponente durch den ganzen Gurt. Am Gurt eines
    // dünnwandigen Profils bedeutet die nichts — der Schubfluss läuft LÄNGS
    // der Wand und verteilt sich über `tf`.
    for (const p of catalogue) {
      const thin = iSymmetricThinPoints(p.h, p.b, p.tw, p.tf);
      for (let nr = 1; nr <= 12; nr++) {
        expect(thin[nr - 1].t, `${p.id} P${nr}.t`).toBe(p.tf);
      }
      // 13/14 sind der SPRUNG: abgetrennt ist der Gurt, gefuehrt wird die
      // Stegdicke.
      for (const nr of [13, 14, 15]) {
        expect(thin[nr - 1].t, `${p.id} P${nr}.t`).toBe(p.tw);
      }
    }
  });

  it('teilt Koordinaten, Nummern und Wände mit der Stellenliste', () => {
    // Der Zuschnitt: NUR `t` und `S` sind Sache des Wandmodells, die
    // Koordinaten und die Elemente stehen in `iSymmetricStations`. Der Test
    // hält fest, dass die Vorlage nicht an ihr vorbeirechnet.
    const stations = iSymmetricStations(300, 150, 7.1, 10.7);
    const thin = iSymmetricThinPoints(300, 150, 7.1, 10.7);
    expect(thin).toHaveLength(15);
    for (let i = 0; i < 15; i++) {
      expect(thin[i].nr, `P${i + 1}.nr`).toBe(i + 1);
      expect(thin[i].y, `P${i + 1}.y`).toBe(stations[i].y);
      expect(thin[i].z, `P${i + 1}.z`).toBe(stations[i].z);
      expect(thin[i].wall, `P${i + 1}.wall`).toBe(stations[i].wall);
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
    expect(Math.abs(thin[14].Sy)).toBeCloseTo(exact, 9);
    expect(Math.abs(thin[14].Sy)).toBeCloseTo(11.25, 2);
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
    const withFillets = Math.abs(thin[14].Sy) + (2 * aFillet * zFillet) / 1000;
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
        const deviation = (Math.abs(thin[14].Sy) - p.SyMax) / p.SyMax;
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
  // JEDE WAND IST EIN ELEMENT (ADR 0059), orientiert in Richtung des
  // Schubflusses aus einem positiven `Vz`: Obergurt von den Spitzen zum
  // Knoten, Steg nach unten, Untergurt vom Knoten zu den Spitzen. `Sy` und
  // `Sz` sind das erste Flächenmoment des auf DIESEM Element bereits
  // durchlaufenen Teils.
  const I = { h: 300, b: 150, tw: 7.1, tf: 10.7 } as const;
  const thin = () => iSymmetricThinPoints(I.h, I.b, I.tw, I.tf);

  it('hält Sy an allen zwölf Gurtpunkten negativ', () => {
    // DAS KIPPEN IST WEG, und das ist die Nachricht von ADR 0059. Bis dahin
    // lief EINE Richtung (`+y`) durch den ganzen Gurt, und `Sy` kippte an der
    // Stegachse und noch einmal zwischen den Gurten.
    //
    // Jetzt nicht mehr: am OBERGURT ist durchlaufen der nahe Überstand bei
    // `-zf`, am UNTERGURT alles ANDERE — und das erste Flächenmoment eines
    // Komplements ist das Negative des Teils, der bei `+zf` liegt. Beide Male
    // kommt `-zf` heraus.
    expect(thin().map((p) => Math.sign(p.Sy))).toEqual([
      0, -1, -1, -1, -1, 0, //  1-6   Obergurt, an beiden Spitzen null
      0, -1, -1, -1, -1, 0, //  7-12  Untergurt, genauso
      -1, -1, -1, //           13-15  Steg: der Teil oberhalb
    ]);
  });

  it('lässt Sz mit der Elementtangente kippen', () => {
    // HIERHIN IST DIE ZWEIWERTIGKEIT GEWANDERT. Bis ADR 0059 lief `Sz` glatt
    // durch den ganzen Gurt und war am Knoten einwertig, während `Sy` dort
    // kippte. In der Elementkonvention ist es umgekehrt — und genau das zeigt
    // RSTAB unter „Elemente + Spannungspunkte".
    expect(thin().map((p) => Math.sign(p.Sz))).toEqual([
      0, -1, -1, 1, 1, 0, //  1-6   Obergurt: linkes Element negativ
      0, 1, 1, -1, -1, 0, //  7-12  Untergurt: genau umgekehrt
      0, 0, 0, //            13-15  Steg trägt für `Vy` nichts
    ]);
    // Am Knoten: gleiches `Sy`, entgegengesetztes `Sz`.
    expect(thin()[3].Sy).toBeCloseTo(thin()[2].Sy, 12);
    expect(thin()[3].Sz).toBeCloseTo(-thin()[2].Sz, 12);
  });

  it('macht aus Sy den bekannten Schubfluss des I', () => {
    // DIE EIGENTLICHE PROBE. `q = -Vz*Sy/Iy`, positiv heißt „in Richtung der
    // Tangente". Es muss herauskommen: Obergurt von beiden Spitzen zum Steg,
    // Steg nach unten, Untergurt vom Steg zu den Spitzen. Kein Lehrbuch nötig
    // — das Bild kennt jeder.
    //
    // Seit ADR 0059 ist `q` an jedem Gurtpunkt POSITIV, weil jedes Element
    // schon in Flussrichtung orientiert ist. Die Richtung im globalen System
    // liest man an `ty` ab, nicht mehr am Vorzeichen von `Sy`.
    const pts = thin();
    const q = pts.map((p) => -Math.sign(p.Sy));
    expect(q.filter((v) => v < 0)).toHaveLength(0);
    // Der globale y-Anteil des Flusses: nach innen oben, nach außen unten.
    const along = (nr: number) => q[nr - 1] * pts[nr - 1].ty;
    expect([along(2), along(5)]).toEqual([1, -1]); // Obergurt: zum Steg hin
    expect([along(8), along(11)]).toEqual([-1, 1]); // Untergurt: zu den Spitzen
    // Und der Steg: `q > 0` bei `tz = +1`, also nach unten.
    for (const nr of [13, 14, 15]) {
      expect([q[nr - 1], pts[nr - 1].tz], `P${nr}`).toEqual([1, 1]);
    }
  });

  it('führt die Betragsgleichheit der vier gleichwertigen Gurtstellen fort', () => {
    // Was sich NICHT geändert hat: die Beträge. Die vier Stellen an den
    // Stegflanken tragen dasselbe `|Sy|`, und der Grund ist derselbe wie
    // vorher — dass das erste Flächenmoment des ganzen Querschnitts
    // verschwindet.
    const pts = thin();
    for (const nr of [5, 8, 11]) {
      expect(Math.abs(pts[nr - 1].Sy), `P${nr}`).toBeCloseTo(
        Math.abs(pts[1].Sy),
        12,
      );
    }
  });

  it('trägt an jedem Punkt eine Tangente und eine Wand', () => {
    // Gurt waagerecht, Steg senkrecht — und die Wand sagt, welches der beiden
    // Elemente am Knoten gemeint ist. Das Flag `branched` gibt es nicht mehr;
    // es hat nichts mehr zu sagen, seit jeder Punkt genau einen Wert trägt.
    const all = thin();
    for (const nr of [1, 2, 3, 7, 8, 9]) {
      expect([all[nr - 1].ty, all[nr - 1].tz], `P${nr}`).toEqual([
        nr <= 6 ? 1 : -1,
        0,
      ]);
    }
    for (const nr of [4, 5, 6, 10, 11, 12]) {
      expect([all[nr - 1].ty, all[nr - 1].tz], `P${nr}`).toEqual([
        nr <= 6 ? -1 : 1,
        0,
      ]);
    }
    for (const nr of [13, 14, 15]) {
      expect([all[nr - 1].ty, all[nr - 1].tz], `P${nr}`).toEqual([0, 1]);
    }
    // Jede Nummer genau einmal, und genau zwei Punkte je Knotenort.
    expect(new Set(all.map((p) => p.nr)).size).toBe(15);
    const atOrigin = (z: number) =>
      all.filter((p) => p.y === 0 && p.z === z && p.t === I.tf);
    expect(atOrigin(-I.h / 2)).toHaveLength(2);
    expect(atOrigin(I.h / 2)).toHaveLength(2);
  });

  it('stellt am Knoten des T ebenfalls zwei Punkte', () => {
    // Der T verzweigt genauso — ein Gurt, ein Steg darunter, der Knoten auf
    // der Stegachse. Die Stegoberkante (P7) ist KEINE Verzweigung: dort ist
    // der Steg schon eine einzelne Wand, und der Punkt ist ihre erste Stelle.
    const zs = tGeometry(300, 15, 10, 200).zs;
    const t = tSectionThinPoints(300, 15, 10, 200, zs);
    expect(t).toHaveLength(10);
    const [a, b] = [t[2], t[3]];
    expect([a.y, a.z]).toEqual([b.y, b.z]);
    expect(a.wall).toBe('flange-top-left');
    expect(b.wall).toBe('flange-top-right');
    expect(a.Sy).toBeCloseTo(b.Sy, 12);
    expect(a.Sz).toBeCloseTo(-b.Sz, 12);
    expect(a.ty).toBe(-b.ty);
  });
});

/**
 * Simpson ueber drei gleich weit stehende Stuetzstellen. Fuer eine PARABEL ist
 * die Regel exakt, und genau eine Parabel ist der Schubfluss laengs einer Wand
 * in Schubrichtung — deshalb reichen die drei Punkte, die die Vorlage ohnehin
 * fuehrt, fuer ein exaktes Integral.
 */
const simpson = (span: number, a: number, m: number, b: number) =>
  (span / 6) * (a + 4 * m + b);

describe('Die Gleichgewichtsprobe des I', () => {
  // DER TEST, DEN ES OHNE VORZEICHEN NICHT GEBEN KANN. Aus den `S`-Werten
  // fällt ein Schubfluss `q = -V*S/I`; integriert man ihn über die Wände,
  // muss die Querkraft herauskommen, mit der man hineingegangen ist. Ein Feld
  // aus Beträgen besteht diese Probe nie — es integriert sich zu Unsinn, weil
  // die Hälften sich nicht aufheben können, wo sie sich aufheben müssen.
  //
  // SEIT ADR 0059 WIRD PROJIZIERT statt wandweise addiert: der Beitrag einer
  // Stelle zur globalen Querkraft ist `q*ty` bzw. `q*tz`. Das ist allgemeiner
  // und deckt die gemischten Elementrichtungen ab; die Schranken sind
  // unverändert.
  const I = { h: 300, b: 150, tw: 7.1, tf: 10.7 } as const;
  const hw = I.h - 2 * I.tf;
  const Iy = (I.b * I.h ** 3 - (I.b - I.tw) * hw ** 3) / 12;
  const Iz = (2 * I.tf * I.b ** 3 + hw * I.tw ** 3) / 12;
  // `S` steht in cm³, `I` hier in mm⁴ — für einen Vergleich mit 1 muss beides
  // dieselbe Längeneinheit führen.
  const inMm3 = (p: StressPoint, key: 'Sy' | 'Sz') => p[key] * 1000;

  it('leitet Vz über den Steg ab', () => {
    // Der Steg trägt 96,9 % — nicht 100 %, und das ist der Modellfehler des
    // Wandmodells und keine Vorzeichenfrage: die senkrechte Schubkomponente
    // IM GURT gibt es hier nicht (`thin.ts`, „τ quer zur Wand"). Die Schranken
    // halten die Grösse dieses bekannten Fehlers fest.
    const pts = iSymmetricThinPoints(I.h, I.b, I.tw, I.tf);
    /** Der Anteil an der globalen z-Richtung: `q*tz`. */
    const g = (nr: number) =>
      (-inMm3(pts[nr - 1], 'Sy') / Iy) * pts[nr - 1].tz;
    // P13 oben, P15 Schwerpunkt, P14 unten — gleich weit, über die LICHTE Höhe.
    const web = simpson(2 * (I.h / 2 - I.tf), g(13), g(15), g(14));
    expect(web).toBeGreaterThan(0.96);
    expect(web).toBeLessThan(1);
  });

  it('leitet Vy über BEIDE Gurte ab, und beide in dieselbe Richtung', () => {
    // 99,9 %: für `Vy` fehlt nur, was der Steg zu `Iz` beiträgt und nicht zum
    // Fluss. Dass die beiden Gurte sich ADDIEREN und nicht aufheben, ist die
    // Aussage.
    //
    // Über den ganzen Gurt integriert, obwohl er aus ZWEI Elementen besteht:
    // `q*ty` ist als Funktion von `y` durchgehend und gerade, weil beide
    // Elemente ihre eigene Richtung mitbringen. Die Stützstellen sind die
    // beiden Spitzen und der Knoten — und am Knoten liefern beide Punkte
    // denselben projizierten Wert, was der Test gleich mitprüft.
    const pts = iSymmetricThinPoints(I.h, I.b, I.tw, I.tf);
    const g = (nr: number) =>
      (-inMm3(pts[nr - 1], 'Sz') / Iz) * pts[nr - 1].ty;
    expect(g(3)).toBeCloseTo(g(4), 12);
    expect(g(9)).toBeCloseTo(g(10), 12);

    const top = simpson(I.b, g(1), g(3), g(6));
    const bottom = simpson(I.b, g(7), g(9), g(12));
    expect(top).toBeCloseTo(bottom, 12);
    expect(top + bottom).toBeGreaterThan(0.99);
    expect(top + bottom).toBeLessThan(1);
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

  it('liefert 10 Punkte mit den Koordinaten und Wänden der Stellenliste', () => {
    // Die Vorlage liest `tSectionStations`; der Test hält fest, dass sie
    // nicht an der Liste vorbeirechnet.
    const stations = tSectionStations(
      T.bf,
      T.hf,
      T.bw,
      T.h,
      tGeometry(T.bf, T.hf, T.bw, T.h).zs,
    );
    const thin = thinT();
    expect(thin).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(thin[i].nr, `P${i + 1}.nr`).toBe(i + 1);
      expect(thin[i].y, `P${i + 1}.y`).toBe(stations[i].y);
      expect(thin[i].z, `P${i + 1}.z`).toBe(stations[i].z);
      expect(thin[i].wall, `P${i + 1}.wall`).toBe(stations[i].wall);
    }
  });

  it('schließt am freien Stegende (P9/P10) auf S = 0', () => {
    // DIE SELBSTPRÜFUNG, und seit ADR 0053 prüft sie die KACHELUNG. `S` läuft
    // um `zs`, den Schwerpunkt der Umrissfigur; dass der Weg trotzdem auf null
    // schließt, geht nur, wenn Gurt (`bf × hf`) und Steg (`bw × (h − hf)`) die
    // Figur lückenlos und überschneidungsfrei überdecken. Ein Steg ab der
    // Gurtmittellinie ließe hier einen Rest stehen.
    const thin = thinT();
    expect(thin[8].Sy).toBeCloseTo(0, 12);
    expect(thin[9].Sy).toBeCloseTo(0, 12);
  });

  it('liefert an den Gurtspitzen S = 0, am Gurt t = hf, am Steg t = bw', () => {
    const thin = thinT();
    for (const nr of [1, 6]) {
      expect(thin[nr - 1].Sy, `P${nr}.Sy`).toBeCloseTo(0, 12);
      expect(thin[nr - 1].Sz, `P${nr}.Sz`).toBeCloseTo(0, 12);
    }
    for (const nr of [1, 2, 3, 4, 5, 6]) {
      expect(thin[nr - 1].t, `P${nr}.t`).toBe(T.hf);
    }
    for (const nr of [7, 8, 9, 10]) {
      expect(thin[nr - 1].t, `P${nr}.t`).toBe(T.bw);
    }
  });

  it('trägt an der Stegoberkante (P7) genau den Gurt, aber schon bw', () => {
    // DER SPRUNG VON TAU: derselbe Schubfluss muss plötzlich durch `bw` statt
    // `hf`.
    //
    // Abgetrennt ist GENAU der Gurt — nicht mehr. Seit ADR 0053 beginnt der
    // Steg an der Gurtunterkante, und deshalb liefert die Stegformel dort von
    // selbst den Gurtanteil; bis ADR 0059 stand dafür ein eigener Stellentyp
    // `junction` in der Liste.
    const { zs } = tGeometry(T.bf, T.hf, T.bw, T.h);
    const armF = T.hf / 2 - zs;
    const thin = thinT();
    expect(thin[6].t).toBe(T.bw);
    expect(thin[6].Sy).toBeCloseTo((armF * T.hf * T.bf) / 1000, 9);
    // Zwischen Gurt und Schwerpunkt wächst `S` weiter — der Steg trägt bei.
    expect(Math.abs(thin[7].Sy)).toBeGreaterThan(Math.abs(thin[6].Sy));
  });

  it('rechnet den Gurt mit derselben Maschine wie das I', () => {
    // Der halbe Gurt an der Stegachse: `armF * hf * bf/2`. Dieselbe Formel,
    // die beim I gegen die Katalogpunkte geprüft ist — nur mit EINEM Gurt.
    const { zs } = tGeometry(T.bf, T.hf, T.bw, T.h);
    const armF = T.hf / 2 - zs;
    const thin = thinT();
    // P2 sitzt bei y = -bw/2 auf dem linken Element, also fehlt am halben Gurt
    // das Stück bis zur Stegflanke.
    expect(thin[1].Sy).toBeCloseTo(
      (armF * T.hf * (T.bf - T.bw)) / 2 / 1000,
      9,
    );
    expect(thin[1].Sz).toBeCloseTo(
      (T.hf * ((T.bw / 2) ** 2 - (T.bf / 2) ** 2)) / 2 / 1000,
      9,
    );
  });

  it('setzt Punkt 8 GENAU ins Maximum von S', () => {
    // WAS ADR 0053 HIER GEWONNEN HAT. Bis dahin lief `S` um `zsWall` und die
    // Koordinaten um `zs`; der Versatz von 0,30 mm war die benannte Näherung
    // dieser Form, und der Schwerpunktpunkt lag knapp neben dem Maximum. Jetzt
    // gibt es nur noch EINEN Schwerpunkt, also fällt Maximum und Punkt
    // zusammen — und das ist prüfbar: der Stegweg noch einmal von Hand
    // hingeschrieben, an drei Stellen ausgewertet.
    const { zs } = tGeometry(T.bf, T.hf, T.bw, T.h);
    const S = (z: number) =>
      Math.abs(
        T.bf * T.hf * (T.hf / 2 - zs) + (T.bw * (z * z - (T.hf - zs) ** 2)) / 2,
      ) / 1000;

    const atCentroid = Math.abs(thinT()[7].Sy);
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
    expect(Math.abs(thin[8].Sy)).toBeLessThan(1e-12 * Math.abs(thin[7].Sy));
    // Und der Schwerpunkt sitzt auch bei DIESEM Gurt am Steg — `zs > hf/2`
    // gilt, solange es unter dem Gurt überhaupt einen Steg gibt.
    expect(thin[7].t).toBe(250);
  });

  it('trifft unter dem Gurt den waagerechten Schnitt durch die Umrissfigur', () => {
    // DIE FOLGE DER KACHELUNG, und die Probe gegen die Referenz. Unterhalb der
    // Gurtunterkante ist der Wandschnitt DERSELBE Schnitt wie der waagerechte
    // Schnitt durch die Umrissfigur: abgetrennt ist Gurt plus Stegstück,
    // geführt wird `bw`.
    //
    // Bis ADR 0057 stand als Gegenprobe die kompakte Vorlage daneben — vor
    // ADR 0053 lagen die beiden 1,2 % auseinander. Sie ist weg, geblieben ist
    // die Rechnung von Hand: Gurt (`bf·hf` im Abstand `zs − hf/2`) plus
    // Stegstück bis zum Schwerpunkt.
    //
    // Für ein TS 300/200/15/10 druckt die Referenz am Schwerpunkt 240,73 cm³;
    // das ist auf die letzte gedruckte Stelle diese Zahl.
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
    const { zs } = tGeometry(200, 15, 10, 300);
    const flange = 200 * 15 * (zs - 15 / 2);
    const web = 10 * (zs - 15) * ((zs - 15) / 2);
    expect(Math.abs(thin[7].Sy) * 1000).toBeCloseTo(flange + web, 6);
    expect(Math.abs(thin[7].Sy)).toBeCloseTo(240.73, 2);
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
    // Dieselben vier Zahlen, zwei Idealisierungen — und seit ADR 0057 ist die
    // eine Antwort „gar keine". Der kompakte Zweig trug bis dahin das
    // Umrissmodell; es ist keine schwächere Vorlage, sondern eine für eine
    // Figur, die gar kein Schnittmodell hat.
    expect(stressPoints(iShape('solid'))).toBeUndefined();
    expect(points(iShape('thin-walled'))[1].Sy).toBeLessThan(0);
    expect(Math.abs(points(iShape('thin-walled'))[14].Sy)).toBeCloseTo(11.25, 2);
  });

  it('setzt am Gurt t = tf, die Wanddicke und nicht die Gurtbreite', () => {
    // Der Schubfluss läuft LÄNGS des Gurts; die senkrechte Komponente durch
    // die volle Gurtbreite `b` bedeutet an einer Wand nichts.
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
    expect(pts).toHaveLength(10);
    expect(pts[8].Sy).toBeCloseTo(0, 12);
    expect(pts[7].t).toBe(10);
  });

  it('liefert den dünnwandigen Kasten mit 16 Punkten', () => {
    // Er stand hier lange auf `undefined` — ihm fehlten die REFERENZDATEN,
    // nicht der Weg. Die stehen nun für TO 300/200/10 in
    // `tests/fixtures/hollow-rectangle-stress-points.json`; geprüft wird die Vorlage in
    // `stress-points-hollow.test.ts`. Der Kasten hat keinen Verzweigungsknoten,
    // ADR 0059 hat an seiner Punktzahl also nichts geändert.
    const box = (idealisation: 'solid' | 'thin-walled'): CrossSection => ({
      kind: 'shape',
      id: 'b',
      shape: { kind: 'hollow-rectangle', b: 60, h: 60, t: 6.3, idealisation },
    });
    expect(stressPoints(box('thin-walled'))).toHaveLength(16);
    expect(stressPoints(box('solid'))).toBeUndefined();
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
