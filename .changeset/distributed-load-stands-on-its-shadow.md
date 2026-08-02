---
'@baustatik/fem-viewer': minor
'@baustatik/render-core': patch
---

Streckenlasten werden gezeichnet — und stehen auf ihrem Schatten (ADR 0028).

- **Die Regel, aus der alle neun Faelle folgen:** die Grundlinie der Figur ist der
  Schatten des belasteten Abschnitts, geworfen von Parallellicht in
  Lastrichtung; bei `trueLength` die Stabachse selbst. Damit braucht die Matrix
  aus `frame` x `axis` x `referenceLength` keine einzige Fallunterscheidung — ein
  Schatten steht per Definition senkrecht auf dem Licht, und das entgegen der
  Lastrichtung abgetragene Polygon kann deshalb nicht flach werden. Die
  naheliegende Regel „die Bezugslaenge nennt die Grundlinie" ist an
  `Linienlast4` und `Linienlast8` widerlegt.
- **Zwei Folgen, beide gewollt:** `horizontalProjection` und `verticalProjection`
  zeichnen bei gleicher Lastrichtung IDENTISCH (sie unterscheiden sich im Wert,
  den das Bild nicht skaliert), und die Luecke sitzt an der geringsten Stelle,
  gemessen laengs der Lastrichtung.
- **Die eine Ausnahme davon:** misst die Bezugslaenge am Stab EXAKT 0 —
  `verticalProjection` am waagrechten, `horizontalProjection` am senkrechten —,
  wird dort gar nichts gezeichnet, so wie RSTAB es haelt. Das Bild skaliert nicht
  mit dem Faktor, aber „nichts" ist keine Skalierung: die Last traegt an diesem
  Stab nichts ein, und weil die Ordinate je Last normiert ist, stuende die Figur
  sonst ausgerechnet dort in voller Hoehe. Entschieden wird JE STAB, am exakten 0
  — der fast waagrechte Stab wird weiter gezeichnet.
- **Der eine Sonderfall:** Lastrichtung parallel zur Stabachse — `lokal x` immer,
  `global x`/`global z` am waagrechten beziehungsweise senkrechten Stab. Dort
  steht der Block quer und die zwei Pfeile liegen laengs darin; ohne sie waeren
  eine Last und ihr Gegenstueck dasselbe Bild.
- **Neues Symbol `symbols/distributed-force.ts`**, nicht `pointForceSpecs` mit
  einem Parameter mehr: beim Kraftpfeil sagt die Laenge laut Invariante nichts
  ueber den Betrag, hier ist sie die Ordinate. Die Figur hat trotzdem keine
  eigene Hoehenzahl — die Aussenkante des Polygons IST die Verbindung der
  Pfeilenden.
- **Marker auf dem Stab** an Anfang und Ende des Abschnitts. Unter der
  Schattenregel steht die Figur bei einer Projektion nicht mehr ueber dem Stab;
  ohne die Marken saehe man nicht, welches Stueck belastet ist.
- **Bekannte Einschraenkung, jetzt bewusst:** die Ordinate ist JE LAST normiert.
  Die Hoehe zeigt den Verlauf innerhalb einer Last, nie zwischen zweien. Der
  Bezugsmassstab ueber alle sichtbaren Lasten bleibt offen.
- **Behoben nebenbei:** `beam-loads.ts` las `distanceFromStart` vor der
  Verzweigung — an einer Streckenlast gibt es das Feld nicht, `loadStation`
  machte daraus stillschweigend `NaN`. Und `render-core` validierte
  `RectangleSpec` gar nicht: die Spec stand in der Union und der Konva-Adapter
  konnte sie, aber `validateSpec` fiel in den Unbekannt-Zweig.
