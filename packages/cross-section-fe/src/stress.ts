/**
 * Die zweite Tuer: σ und τ im gezeichneten Vollquerschnitt — REIN UND SYNCHRON
 * ([ADR 0061](../../../docs/adr/0061-the-fe-stress-is-a-vector-at-a-node.md)).
 *
 * Sie bekommt die geloesten Felder, eine Schnittgroesse und ein bekanntes ν und
 * gibt ein Feld heraus. Sie vernetzt nicht, sie loest nicht und sie speichert
 * nichts.
 *
 * ```text
 * σ   = N/A + cy·y + cz·z                      geschlossen, ohne Drehung
 * τ   = τ_V + τ_T                              komponentenweise
 * σv  = sqrt(σ² + 3·(τ_y² + τ_z²))
 * ```
 *
 * SIE LEIHT `StressAtPoint` NICHT. τ ist an einem Netzknoten ein VEKTOR an
 * einem Ort ohne ausgezeichnete Richtung, duennwandig ein vorzeichenbehafteter
 * Fluss entlang einer bekannten Wandtangente. Ein gemeinsamer Record muesste
 * `wall`, `ty`, `tz` erfinden — dasselbe Argument, mit dem ADR 0054 der FE
 * bereits verbietet, `S` und `t` zu erfinden. Geteilt ist σv als FORMEL, nicht
 * als Typ; deshalb gibt es hier keine Abhaengigkeit auf
 * `@baustatik/cross-section-stress`.
 *
 * KEIN MATERIAL, NUR ν. In einer elastischen Rueckrechnung am homogenen
 * Querschnitt kommen `E` und `G` nirgends vor.
 *
 * KEIN MAXIMUM UND KEIN „MASSGEBENDER PUNKT" (ADR 0056). Welcher Knoten ein
 * Nachweispunkt ist, haengt am Nachweis und gehoert in die Bemessungsstelle.
 */

import { atOrThrow } from '@baustatik/core';
import type { SectionForces } from '@baustatik/section-forces';
import type { MPa, mm } from '@baustatik/units';
import { rotateFrame } from './assemble';
import type { FEFields } from './compute';
import { InvalidPoissonRatioError } from './errors';
import { type BoundaryEdge, elementNodes, type FESection } from './prepare';
import {
  edgeShapeDerivatives,
  elementPoints,
  TRIANGLE_CENTROID,
  TRIANGLE_NODES,
  type TrianglePoint,
} from './tri6';
import { KN_TO_N, KNM_TO_NM, M_TO_MM, PA_TO_MPA } from './units';

/**
 * Die Spannungen an EINEM Netzknoten — die NACHWEISFORM.
 *
 * Flaechengewichtet aus den Elementwerten an diesem Knoten gemittelt, und sie
 * traegt damit den RAND. Die Glaettung wird nicht verschwiegen: ihr groesster
 * Sprung steht in `FEStressDiagnostics`.
 */
export type StressAtNode = {
  /** Die Knotennummer des Netzes — TRANSIENT wie das Netz selbst (ADR 0039). */
  readonly nr: number;
  /** Ort, RELATIV ZUM SCHWERPUNKT [mm], im Eingabesystem des Umrisses. */
  readonly y: mm;
  readonly z: mm;
  /** Normalspannung [MPa], positiv = Zug. */
  readonly sigma: MPa;
  /**
   * Die beiden Komponenten der Schubspannung [MPa], im Eingabesystem.
   *
   * ZWEI ZAHLEN UND KEINE, weil es im Feld keine ausgezeichnete Richtung gibt,
   * auf die sich ein Vorzeichen beziehen koennte (ADR 0061). Sie tragen den
   * Querkraft- UND den Torsionsanteil, komponentenweise addiert — Betraege zu
   * addieren gaebe dort, wo die beiden gegenlaeufig sind, eine Spannung, die es
   * nicht gibt.
   */
  readonly tauY: MPa;
  readonly tauZ: MPa;
  /**
   * Vergleichsspannung nach von Mises [MPa]:
   * `sqrt(σ² + 3·(τ_y² + τ_z²))`.
   *
   * Der Saint-Venant-Stab hat exakt `σ_x`, `τ_xy` und `τ_xz`; mit
   * `σ_y = σ_z = τ_yz = 0` faellt von Mises auf diese Form zusammen. Der Faktor
   * 3 kommt aus der Gestaltaenderungsenergie und nicht aus EN 1993 — es steht
   * keine Festigkeit in dieser Formel (ADR 0054/0056).
   */
  readonly sigmaV: MPa;
};

