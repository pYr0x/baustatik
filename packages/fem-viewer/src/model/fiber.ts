/**
 * Die GESTRICHELTE FASER — die Lesehilfe fuer die Auftragsrichtung.
 *
 * Ein Schnittgroessenwert wird mit `ez` multipliziert aufgetragen, und `ez`
 * folgt allein aus der Knotenreihenfolge `startNodeId -> endNodeId`
 * (`Line.frame`). Am waagerechten Stab sieht man das noch: die +z-Seite ist
 * unten. An einer STUETZE ist die Seite unsichtbar — deshalb kommt sie als
 * gestrichelte Linie ins Bild.
 *
 * SIE GEHOERT ZUM MODELL, nicht zum Ergebnis, und liegt deshalb hier und nicht
 * in `results/`: sie ist eine Eigenschaft des Stabs und wird auch ohne gerechnetes
 * Ergebnis gezeichnet. Wer die Faser drehen will, dreht den Stab — ein reines
 * Zeichen-Flag wuerde `M = +20 kNm` an einem Stab oben und am naechsten unten
 * zeichnen, und das Bild widerspraeche sich selbst.
 *
 * IMMER GEZEICHNET. Ein Schalter dafuer waere ein zweiter Zustand am
 * `ViewerConfig`; er ist in `packages/TODO.md` §2 als View-Policy-Aufgabe
 * eingetragen und wartet dort auf seinen Ort.
 *
 * Der Versatz ist SCREEN-konstant und deshalb durch `vp.scale` geteilt — anders
 * als die Diagrammordinate, die ein Weltmass ist. Die Faser sagt eine SEITE, kein
 * Mass; ihr Abstand darf beim Zoomen nicht wachsen.
 */

import type { Beam, Node } from '@baustatik/fem';
import { Line, Point, Vector } from '@baustatik/fem-geometry';
import type { LineSpec } from '@baustatik/render-core';
import { type Viewport, worldPoint } from '@baustatik/viewport-2d';

import type { ModelStyle } from './style';

export function fiberSpec(
  beam: Beam,
  start: Node,
  end: Node,
  vp: Viewport,
  style: Required<ModelStyle>,
): LineSpec {
  const axis = Line.make(start.position, end.position);
  // `Line.frame` ist die massgebliche Definition der lokalen Stabachse; hier
  // wird sie NICHT nachgebaut, sonst gaebe es zwei Antworten auf „wo ist +z".
  const { ez } = Line.frame(axis);
  const offset = Vector.scale(ez, style.fiberOffsetPx / vp.scale);

  const from = Point.translate(axis.p1, offset);
  const to = Point.translate(axis.p2, offset);

  return {
    kind: 'line',
    id: `beam:${beam.id}:fiber`,
    // Dasselbe Band wie der Stab: sie ist Teil seiner Darstellung, kein Ergebnis.
    layer: 'beams',
    from: worldPoint(from.x, from.z),
    to: worldPoint(to.x, to.z),
    // Wie jede Strichstaerke ungeteilt: der Adapter zeichnet in Screen-Pixeln.
    strokeWidth: style.fiberWidthPx,
    strokeColor: style.fiberColor,
    strokeStyle: style.fiberDashStyle,
  };
}
