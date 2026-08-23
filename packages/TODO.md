# Ausbauplan Monorepo — offen

Stand: 2026-08-17. Diese Liste enthält bewusst nur noch offene Arbeit und
Entscheidungen, die dafür wichtig bleiben. Erledigte Stufen sind in ADRs,
`CONTEXT.md`, Changelogs und Tests festgehalten — nicht hier.

## Nächste sinnvolle Wege

| Strang | Nächster Schritt | Warum |
| --- | --- | --- |
| FEM-Viewer | Momentenstreckenlasten zeichnen | Kraftstreckenlasten (konstant/trapezförmig/projiziert) sind gezeichnet; Streckenmomente sind die verbleibende Lastart. |
| FEM-Rechnung | Lastkombinationen und Hüllkurven | Baut auf Lastfällen und den vorhandenen Schnittgrößen-Auswertungen auf. |
| Querschnitte | Querschnittseditor & Modellausbau | Rechenkerne (parametrisch, dünnwandig, FE) und Profilkatalog stehen; der interaktive Editor und offene Modell-Erweiterungen (Mehrzeller, Kasten-Spannungspunkte) folgen. |
| View-Policy | Streckenlasten auf die Diagramm-Bezugsgröße umstellen, Anzeigeschalter bündeln | Die Skalierungsregel ist mit ADR 0050 entschieden; die Streckenlasten erben sie noch nicht. |

---

## 1. Streckenlasten im Viewer

> **Kraftstreckenlasten sind umgesetzt ([ADR 0028](../docs/adr/0028-a-distributed-load-stands-on-its-shadow.md)).**
> Gleich- und Trapezstreckenlasten (inkl. lokaler/globaler Richtung und
> Projektionen) werden über `distributedForceSpecs` mit Schattengrundlinie,
> Pfeilen und Beschriftung gezeichnet.

**Verbleibende offene Lastart im Viewer:**
- **Momentenstreckenlasten** (`BeamMomentConstantLoad`, `BeamMomentTrapezoidalLoad`):
  Einzelmomente auf dem Stab sind sichtbar; Streckenmomente werden in
  `beam-loads.ts` aktuell noch übersprungen (`continue`).

---

## 2. Gemeinsame View-Policy für Diagramme und Lasten

> **Die Skalierungsregel ist entschieden ([ADR 0050](../docs/adr/0050-the-diagram-ordinate-is-a-world-measure.md)).**
> `ref[K] = max |K(x)|` über **alle** Stäbe und Stationen, je Schnittgröße; die
> Ordinate ist ein **Weltmaß** (`diagramOrdinateM`, Vorgabe 0,5 m) mal einer
> Überhöhung. `ref[K] === 0` erzeugt kein einziges Spec.

Die vorhandenen Viewer-Styles (`LoadStyle`, `ResultStyle` in `fem-viewer`,
`CrossSectionStyle` in `cross-section-viewer`) reichen für die Einzelansichten.

**Verbleibend:**
- **Streckenlasten auf dieselbe Bezugsgröße umstellen.** Sie sind weiterhin
  **je Last** normiert — ein Trapez `q1=10 → q2=40` steht neben einer konstanten
  `q=10` einmal 12 px und einmal 48 px hoch. ADR 0050 hält fest, dass sie die
  Regel erben sollen; der Umbau ist ein eigener Schritt mit eigenen Bildern.
  Bis dahin trägt ein Bild zwei Skalierungsregeln nebeneinander.
- Anzeigeeinstellungen als View-Policy bündeln — folgt dem Slice-Muster,
  jedoch ohne Persistenz- und Migrationsstrenge (fehlende Felder fallen auf Defaults).
  Sie nimmt später `DiagramOptions` auf, das heute ein Pull am `ViewerConfig` ist.
- **Gestrichelte Faser ein-/ausschaltbar.** Die Linie auf der `+ez`-Seite jedes
  Stabs ist im Bild (`model/fiber.ts`) und macht sichtbar, welche Seite die
  Knotenreihenfolge zur „Unterseite" bestimmt hat. Sie wird **immer** gezeichnet,
  weil es noch keinen Ort für einen Schalter gibt; ein `boolean`-Feld am
  `ViewerConfig` wäre genau der zweite Zustand, den die View-Policy später sauber
  aufnimmt.