/**
 * Die Spannungen in EINEM Element — das ROHBILD, ungeglaettet.
 *
 * Ein Wert je Dreieck, im Elementschwerpunkt. **Nicht glatter als die
 * Knotenform, sondern groeber** (eine Facette je Dreieck). Punktweise genauer,
 * weil der Gradient eines C0-Feldes im Inneren besser ist als an den Ecken —
 * und die Punkte liegen **nie am Rand**, unterschaetzen das Maximum also
 * systematisch. Deshalb ist `nodes` die Nachweisform und das hier das Bild.
 */
export type StressAtElement = {
  /** Die Elementnummer des Netzes. */
  readonly nr: number;
  /** Der Elementschwerpunkt, RELATIV ZUM SCHWERPUNKT DER FIGUR [mm]. */
  readonly y: mm;
  readonly z: mm;
  /** Normalspannung [MPa], positiv = Zug. */
  readonly sigma: MPa;
  /** Die beiden Komponenten der Schubspannung [MPa], im Eingabesystem. */
  readonly tauY: MPa;
  readonly tauZ: MPa;
  /** Vergleichsspannung nach von Mises [MPa]. */
  readonly sigmaV: MPa;
};

/**
 * Was die Rueckrechnung ueber sich selbst weiss — DIAGNOSE, KEIN VERTRAG.
 *
 * WARUM DIE KNOTENNUMMERN MITREISEN: bei einer Figur mit einspringender Ecke
 * konvergieren `maxJump` und `maxBoundaryTraction` NICHT, weil der singulaere
 * Knoten sie dominiert. Ohne die Nummer daneben liest sich das wie ein Bug, und
 * jemand faengt an, das Mitteln zu reparieren.
 *
 * KEINE GLEICHGEWICHTSDIAGNOSE ZUR LAUFZEIT. `∫τ_z dA = Vz` ist durch
 * Linearitaet schon erfuellt, wenn `equilibriumZ` es fuer das Einheitsfeld ist.
 * Als TEST ist die Probe wertvoll — dort prueft sie die Rahmenalgebra mit.
 */
export type FEStressDiagnostics = {
  /**
   * Groesster Elementsprung an einem Knoten, `max_e |τ_e − τ̄|`, bezogen auf
   * `max|τ̄|` ueber das ganze Feld.
   *
   * Damit ist die Glaettung SICHTBAR statt still. σ steht nicht darin: es ist
   * geschlossen und ueber Elementgrenzen stetig.
   */
  readonly maxJump: number;
  /** Der Knoten, an dem `maxJump` steht; `-1`, wenn τ identisch null ist. */
  readonly maxJumpNode: number;
  /**
   * `max|τ̄·n|` ueber die Randknoten, bezogen auf `max|τ̄|`.
   *
   * Exakt gilt `τ·n = 0` auf dem freien Rand; die FE erfuellt das nur schwach.
   * DIE NORMALKOMPONENTE WIRD NICHT HERAUSPROJIZIERT — das saehe richtig aus
   * und waere Erfindung. An einem Eckknoten ist `n` mehrdeutig; genommen wird
   * das Maximum ueber die anliegenden Randkanten.
   */
  readonly maxBoundaryTraction: number;
  /** Der Knoten dazu; `-1`, wenn τ identisch null ist. */
  readonly maxBoundaryTractionNode: number;
  /**
   * Knoten mit Materialinnenwinkel groesser als π.
   *
   * Dort ist `τ ~ r^(−1/3)` — in der KONTINUIERLICHEN Loesung, nicht erst im
   * Netz. Der Knotenwert waechst mit jeder Verfeinerung. Er wird nicht
   * gefiltert und nicht gekappt, sondern BENANNT.
   */
  readonly reentrantCorners: readonly number[];
};

/** Das Spannungsfeld: zwei Formen aus EINEM Durchlauf, und die Diagnosen. */
export type FEStressField = {
  /** Die Nachweisform, eine Zeile je Netzknoten, in Knotenreihenfolge. */
  readonly nodes: readonly StressAtNode[];
  /** Das Rohbild, eine Zeile je Element, in Elementreihenfolge. */
  readonly elements: readonly StressAtElement[];
  readonly diagnostics: FEStressDiagnostics;
};

