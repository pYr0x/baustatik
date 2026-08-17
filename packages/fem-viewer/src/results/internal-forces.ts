/**
 * SCHNITTGROESSENVERLAEUFE -> Figuren. Die erste Ebene: WAS wo haengt.
 *
 * Wie `reactions.ts` steht hier nur, welcher Verlauf an welchem Stab liegt, wie
 * hoch er aufgetragen wird und wo seine Extremwerte sitzen. WIE die Flaeche
 * aussieht, steht in `diagram-figure.ts`.
 *
 * DIE DATENSEITE WIRD NICHT NACHGEBAUT. `internalForcesAlong` mischt die
 * Pflichtstuetzstellen aus `fem-element` — Raender, Segmentgrenzen,
 * Lastpositionen und die EXAKT ausgerechneten Extremstellen — mit einem
 * gleichmaessigen Raster. Deshalb ist das hier gefundene Maximum das ECHTE und
 * haengt nicht an der Rasterweite. Diese Datei ist reiner Aufrufer; `fem-solver`
 * aendert sich fuer die Verlaeufe nicht. Das macht die Kante
 * `fem-viewer -> fem-solver` von einem Typ- zu einem RUNTIME-Import.
 *
 * DIE BEZUGSGROESSE IST GLOBAL, je Schnittgroesse (ADR 0050):
 *
 *   ref[K] = max ueber ALLE Staebe, ALLE Stationen von |K(x)|
 *
 * Nur so sind zwei Feldmomente im selben Bild vergleichbar. `ref[K] === 0`
 * heisst: fuer diese Schnittgroesse entsteht KEIN EINZIGES Spec — keine
 * Nulllinie, kein Label, analog zu ADR 0028 („ein Stab, auf dem die Bezugslaenge
 * 0 misst, bekommt gar keine Figur"). Geprueft wird auf EXAKT 0: beim geraden
 * waagerechten Stab entkoppeln die Laengs-Freiheitsgrade vollstaendig und `N`
 * ist exakt null; wo `N` koppelt, ist es echt.
 *
 * DIE AUFTRAGSRICHTUNG IST EINE REGEL FUER ALLE DREI: ein Wert wird mit `ez`
 * multipliziert aufgetragen, genau wie `fem-element/src/internal-forces.ts` sie
 * pinnt („ein positiver Wert wird auf der lokalen +z-Seite aufgetragen"). `ez`
 * folgt allein aus der Knotenreihenfolge — kein Modellfeld, kein Spiegel-Flag.
 * Sichtbar gemacht wird sie von der gestrichelten Faser (`model/fiber.ts`).
 */

import type { Beam, Node } from '@baustatik/fem';
import { Line, type LineFrame } from '@baustatik/fem-geometry';
import {
  internalForcesAlong,
  type SectionForcesAt,
  type SolveResult,
} from '@baustatik/fem-solver';
import type { Spec } from '@baustatik/render-core';
import type { Viewport } from '@baustatik/viewport-2d';

import {
  InvalidDiagramExaggerationError,
  UnknownNodeReferenceError,
} from '../errors';
import {
  type DiagramFigure,
  diagramFigureSpecs,
  type DiagramSample,
} from './diagram-figure';
import {
  DIAGRAM_COMPONENTS,
  type DiagramComponent,
  diagramLook,
  type ResultStyle,
} from './style';

/**
 * Je Schnittgroesse: VORHANDEN = wird gezeichnet, der WERT ist die Ueberhoehung.
 *
 * ANWESENHEIT IST DER SCHALTER — kein `visible`-Feld daneben, das mit ihr
 * desynchronisieren koennte. Praezedenzfall ist `cross-section-viewer` mit
 * `getProperties`/`getStressPoints`/`getFEMesh`, wo ein weggelassener Pull der
 * Aus-Zustand ist.
 *
 * Jede Schnittgroesse hat ihre EIGENE Bezugsgroesse, unabhaengig davon, ob die
 * anderen sichtbar sind: sonst verschoebe das Einschalten von `N` die Hoehe von
 * `M`.
 */
export type DiagramOptions = {
  /** Ueberhoehung der Normalkraft, `> 0`. */
  readonly N?: number;
  /** Ueberhoehung der Querkraft, `> 0`. */
  readonly V?: number;
  /** Ueberhoehung des Biegemoments, `> 0`. */
  readonly M?: number;
};

/** `kN` fuer die Kraefte, `kNm` fuer das Moment — wie `SectionForces` sie fuehrt. */
const UNITS: Record<DiagramComponent, string> = {
  N: 'kN',
  V: 'kN',
  M: 'kNm',
};

interface InternalForceSpecOptions {
  readonly beams: readonly Beam[];
  readonly nodeById: ReadonlyMap<string, Node>;
  readonly result: SolveResult;
  readonly diagrams: DiagramOptions;
  readonly viewport: Viewport;
  readonly style: Required<ResultStyle>;
}