---

## 3. Schnittgrößen grafisch darstellen

> **Erledigt ([ADR 0050](../docs/adr/0050-the-diagram-ordinate-is-a-world-measure.md)).**
> `N`, `V` und `M` werden über `results/internal-forces.ts` und
> `results/diagram-figure.ts` im eigenen Band `diagrams` gezeichnet: gefüllte
> Flächen je Vorzeichen-Lauf, ein durchgehender Umriss je Stab, vorzeichen-
> behaftete Extremwert-Labels samt Plateau-Regel. Die Stützstellen kommen
> unverändert aus `internalForcesAlong` — inklusive der exakten Extremstellen und
> der doppelten Einträge an einer Sprungstelle. Sichtbarkeit und Überhöhung
> steuert `DiagramOptions` (Anwesenheit = Schalter); `ViewerConfig.getReactions`
> ist dabei zu `getResult` geworden.

---

## 4. Lastkombinationen und Hüllkurven

Ein neues Kombinationsmodul übernimmt die normative Kombination; `fem-loads`
bleibt Eigentümer von Lastfällen und `actions` von der reinen
Einwirkungs-Vokabel. Keine ψ- oder γ-Werte in diese bestehenden Pakete ziehen.

Wichtige Anforderungen für den Entwurf:

- Kombinationen sind gewichtete, lineare Superpositionen von Lastfällen.
- Gegensätzliche Varianten derselben Einwirkung (z. B. Wind links/rechts)
  brauchen eine ausschließende Gruppe; eine Kategorie allein drückt das nicht
  aus.
- Hüllkurven bewahren die **zugehörigen** Werte: Beim maßgebenden `M` müssen
  gleichzeitig wirkendes `N` und `V` abrufbar bleiben. Drei unabhängige
  Min-/Max-Listen reichen für Bemessung nicht aus.
- Die Extremwertsuche nutzt die exakten Stützstellen des Abschnittskraft-Verlaufs.

---

## 5. Querschnitte — offene Punkte und Modellausbau

Die Grundlagen sind vollständig umgesetzt:
- Parametrische Formen (`rectangle`, `i-symmetric`, `t-section`, `hollow-rectangle`),
- Walzprofilkatalog (`@baustatik/steel-profiles`, 18 IPE + 24 HEA),
- Solver-Anbindung (`@baustatik/fem-section-resolve`),
- Positioniertes Wandmodell für Einzeller mit κ, `yM`/`zM` und `It` (ADR 0040/0041),
- 2D-FE-Rechenkern für Freiform-Vollquerschnitte (`@baustatik/cross-section-fe`, ADR 0045/0047/0048).

**Offene Punkte im Querschnittsstrang:**

1. **Querschnittseditor (UI / Interaktion):** Werkzeug zum Erstellen und Bearbeiten
   von Wandgraphen und Umrissen.
2. **Kastenprofil-Spannungspunkte:** Dem geschlossenen Hohlprofil fehlt noch die
   Spannungspunkt-Vorlage (Theorie mit `closedBoxPath` vorhanden, wartet auf
   Referenzdaten / QRO-Katalog mit Bogentangenten).
3. **Spannungen für Vollquerschnitte:** Seit
   [ADR 0057](../docs/adr/0057-the-parametric-solid-section-has-no-stress-points.md)
   liefert `stressPoints` für JEDEN Vollquerschnitt `undefined` — gezeichnet wie
   parametrisch (`idealisation: 'solid'`). Für die **gezeichnete** Figur ist das
   erledigt: `recoverStresses` in `@baustatik/cross-section-fe` gibt σ, τ und σv
   am Netz heraus ([ADR 0061](../docs/adr/0061-the-fe-stress-is-a-vector-at-a-node.md)).
   Der **parametrische** Vollquerschnitt hat weiterhin gar keine
   Spannungsausgabe — das ist Absicht und keine Lücke, die eine Zwischenvorlage
   füllen soll; der Ausweg ist Punkt 6. Offen bleiben außerdem die Anzeige im
   `cross-section-viewer` und die Auswahl der Nachweispunkte (ADR 0056).