/**
 * Die sieben Abtastorte je Element: erst die sechs Knoten, dann der Schwerpunkt.
 *
 * EIN AUFRUF STATT ZWEIER. Beide Formen fallen aus DEMSELBEN Durchlauf — zwei
 * Tueren waeren zwei Durchlaeufe und die Moeglichkeit, sie mit verschiedenem
 * `nu` zu rufen.
 */
const SAMPLE: readonly TrianglePoint[] = Object.freeze([
  ...TRIANGLE_NODES,
  ...TRIANGLE_CENTROID,
]);

/** Der Index des Schwerpunkts in `SAMPLE`. */
const CENTROID = TRIANGLE_NODES.length;

/**
 * Ab wann eine Ecke als einspringend gilt [rad].
 *
 * NICHT NULL, UND DAS IST KEINE BEQUEMLICHKEIT: ein diskretisierter runder
 * Rand ist polygonal an JEDEM Knoten minimal einspringend, wenn er ein Loch
 * begrenzt — bei 360 Segmenten um 0,017 rad. Dort ist `τ ~ r^(λ−1)` mit
 * `λ − 1 ≈ −0,0007`, also keine Singularitaet, die irgendjemand messen kann.
 * Ohne Schranke meldete ein rundes Loch hundert „einspringende Ecken" und die
 * Diagnose waere unbrauchbar. Fuenf Grad trennt die Diskretisierung eines
 * glatten Randes von einer gezeichneten Innenecke.
 */
const REENTRANT_TOLERANCE = Math.PI / 36;

/**
 * σ, τ und σv aus den geloesten Feldern, fuer EINE Schnittgroesse und EIN ν.
 *
 * ### σ — geschlossen, ohne Drehung
 *
 * Im schwerpunktsbezogenen EINGABESYSTEM, mit `A`, `Iy`, `Iz`, `Iyz` AUS DEM
 * NETZ und nicht aus Green — gerechnet wurde auf dieser Flaeche:
 *
 * ```text
 * D  = Iy·Iz − Iyz²
 * cy = −(Mz·Iy + My·Iyz)/D
 * cz =  (My·Iz + Mz·Iyz)/D
 * σ  = N/A + cy·y + cz·z
 * ```
 *
 * Dieselbe Aufloesung wie in `cross-section-stress/src/field.ts`, hier zum
 * zweiten Mal hingeschrieben (ADR 0061). Die Vorzeichen sind nicht gewaehlt,
 * sondern das Kreuzprodukt: `My = +∫z·σ dA`, `Mz = −∫y·σ dA` (ADR 0060). Bei
 * `Iyz = 0` faellt es auf `N/A − Mz·y/Iz + My·z/Iy` zusammen. σ braucht die
 * Hauptachsen NICHT.
 *
 * ### τ — Zerlegung, Ueberlagerung, Rueckdrehung
 *
 * ```text
 * m           = nu/(1 + nu)
 * (Vy', Vz')  = ( Vy·cosθ + Vz·sinθ , −Vy·sinθ + Vz·cosθ )
 *
 * je Rahmen F ∈ {Z, Y}, in DESSEN Koordinaten (yF, zF) mit IyF:
 *   τF_y = ψ0F,y + m·ψ1F,y
 *   τF_z = (ψ0F,z − zF²/(2·IyF)) + m·(ψ1F,z + yF²/(2·IyF))
 *
 * in Hauptachsen:
 *   τ'_y = Vz'·τZ_y + Vy'·τY_z
 *   τ'_z = Vz'·τZ_z − Vy'·τY_y
 *
 * zurueck ins Eingabesystem:
 *   τ_V  = ( τ'_y·cosθ − τ'_z·sinθ , τ'_y·sinθ + τ'_z·cosθ )
 * ```
 *
 * DIE BEIDEN VORZEICHEN IN DER UEBERLAGERUNG FALLEN AUS `frameY = theta + π/2`:
 * dort ist `frameY.y = frameZ.z` und `frameY.z = −frameZ.y`, ein Einheits-`Vz`
 * in `frameY` ist also ein Lastfall in `−y'`. SIE SIND BEI `theta = 0` BEREITS
 * SCHARF — `frameY` ist auch dann um 90° gedreht.
 *
 * ### Torsion — die Tuer schliesst das Gleichgewicht selbst
 *
 * `(Vy, Vz, Mt)` ist die vollstaendige Resultierende der Schubspannungen,
 * bezogen auf den Schwerpunkt. Eine „Querkraft mit Exzentrizitaet" IST dieses
 * Paar; ein zusaetzlicher Angriffspunkt gaebe dieselbe Information zweimal. Das
 * Biegeschubfeld traegt bereits ein Moment, und der Rest ist Saint-Venant:
 *
 * ```text
 * Mt_SV = Mt − ( Vz'·T_Z(m) − Vy'·T_Y(m) )      T_F(m) = torque + m·torqueSlope
 * τ_T   = (Mt_SV/It) · ( ω,y − z , ω,z + y )    ω ungedreht, schwerpunktsbezogen
 * ```
 *
 * ES IST `torque` UND NICHT `yM`/`zM`. `compute.ts` bildet
 * `uM = torque − projection`, den Schubmittelpunkt nach TREFFTZ. Fuer das
 * Momentengleichgewicht zaehlt das ROHE Moment des geloesten Feldes — der
 * Schubmittelpunkt nach WEBER. Wer `yM` einsetzt, verletzt
 * `∫(y·τ_z − z·τ_y) dA = Mt` um `projection`, ohne dass etwas wirft.
 *
 * Folge: **`Mt = 0` ist bei unsymmetrischer Figur kein torsionsfreier Fall.**
 * Ein U-Profil, dessen Querkraft durch den Schwerpunkt laeuft, verdreht sich.
 *
 * KEINE WOELBKRAFTTORSION. `Mt` bleibt Saint-Venant; bei einer offenen Figur
 * mit behinderter Verwoelbung ist das die unsichere Seite (ADR 0061).
 *
 * BEWUSST UNGESCHUETZT SIND `D === 0` UND `A === 0`. Fuer jedes `FESection`,
 * das durch `prepareSection` gekommen ist, gilt `A > 0` (es wirft sonst) und
 * `D > 0`; ein zweites Gate daneben waeren zwei Antworten auf dieselbe Frage.
 *
 * @throws {InvalidPoissonRatioError} wenn `nu` nicht endlich oder ausserhalb
 *   `[0, 0,5)` liegt.
 */
