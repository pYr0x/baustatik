import type { LabelSpec } from '@baustatik/render-core';
import Konva from 'konva';

/**
 * `Konva.Label` ist eine Gruppe aus genau einem `Konva.Tag` (die Box) und einem
 * `Konva.Text`. Das ist der EINZIGE Ort im Package, an dem ein Primitive aus
 * mehr als einer Form besteht, und der einzige, an dem die endgueltige Geometrie
 * erst nach dem Bauen feststeht: wie breit der Text wird, weiss nur, wer messen
 * kann.
 *
 * DER TEXT WIRD IN EINER FESTEN REFERENZGROESSE GEBAUT und die eigentliche
 * Groesse steckt in der SKALIERUNG der Gruppe. `LabelSpec.fontSize` ist ein
 * WELTMASS — die Erzeuger teilen ihre Screen-Pixel durch `vp.scale`, damit die
 * Schrift beim Zoomen gleich gross bleibt. Direkt als `fontSize` gesetzt wird
 * daraus bei starkem Zoom ein entarteter Fontstring: `ctx.font = '0.012px …'`.
 * Unterhalb etwa eines halben Pixels quantisieren die Browser die Schriftgroesse
 * oder verwerfen sie ganz — die Schrift wirkt beim Reinzoomen erst ungleichmaessig
 * und verschwindet schliesslich, und `measureText` liefert dazu eine Breite von
 * 0, sodass auch die Box zusammenfaellt.
 *
 * Mit `fontSize = REFERENCE_FONT_SIZE` und `scale = spec.fontSize / REFERENCE`
 * ist der Fontstring immer gutartig, die Messung stabil, und die Verkleinerung
 * macht die Transformationsmatrix — die Schrift wird in ihrer EFFEKTIVEN
 * Geraetegroesse gerastert und bleibt damit exakt screen-konstant. Das Bild ist
 * dasselbe, nur rechnet es niemand mehr im Fontstring aus.
 *
 * Alles, was in der Gruppe liegt, ist deshalb in REFERENZEINHEITEN anzugeben:
 * `padding` und `cornerRadius` werden durch denselben Faktor geteilt. Nicht
 * dagegen `strokeWidth` — `strokeScaleEnabled: false` misst gegen die absolute
 * Transformation und bleibt Screen-Pixel, wie bei jedem Primitive.
 */

/**
 * Die Groesse, in der Text und Box gebaut werden. Der konkrete Wert ist frei —
 * er kuerzt sich gegen die Skalierung wieder heraus; er muss nur weit oberhalb
 * der Quantisierungsschwelle der Browser liegen.
 */
const REFERENCE_FONT_SIZE = 100;

/** Der Faktor von Referenz- auf Weltgroesse. `fontSize > 0` sichert `validateSpec`. */
export function labelScale(spec: LabelSpec): number {
  return spec.fontSize / REFERENCE_FONT_SIZE;
}

// Reine Konfigurationen wie bei jedem anderen Primitive — build und patch lesen
// dieselben, deshalb koennen sie nicht auseinanderlaufen.
export function labelTextConfig(spec: LabelSpec): Konva.TextConfig {
  return {
    text: spec.text,
    fontSize: REFERENCE_FONT_SIZE,
    fontFamily: spec.fontFamily,
    fill: spec.textColor,
    // In Referenzeinheiten, wie alles innerhalb der skalierten Gruppe.
    padding: spec.padding / labelScale(spec),
  };
}

export function labelTagConfig(spec: LabelSpec): Konva.TagConfig {
  return {
    fill: spec.backgroundColor,
    stroke: spec.borderColor,
    strokeWidth: spec.borderWidth,
    // Wie bei jedem Primitive: Randbreiten sind Screen-Pixel — und weil
    // `strokeScaleEnabled: false` gegen die ABSOLUTE Transformation misst, geht
    // die Gruppenskalierung daran vorbei.
    strokeScaleEnabled: false,
    cornerRadius:
      spec.cornerRadius === undefined
        ? undefined
        : spec.cornerRadius / labelScale(spec),
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

/**
 * Erst Text setzen, DANN messen: die Boxgroesse folgt dem Text samt padding.
 *
 * Gemessen wird in REFERENZeinheiten, gerechnet wird in WELTeinheiten — deshalb
 * das `* scale`. `labelTopLeft` sieht davon nichts: die Platzierungsregel gilt
 * fuer die Box, wie sie im Bild steht, und `position` liegt ohnehin im System
 * des Elternknotens und damit ausserhalb dieser Skalierung.
 */
function place(label: Konva.Label, spec: LabelSpec): void {
  const scale = labelScale(spec);
  label.scale({ x: scale, y: scale });

  const text = label.getText();
  label.position(
    labelTopLeft(spec, text.width() * scale, text.height() * scale),
  );
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
