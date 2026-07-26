import type { LabelSpec } from '@baustatik/render-core';
import Konva from 'konva';

/**
 * `Konva.Label` ist eine Gruppe aus genau einem `Konva.Tag` (die Box) und einem
 * `Konva.Text`. Das ist der EINZIGE Ort im Package, an dem ein Primitive aus
 * mehr als einer Form besteht, und der einzige, an dem die endgueltige Geometrie
 * erst nach dem Bauen feststeht: wie breit der Text wird, weiss nur, wer messen
 * kann.
 */

// Reine Konfigurationen wie bei jedem anderen Primitive — build und patch lesen
// dieselben, deshalb koennen sie nicht auseinanderlaufen.
export function labelTextConfig(spec: LabelSpec): Konva.TextConfig {
  return {
    text: spec.text,
    fontSize: spec.fontSize,
    fontFamily: spec.fontFamily,
    fill: spec.textColor,
    padding: spec.padding,
  };
}

export function labelTagConfig(spec: LabelSpec): Konva.TagConfig {
  return {
    fill: spec.backgroundColor,
    stroke: spec.borderColor,
    strokeWidth: spec.borderWidth,
    // Wie bei jedem Primitive: Randbreiten sind Screen-Pixel.
    strokeScaleEnabled: false,
    cornerRadius: spec.cornerRadius,
    // Die Box liegt neben dem Anker, sie haengt nicht daran — kein Zeiger.
    pointerDirection: 'none',
  };
}

/**
 * Die Platzierungsregel, verbindlich: Anker `A`, normierte Richtung `d`,
 * Abstand `g`, Box mit Halbmaßen `hw`/`hh`. Der Boxmittelpunkt liegt bei
 * `A + d * (g + t)` mit `t = min(hw / |d.u|, hh / |d.v|)`, gebildet NUR ueber
 * die Komponenten mit `|d_i| > 0`.
 *
 * Damit schneidet der Strahl von `A` in Richtung `d` den Boxrand genau im
 * Abstand `g`. Fuer achsparallele Richtungen ist `t` exakt das halbe Maß.
 * Ohne diese Festlegung ist "naechster Rand" bei schraeger Richtung
 * mehrdeutig — die Projektion des Halbmaßes und der Strahlschnitt liefern
 * verschiedene Ergebnisse, und der Abstand `g` waere nicht pruefbar.
 *
 * Rueckgabe ist die LINKE OBERE Ecke, weil `Konva.Label` dort sitzt.
 */
export function labelTopLeft(
  spec: LabelSpec,
  width: number,
  height: number,
): { readonly x: number; readonly y: number } {
  const length = Math.hypot(spec.direction.u, spec.direction.v);
  const du = spec.direction.u / length;
  const dv = spec.direction.v / length;

  const halfWidth = width / 2;
  const halfHeight = height / 2;

  const reach = Math.min(
    du === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(du),
    dv === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dv),
  );
  const distance = spec.gap + reach;

  return {
    x: spec.anchor.u + du * distance - halfWidth,
    y: spec.anchor.v + dv * distance - halfHeight,
  };
}

// Erst Text setzen, DANN messen: die Boxgroesse folgt dem Text samt padding.
function place(label: Konva.Label, spec: LabelSpec): void {
  const text = label.getText();
  label.position(labelTopLeft(spec, text.width(), text.height()));
}

export function buildLabel(spec: LabelSpec): Konva.Label {
  const label = new Konva.Label({ id: spec.id });
  // Tag zuerst: innerhalb der Gruppe liegt das spaeter Hinzugefuegte oben.
  label.add(new Konva.Tag(labelTagConfig(spec)));
  label.add(new Konva.Text(labelTextConfig(spec)));
  place(label, spec);
  return label;
}

export function patchLabel(label: Konva.Label, spec: LabelSpec): void {
  label.getTag().setAttrs(labelTagConfig(spec));
  label.getText().setAttrs(labelTextConfig(spec));
  place(label, spec);
}