export function recoverStresses(
  fields: FEFields,
  forces: SectionForces,
  nu: number,
): FEStressField {
  if (!(Number.isFinite(nu) && nu >= 0 && nu < 0.5)) {
    throw new InvalidPoissonRatioError(nu);
  }

  const { section, theta } = fields;
  const m = nu / (1 + nu);
  const frameZ = rotateFrame(section, theta);
  const frameY = rotateFrame(section, theta + Math.PI / 2);

  // DIE EINE EINGANGSSCHLEUSE, je Groesse eine Zeile. Ab hier ist alles SI.
  const N = (forces.N ?? 0) * KN_TO_N;
  const Vy = (forces.Vy ?? 0) * KN_TO_N;
  const Vz = (forces.Vz ?? 0) * KN_TO_N;
  const My = (forces.My ?? 0) * KNM_TO_NM;
  const Mz = (forces.Mz ?? 0) * KNM_TO_NM;
  const Mt = (forces.Mt ?? 0) * KNM_TO_NM;

  const D = section.Iy * section.Iz - section.Iyz * section.Iyz;
  const cy = -(Mz * section.Iy + My * section.Iyz) / D;
  const cz = (My * section.Iz + Mz * section.Iyz) / D;

  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const VyP = Vy * cos + Vz * sin;
  const VzP = -Vy * sin + Vz * cos;

  const torqueZ = fields.torqueZ[0] + m * fields.torqueZ[1];
  const torqueY = fields.torqueY[0] + m * fields.torqueY[1];
  const torsion = (Mt - (VzP * torqueZ - VyP * torqueY)) / fields.It;

  const nodeArea = new Float64Array(section.nodeCount);
  const nodeTauY = new Float64Array(section.nodeCount);
  const nodeTauZ = new Float64Array(section.nodeCount);
  // Der ELEMENTEIGENE Wert je Element und Knoten. Die Sprungdiagnose braucht
  // ihn nach der Mittelung noch einmal, und ein zweiter Durchlauf hiesse, alle
  // Gradienten ein zweites Mal zu rechnen.
  const localTauY = new Float64Array(section.elementCount * 6);
  const localTauZ = new Float64Array(section.elementCount * 6);
  const elements: StressAtElement[] = [];

  const ey = new Float64Array(6);
  const ez = new Float64Array(6);
  const eyZ = new Float64Array(6);
  const ezZ = new Float64Array(6);
  const eyY = new Float64Array(6);
  const ezY = new Float64Array(6);

  for (let element = 0; element < section.elementCount; element += 1) {
    const nodes = elementNodes(section.mesh, element);
    for (let i = 0; i < 6; i += 1) {
      const node = atOrThrow(nodes, i);
      ey[i] = atOrThrow(section.y, node);
      ez[i] = atOrThrow(section.z, node);
      eyZ[i] = atOrThrow(frameZ.y, node);
      ezZ[i] = atOrThrow(frameZ.z, node);
      eyY[i] = atOrThrow(frameY.y, node);
      ezY[i] = atOrThrow(frameY.z, node);
    }

    // DREIMAL DASSELBE ELEMENT, IN DREI SYSTEMEN. `ω` steht im Eingabesystem,
    // `ψZ` und `ψY` je in ihrem Rahmen — und `elementPoints` bildet die
    // Gradienten in genau dem System, dessen Koordinaten es bekommt.
    const points = elementPoints(SAMPLE, ey, ez);
    const pointsZ = elementPoints(SAMPLE, eyZ, ezZ);
    const pointsY = elementPoints(SAMPLE, eyY, ezY);
    // `TRIANGLE_CENTROID` traegt `w = 1`, sein Gewicht ist also `detJ/2` und
    // damit die Elementflaeche — genau das Gewicht der Mittelung.
    const area = atOrThrow(points, CENTROID).weight;

    for (let sample = 0; sample < SAMPLE.length; sample += 1) {
      const point = atOrThrow(points, sample);
      const pointZ = atOrThrow(pointsZ, sample);
      const pointY = atOrThrow(pointsY, sample);

      let dOmegaDy = 0;
      let dOmegaDz = 0;
      let dPsi0ZDy = 0;
      let dPsi0ZDz = 0;
      let dPsi1ZDy = 0;
      let dPsi1ZDz = 0;
      let dPsi0YDy = 0;
      let dPsi0YDz = 0;
      let dPsi1YDy = 0;
      let dPsi1YDz = 0;
      for (let i = 0; i < 6; i += 1) {
        const node = atOrThrow(nodes, i);
        const omega = atOrThrow(fields.omega, node);
        dOmegaDy += omega * atOrThrow(point.dNdy, i);
        dOmegaDz += omega * atOrThrow(point.dNdz, i);

        const dyZ = atOrThrow(pointZ.dNdy, i);
        const dzZ = atOrThrow(pointZ.dNdz, i);
        const psi0Z = atOrThrow(fields.psi0Z, node);
        const psi1Z = atOrThrow(fields.psi1Z, node);
        dPsi0ZDy += psi0Z * dyZ;
        dPsi0ZDz += psi0Z * dzZ;
        dPsi1ZDy += psi1Z * dyZ;
        dPsi1ZDz += psi1Z * dzZ;

        const dyY = atOrThrow(pointY.dNdy, i);
        const dzY = atOrThrow(pointY.dNdz, i);
        const psi0Y = atOrThrow(fields.psi0Y, node);
        const psi1Y = atOrThrow(fields.psi1Y, node);
        dPsi0YDy += psi0Y * dyY;
        dPsi0YDz += psi0Y * dzY;
        dPsi1YDy += psi1Y * dyY;
        dPsi1YDz += psi1Y * dzY;
      }

      const tauZy = dPsi0ZDy + m * dPsi1ZDy;
      const tauZz =
        dPsi0ZDz -
        (pointZ.z * pointZ.z) / (2 * frameZ.Iy) +
        m * (dPsi1ZDz + (pointZ.y * pointZ.y) / (2 * frameZ.Iy));
      const tauYy = dPsi0YDy + m * dPsi1YDy;
      const tauYz =
        dPsi0YDz -
        (pointY.z * pointY.z) / (2 * frameY.Iy) +
        m * (dPsi1YDz + (pointY.y * pointY.y) / (2 * frameY.Iy));

      const tauPy = VzP * tauZy + VyP * tauYz;
      const tauPz = VzP * tauZz - VyP * tauYy;

      const tauY = tauPy * cos - tauPz * sin + torsion * (dOmegaDy - point.z);
      const tauZ = tauPy * sin + tauPz * cos + torsion * (dOmegaDz + point.y);

      if (sample === CENTROID) {
        const sigma = N / section.A + cy * point.y + cz * point.z;
        elements.push(stressRow(element, point.y, point.z, sigma, tauY, tauZ));
        continue;
      }

      const node = atOrThrow(nodes, sample);
      nodeArea[node] = atOrThrow(nodeArea, node) + area;
      nodeTauY[node] = atOrThrow(nodeTauY, node) + area * tauY;
      nodeTauZ[node] = atOrThrow(nodeTauZ, node) + area * tauZ;
      localTauY[element * 6 + sample] = tauY;
      localTauZ[element * 6 + sample] = tauZ;
    }
  }

  // Die Mittelung, IN DIESELBEN ARRAYS zurueck: ab hier stehen dort die
  // gemittelten Knotenwerte, und die Diagnosen lesen genau die.
  const nodes: StressAtNode[] = [];
  for (let node = 0; node < section.nodeCount; node += 1) {
    const area = atOrThrow(nodeArea, node);
    if (!(area > 0)) {
      throw new Error('Ein Netzknoten gehoert zu keinem Element.');
    }
    const tauY = atOrThrow(nodeTauY, node) / area;
    const tauZ = atOrThrow(nodeTauZ, node) / area;
    nodeTauY[node] = tauY;
    nodeTauZ[node] = tauZ;

    // σ WIRD NICHT GEMITTELT, sondern am Knoten geschlossen ausgewertet. Es
    // haengt nur am Ort, alle anliegenden Elemente lieferten dieselbe Zahl —
    // und ein Mittelwert daraus taeuschte eine Glaettung vor, die es nicht gibt.
    const y = atOrThrow(section.y, node);
    const z = atOrThrow(section.z, node);
    const sigma = N / section.A + cy * y + cz * z;
    nodes.push(stressRow(node, y, z, sigma, tauY, tauZ));
  }

  return Object.freeze({
    nodes: Object.freeze(nodes),
    elements: Object.freeze(elements),
    diagnostics: stressDiagnostics(
      section,
      nodeTauY,
      nodeTauZ,
      localTauY,
      localTauZ,
    ),
  });
}

