/**
 * Querschnitt x Material -> Elementsteifigkeiten. Der Zwilling von
 * `@baustatik/fem-load-resolve`: Domaeneneingabe hinein, Elementzahlen heraus.
 *
 * KEINE FABRIK, KEINE CLOSURE, KEINE MAP. Solange der Querschnitt
 * Anwendungszustand war, brauchte der Adapter eine Sammlung und musste deshalb
 * `createSectionAdapter(...)` sein. Als MODELLSATZ braucht er sie nicht: die
 * Querschnitte reisen mit dem Modell, und eine reine Funktion, die sie
 * entgegennimmt, hat keinen Zustand, der veralten koennte. Seit ADR 0026 gilt
 * dasselbe fuer das Material — beide Listen kommen als `SectionModel` herein.
 *
 * ZWEI PARAMETER, EINE HERKUNFT. Bis ADR 0027 waren es drei: neben dem Modell
 * kam ein `catalog` herein, und die Naht zwischen „was gespeichert wird" und
 * „was am Nationalen Anhang haengt" lag genau hier. Seit die Moduln als Kopie
 * im Modellsatz stehen, gibt es diese Naht nicht mehr — der ganze FEM-Strang
 * sieht den Anhang nicht einmal. ADR 0026 hielt per Test fest, dass der Anhang
 * die Rechnung nicht bewegt; jetzt kann er es nicht mehr.
 *
 * Warum der Adapter hier und nicht in `cross-section` lebt: `cross-section`
 * bleibt damit frei von `material` und `fem-element`. Der Wertekern haengt
 * nicht am FEM-Strang — er beantwortet „was ist die Flaeche", nicht „wie steif
 * ist der Stab".
 *
 * ZWEI FUNKTIONEN, ZWEI AUFGABEN: `resolveSectionStiffness` loest die IDs auf,
 * `sectionStiffness` rechnet. Die Trennung ist keine Testerleichterung, sondern
 * die Naht zwischen Nachschlagen und Multiplizieren — wer schon
 * `SectionProperties` in der Hand hat (Bemessung, Vorbemessung, ein Diagramm
 * ueber eine Profilreihe), braucht die Auflösung nicht.
 */

import {
  type CrossSection,
  type SectionProperties,
  sectionProperties,
} from '@baustatik/cross-section';
import type { Beam } from '@baustatik/fem';
import type { SectionStiffness } from '@baustatik/fem-element';
import type { ElasticModuli, Material } from '@baustatik/material';

/**
 * MPa -> kN/m2.
 *
 * `1 MPa = 1 N/mm2 = 1e6 N/m2 = 1e3 kN/m2`. Die ganze Einheitenkette haengt an
 * dieser einen Zahl:
 *
 *     material       Es, G [MPa]     -> [kN/m2] = [MPa] * 1000
 *     cross-section  A [m2], Iy [m4]
 *     ------------------------------------------------------------
 *     EA  = E * A            [kN]
 *     EI  = E * Iy           [kNm2]
 *     GAs = kappaZ * G * A   [kN]
 */
const MPA_TO_KN_PER_M2 = 1000;

/**
 * Was die Rechnung vom Material braucht: zwei Moduln, beide in MPa.
 *
 * Der Typ ist seit ADR 0027 in `@baustatik/material` zu Hause, weil er dort ein
 * FELD DES MODELLSATZES ist und nicht mehr nur ein Rechenzwischenwert. Er wird
 * hier weiter herausgereicht: `sectionStiffness(props, moduli)` nimmt ihn, und
 * ein Aufrufer, der nur diese eine Funktion braucht, soll dafuer nicht zwei
 * Packages importieren muessen.
 */
export type { ElasticModuli };

/**
 * Die Multiplikation — Geometrie mal Material.
 *
 * kappa gehoert zu z, weil der ebene Rahmen um y biegt und quer in z schiebt.
 * `kappaZ * G * A` ist ausserdem identisch mit `G * A_s`; ein Test rechnet
 * beide Wege und deckt damit einen vertauschten oder doppelt angewandten
 * kappa-Faktor auf, den die erste Rechnung allein nicht sieht.
 *
 * `kappaZ === undefined` heisst SCHUBSTARR, nicht „kappa = 0". Der Unterschied
 * ist der zwischen einem Stab ohne Schubverformung und einem Stab ohne
 * Steifigkeit; `'rigid'` ist der kanonische, JSON-faehige Weg dafuer.
 *
 * OB Schub ueberhaupt beruecksichtigt wird, entscheidet dieser Adapter NICHT.
 * Das ist eine globale Analyse-Einstellung, und `fem-solver` ersetzt `GAs`
 * bereits durch `'rigid'`, wenn `policy.shearDeformation === false`. Ein
 * zweiter Schalter hier waere ein zweiter Ort fuer dieselbe Entscheidung.
 */
