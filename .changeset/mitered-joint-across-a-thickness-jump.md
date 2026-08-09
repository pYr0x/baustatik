---
'@baustatik/geometry-2d': patch
'@baustatik/section-geometry': patch
'@baustatik/cross-section': patch
---

Ein durchverbundener Stoss wird jetzt **gemitert, auch ueber einen
Dickensprung** — [ADR 0038](../docs/adr/0038-a-chained-joint-is-mitered-across-a-thickness-jump.md).

**Nach ADR 0036 ist das ein `patch`; der Bruch steht hier im Text.**

## Der Bruch: Umrisse und Werte aendern sich

Faellt ein Dickensprung mit einer ECKE zusammen, schnitt ADR 0037 den
Offsetpfad dort auf, beide Stuecke endeten stumpf, und der Keil zwischen ihren
Aussenkanten fehlte. Betroffen ist jeder gezeichnete Querschnitt mit
`kind: 'midline'`, an dem zwei verschieden dicke Waende in einem Winkel
durchverbunden sind — der geschweisste Kasten mit `tf ≠ tw` an allen vier Ecken.

```text
Winkel Gurt 8 / Steg 6, 90°   A = 1548 mm²  ->  1560 mm²
Kasten 400 x 200, tf 20/tw 10  A = 15000 mm² ->  15200 mm²
```

Die neuen Zahlen sind die richtigen: die Aussenkontur am Stoss ist durch die
beiden aeusseren Offsetgeraden begrenzt, und ihr Schnittpunkt ist der einzige
Punkt, der beide Baender ausfuellt, ohne ueber eines hinauszureichen. **Wer
gespeicherte Umrisse mitfuehrt, bekommt beim naechsten Gate-Lauf eine
`OutlineDriftWarning`** — die Figur ist neu abzuleiten.

Der KOLLINEARE Dickensprung bleibt unveraendert: dort ist die Stufe echt.

## Additiv

- **`@baustatik/geometry-2d` / `@baustatik/section-geometry`: `delta: 0`** in
  `Polygon.inflate` ist die Identitaet — ein geschlossener Zug geht unveraendert
  in die Vereinigung, in den Umlaufsinn der Offsets gedreht. Ein offener Zug mit
  `delta: 0` traegt keine Flaeche und faellt heraus.
- **`@baustatik/cross-section`: `ChainedJoint.overshoot`.** Der Ueberstand des
  ungekappten Spitzes wird an der GEBAUTEN Ecke gemessen statt aus `α`
  gerechnet, und das Gate liest ihn, statt eine zweite Formel zu fuehren.

## Geaendertes Verhalten

- `MiterLimitExceededWarning` meldet sich jetzt auch am fast gestreckten Stoss
  MIT Dickensprung: dort laeuft der Miterpunkt laengs der Wand davon, waehrend
  `α` nahe `π` bleibt. Bei gleicher Wandstaerke ist `overshoot` unveraendert
  `1/sin(α/2)`. Der Bezug im Meldungstext ist die halbe **dickere** Wandstaerke.
- Gekappt wird quer zur Richtung des Spitzes, an derselben Schranke wie bisher
  (`miterLimit · max(t)/2`). Der Schnitt ist eine Fase, wo Clipper2 intern ein
  Quadrat setzt — der Unterschied ist ein Splitter und tritt nur dort auf, wo
  das Gate ohnehin meldet.
- Der Umriss traegt an der Naht eines Fuellrings kollineare Zwischenpunkte. Sie
  tragen zu `A`, `Iy` und `Iz` nichts bei.