/**
 * Eine Zeile beider Formen — sie haben dieselbe Gestalt, und `nr` bedeutet
 * einmal einen Knoten und einmal ein Element (ADR 0061).
 *
 * HIER LIEGT DER GANZE AUSGANG: SI herein, `mm` und `MPa` heraus. `+ 0` macht
 * aus `-0` eine Null — dieselbe Massnahme wie in `cross-section-stress`.
 */
function stressRow(
  nr: number,
  y: number,
  z: number,
  sigma: number,
  tauY: number,
  tauZ: number,
): StressAtNode {
  return Object.freeze({
    nr,
    y: y * M_TO_MM,
    z: z * M_TO_MM,
    sigma: sigma * PA_TO_MPA + 0,
    tauY: tauY * PA_TO_MPA + 0,
    tauZ: tauZ * PA_TO_MPA + 0,
    sigmaV:
      Math.sqrt(sigma * sigma + 3 * (tauY * tauY + tauZ * tauZ)) * PA_TO_MPA,
  });
}

/**
 * Die drei Selbstauskuenfte ueber das geglaettete Feld.
 *
 * `nodeTauY`/`nodeTauZ` tragen hier bereits die GEMITTELTEN Knotenwerte,
 * `localTau*` die elementeigenen. Bezugsgroesse beider Verhaeltnisse ist
 * `max|τ̄|` ueber alle Knoten; traegt das Feld gar keinen Schub, sind beide
 * null und ihre Knotennummern `-1`.
 */