4. **Mehrzellige Wandgraphen (P6):** Bei ≥ 2 Zellen entsteht ein Gleichungssystem
   gekoppelter Unbekannter. Bis dahin bleiben κ, `yM`/`zM` und `It` dort `undefined`
   und das Gate meldet `MultipleCellsWarning`. Dasselbe gilt für unverbundene Graphen
   (`DisconnectedWallGraphWarning`).
5. **`i-shape` mit unabhängigen Gurten:** Formänderung im Modellsatz zur Subsumierung
   von I- und T-Profilen (`tf,unten = 0`).
6. **Parametrischer Vollquerschnitt vs. FE:** Der parametrische Vollquerschnitt nutzt
   für κ weiter Grashof-Näherungen (`shear.ts`), während Freiformen über FE gelöst
   werden (`docs/messungen/t-querschnitt-grashof-gegen-fe.md`): κ liegt dort +11 %
   bis +134 % zu steif. **Die Richtung steht fest** — die parametrische Eingabe ist
   nur eine bequemere Schreibweise für eine gezeichnete Figur, also soll sie als
   Polygonzug ausgeschrieben durch dieselbe FE laufen (ADR 0057). Bei den
   Spannungspunkten ist dieser Schritt schon vollzogen, indem die Näherung dort
   gar nichts mehr liefert; für κ steht er aus.
7. **Clipping-Bibliotheken in `geometry-2d`:** Zurzeit koexistieren Martinez (Boolesche Ops)
   und Clipper2 (Offset/Inflate). Eine vollständige Ablösung von Martinez durch Clipper2
   setzt Mehrring-Polygone in `geometry-2d` voraus.

---

## 6. Das Projekt als Behälter — Tool-Dokumente und Policies

> **Erledigt für den FEM-Teil ([ADR 0049](../docs/adr/0049-the-tool-document-is-the-versioned-record-unit.md)):**
> `AnalysisPolicy` ist seit Snapshot **v13** Pflichtfeld des `FEMModelSnapshot`.
> Eigene Versionszähler auf Policies (`ANALYSIS_POLICY_SCHEMA_VERSION`) sind entfallen.
> Es gilt: **Eine `schemaVersion` pro Tool-Dokument.**

### Gliederung nach Tool-Dokumenten

```text
Projekt                       Name und Angaben zum Bauvorhaben — gehört der APP
  ├─ FEM-2D-Stab (Tool)         Tool-Dokument: FEMModelSnapshot (inkl. AnalysisPolicy, v13)
  ├─ Querschnittseditor (Tool)  Tool-Dokument: Querschnitte + SectionPolicy (künftig)
  ├─ Bemessung (Tool)           später — Stahlbeton und Stahl, eigene Policy
  └─ … weitere Norm-Nachweise   als weitere Tools
```

- Jedes Tool besitzt sein eigenes versioniertes Dokument.
- Die `AnalysisPolicy` gehört zur FEM-Position, die `SectionPolicy` gehört zum Querschnitt.
- Das Querschnitts-Dokument zieht in ein eigenes Tool-Dokument um, sobald der Editor
  als eigenständiges Werkzeug aufgebaut wird (bisher liegt `sectionPolicy` als
  Übergangslösung im `FEMModelSnapshot`).

---

## 7. Schemabrüche und Changesets

**Entschieden mit [ADR 0036](../docs/adr/0036-release-policy-before-the-first-consumer.md):**
Bis zur ersten Freigabe sind alle Paketversionen `0.0.0`, jeder Changeset ist `patch`,
und Breaking Changes stehen im Changelog-Text, nicht in der Versionsarithmetik.
`schemaVersion` ist ein Datenformat-Zähler, kein Paket-Semver.

---

## 8. Dauerhafte Leitplanken

- Die FEM-Rechnung bleibt unabhängig von Auswahl- und Darstellungszustand.
  Der Viewer zeigt genau einen von der Anwendung gewählten Lastfall; der Solver
  bekommt die Lastfall-ID als Eingabe.
- Auswertungsdaten müssen beim Ergebnis verbleiben und serialisierbar sein.
  Ein abgelegtes Ergebnis darf für Schnittgrößen nichts am aktuellen Modell nachlesen müssen.
- Fachliche Skalierung und Bildschirmgeometrie getrennt halten: Lasten,
  Gelenke und Beschriftungen bleiben bei Zoom lesbar.