export function sectionStiffness(
  props: SectionProperties,
  moduli: ElasticModuli,
): SectionStiffness {
  const E = moduli.E * MPA_TO_KN_PER_M2;
  const G = moduli.G * MPA_TO_KN_PER_M2;

  return {
    EA: E * props.A,
    EI: E * props.Iy,
    GAs: props.kappaZ === undefined ? 'rigid' : props.kappaZ * G * props.A,
  };
}

/**
 * Was der Resolver vom Modell braucht: die beiden Satzlisten, auf die
 * `Beam.crossSectionId` und `Beam.materialId` zeigen.
 *
 * Ein Objekt statt drei Positionsargumenten — drei Positionen waeren
 * verwechselbar, und ein Store, der beide Listen ohnehin fuehrt, passt so als
 * EIN Stueck hinein: `resolveSectionStiffness(beam, store)`.
 */
export type SectionModel = {
  readonly crossSections: readonly CrossSection[];
  readonly materials: readonly Material[];
};

/**
 * Die Steifigkeiten eines Stabs, oder `undefined`.
 *
 * `undefined` heisst „kenne ich nicht" — unbekannter `crossSectionId`,
 * unbekannter `materialId`, oder ein Querschnitt, dessen Werte sich nicht
 * bilden lassen. „Unbekannte Sorte" steht seit ADR 0027 NICHT mehr in dieser
 * Liste: die Moduln stehen im Satz, also gibt es sie. Ein Tippfehler in der
 * Sorte wird beim ANLEGEN gemeldet, wo er steht. Der Solver-Port
 * `getSectionStiffness` hat genau dieses Vokabular; daraus wird ein
 * Modellfehler IM BERICHT statt einer Ausnahme mitten in `solve()`.
 *
 * Die Auswahl der Familie — frueher ein `switch` ueber `material.kind` mit
 * einem `as SteelGrade` je Zweig — ist hier ersatzlos verschwunden. Sie ist
 * beim Anlegen einmal getroffen worden und im Satz festgehalten.
 *
 * BETON WIRD IN ZUSTAND I GERECHNET — linear-elastisch, Zugzone voll
 * mitwirkend. `Material.moduli` traegt fuer Beton `Ecm` und `G` (ν = 0,2), und
 * das beschreibt genau das. Diese Zeile ist die Stelle, an der die Annahme
 * VOLLZOGEN wird, und sie ist teurer, als sie aussieht:
 *
 * - **Durchbiegungen stimmen nicht.** Im Gebrauchszustand ist beim Stahlbeton
 *   in der Regel ZUSTAND II massgebend; `EI` liegt hier also zu hoch, und die
 *   Verformung faellt zu klein aus. Fuer Schnittgroessen am statisch
 *   bestimmten System ist das folgenlos, fuer einen Verformungsnachweis nicht.
 * - **Es gibt keine nichtlineare Bemessung im GZT.** Ein Verfahren nach
 *   EN 1992-1-1 §5.7 braucht eine last- und rissabhaengige Steifigkeit; die
 *   gibt es hier nicht.
 * - **Die Superposition faellt.** Rissbildung ist LASTABHAENGIG. Sobald sie
 *   mitgerechnet wird, haengt `EI` nicht mehr am Stab allein, sondern am Paar
 *   (Stab, Lastniveau) — und Lastfaelle lassen sich nicht mehr getrennt
 *   rechnen und hinterher summieren.
 *
 * Der letzte Punkt trifft die SIGNATUR, nicht nur den Zahlenwert: der Port
 * `getSectionStiffness(beam)` bekommt keinen Lastfall und kann keinen
 * bekommen, solange die Steifigkeit eine Eigenschaft des Stabes ist. Das ist
 * kein Versaeumnis — es ist die Bauform der Theorie I. Ordnung im Zustand I.
 * Siehe CONTEXT.md, „Zustand I ist die stillschweigende Annahme".
 */
export function resolveSectionStiffness(
  beam: Beam,
  model: SectionModel,
): SectionStiffness | undefined {
  const section = model.crossSections.find(
    (cs) => cs.id === beam.crossSectionId,
  );
  if (section === undefined) return undefined;

  const props = sectionProperties(section);
  if (props === undefined) return undefined;

  const material = model.materials.find((m) => m.id === beam.materialId);
  if (material === undefined) return undefined;

  return sectionStiffness(props, material.moduli);
}