function stressDiagnostics(
  section: FESection,
  nodeTauY: Float64Array,
  nodeTauZ: Float64Array,
  localTauY: Float64Array,
  localTauZ: Float64Array,
): FEStressDiagnostics {
  let maxTau = 0;
  for (let node = 0; node < section.nodeCount; node += 1) {
    const size = Math.hypot(
      atOrThrow(nodeTauY, node),
      atOrThrow(nodeTauZ, node),
    );
    if (size > maxTau) maxTau = size;
  }
  if (maxTau === 0) {
    return {
      maxJump: 0,
      maxJumpNode: -1,
      maxBoundaryTraction: 0,
      maxBoundaryTractionNode: -1,
      reentrantCorners: reentrantCorners(section),
    };
  }

  let maxJump = 0;
  let maxJumpNode = -1;
  for (let element = 0; element < section.elementCount; element += 1) {
    const nodes = elementNodes(section.mesh, element);
    for (let i = 0; i < 6; i += 1) {
      const node = atOrThrow(nodes, i);
      const jump = Math.hypot(
        atOrThrow(localTauY, element * 6 + i) - atOrThrow(nodeTauY, node),
        atOrThrow(localTauZ, element * 6 + i) - atOrThrow(nodeTauZ, node),
      );
      if (jump > maxJump) {
        maxJump = jump;
        maxJumpNode = node;
      }
    }
  }

  let maxTraction = 0;
  let maxTractionNode = -1;
  for (const loop of section.loops) {
    for (const edge of loop.edges) {
      // Die drei Knoten der quadratischen Kante liegen bei `t = -1, 0, +1`.
      for (let i = 0; i < 3; i += 1) {
        const tangent = edgeTangent(section, edge, i - 1);
        if (tangent === undefined) continue;
        const node = atOrThrow(edge, i);
        // `n = (dz, −dy)/L` zeigt aus dem Material heraus (`prepare.ts`).
        const traction = Math.abs(
          atOrThrow(nodeTauY, node) * tangent.z -
            atOrThrow(nodeTauZ, node) * tangent.y,
        );
        if (traction > maxTraction) {
          maxTraction = traction;
          maxTractionNode = node;
        }
      }
    }
  }

  return {
    maxJump: maxJump / maxTau,
    maxJumpNode,
    maxBoundaryTraction: maxTraction / maxTau,
    maxBoundaryTractionNode: maxTractionNode,
    reentrantCorners: reentrantCorners(section),
  };
}