/** Ein Stab mit seiner Achse und dem ganzen Verlauf, EINMAL abgetastet. */
interface SampledBeam {
  readonly beamId: string;
  readonly axis: Line;
  readonly frame: LineFrame;
  readonly points: readonly SectionForcesAt[];
}

export function internalForceSpecs(
  options: InternalForceSpecOptions,
): readonly Spec[] {
  const { beams, nodeById, result, diagrams, viewport: vp, style } = options;

  // Erst die Ueberhoehungen pruefen, dann rechnen: ein gebrochener Faktor soll
  // nicht erst nach dem Abtasten aller Staebe auffallen.
  const active = DIAGRAM_COMPONENTS.filter(
    (component) => diagrams[component] !== undefined,
  );
  for (const component of active) {
    const exaggeration = diagrams[component] as number;
    if (!(exaggeration > 0)) {
      throw new InvalidDiagramExaggerationError(component, exaggeration);
    }
  }
  if (active.length === 0) return [];

  // EINMAL abtasten, fuer die Bezugsgroesse UND fuer die Figur. Zweimal
  // abgetastet koennten Hoehe und Kurve verschiedene Zahlen zeigen.
  const sampled = beams.map((beam) =>
    sampleBeam(beam, nodeById, result, style),
  );

  const specs: Spec[] = [];
  // Die Reihenfolge N, V, M ist zugleich die z-Order innerhalb des Bandes: M
  // liegt obenauf, weil man am haeufigsten darauf sieht.
  for (const component of active) {
    const reference = referenceOf(sampled, component);
    // KEIN EINZIGES SPEC bei Bezugsgroesse 0 — nicht einmal die Nulllinie. Eine
    // Flaeche der Hoehe 0 waere ein Strich auf der Stabachse, und der behauptete
    // ein Ergebnis, das es nicht gibt.
    if (reference === 0) continue;

    const look = diagramLook(style, component);
    for (const beam of sampled) {
      const figure: DiagramFigure = {
        id: `diagram:${beam.beamId}:${component}`,
        layer: 'diagrams',
        axis: beam.axis,
        frame: beam.frame,
        samples: beam.points.map(
          (point): DiagramSample => ({ x: point.x, value: point[component] }),
        ),
        reference,
        ordinateM: style.diagramOrdinateM,
        exaggeration: diagrams[component] as number,
        unit: UNITS[component],
      };
      specs.push(...diagramFigureSpecs(figure, vp, look));
    }
  }

  return specs;
}

/**
 * Ein Stab, abgetastet.
 *
 * DIE AUFLOESUNG sind zwei Zahlen, und sie beantworten zwei verschiedene Fragen:
 *
 *   n = max(diagramSubdivisions, ceil(L / diagramMaxStepM))
 *
 * Der Sehnenfehler des globalen Bogens ist `A/n²` und damit von der Stablaenge
 * UNABHAENGIG (die Hoehe ist auf `ref` normiert) — dafuer steht
 * `diagramSubdivisions`. Das absolute Raster von `diagramMaxStepM` sichert den
 * KURZEN Lastabschnitt auf einem LANGEN Stab ab, in den ein Raster von `L/20`
 * keinen Punkt legen wuerde. Mehr Punkte kosten keine Specs: das Polygon traegt
 * sie in EINEM Array.
 *
 * `internalForcesAlong` wirft `UnknownBeamError`, wenn das Ergebnis den Stab
 * nicht kennt — dieselbe Aussage wie `UnknownNodeReferenceError` bei einer
 * Reaktion an einem fremden Knoten: das Ergebnis gehoert nicht zu diesem Modell.
 * Der Fehler kommt vom Solver und wird nicht uebersetzt, sonst gaebe es zwei
 * Namen fuer denselben Befund.
 */
function sampleBeam(
  beam: Beam,
  nodeById: ReadonlyMap<string, Node>,
  result: SolveResult,
  style: Required<ResultStyle>,
): SampledBeam {
  const start = nodeById.get(beam.startNodeId);
  if (start === undefined) {
    throw new UnknownNodeReferenceError(beam.id, beam.startNodeId);
  }
  const end = nodeById.get(beam.endNodeId);
  if (end === undefined) {
    throw new UnknownNodeReferenceError(beam.id, beam.endNodeId);
  }

  const axis = Line.make(start.position, end.position);
  const subdivisions = Math.max(
    style.diagramSubdivisions,
    Math.ceil(Line.length(axis) / style.diagramMaxStepM),
  );

  return {
    beamId: beam.id,
    axis,
    frame: Line.frame(axis),
    points: internalForcesAlong(result, beam.id, { subdivisions }),
  };
}

/** `max |K(x)|` ueber ALLE Staebe und ALLE Stationen. */
function referenceOf(
  sampled: readonly SampledBeam[],
  component: DiagramComponent,
): number {
  let reference = 0;
  for (const beam of sampled) {
    for (const point of beam.points) {
      const magnitude = Math.abs(point[component]);
      if (magnitude > reference) reference = magnitude;
    }
  }
  return reference;
}