/**
 * Die Eckknoten mit Materialinnenwinkel groesser als π.
 *
 * DER INNENWINKEL FAELLT AUS DEN ZWEI ANLIEGENDEN RANDKANTEN. Mit dem
 * Umlaufsinn aus `prepare.ts` — aussen mathematisch positiv, innen negativ —
 * liegt das Material bei beiden Schleifenarten LINKS der Laufrichtung, und der
 * Innenwinkel ist `π − turn` mit `turn` als vorzeichenbehafteter Drehung von
 * der ein- in die auslaufende Tangente. Einspringend heisst also `turn < 0`.
 *
 * Ein quadratisches Loch faellt damit richtig heraus: seine vier Ecken sind aus
 * Sicht des Materials 270°-Ecken, und genau das melden sie.
 */
function reentrantCorners(section: FESection): readonly number[] {
  const corners: number[] = [];
  for (const loop of section.loops) {
    const count = loop.edges.length;
    for (let at = 0; at < count; at += 1) {
      const previous = atOrThrow(loop.edges, (at + count - 1) % count);
      const current = atOrThrow(loop.edges, at);
      const incoming = edgeTangent(section, previous, 1);
      const outgoing = edgeTangent(section, current, -1);
      if (incoming === undefined || outgoing === undefined) continue;
      const cross = incoming.y * outgoing.z - incoming.z * outgoing.y;
      const dot = incoming.y * outgoing.y + incoming.z * outgoing.z;
      if (Math.atan2(cross, dot) < -REENTRANT_TOLERANCE) {
        corners.push(atOrThrow(current, 0));
      }
    }
  }
  return Object.freeze(corners);
}

/**
 * Die Einheitstangente einer Randkante bei `t`, oder `undefined` bei einer
 * entarteten Kante.
 */
function edgeTangent(
  section: FESection,
  edge: BoundaryEdge,
  t: number,
): { readonly y: number; readonly z: number } | undefined {
  const dN = edgeShapeDerivatives(t);
  let dy = 0;
  let dz = 0;
  for (let i = 0; i < 3; i += 1) {
    const node = atOrThrow(edge, i);
    dy += atOrThrow(dN, i) * atOrThrow(section.y, node);
    dz += atOrThrow(dN, i) * atOrThrow(section.z, node);
  }
  const length = Math.hypot(dy, dz);
  if (!(length > 0)) return undefined;
  return { y: dy / length, z: dz / length };
}
