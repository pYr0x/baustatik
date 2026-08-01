# Teil 1 — Querschnittswerte: parametrische Formen + Stahlprofil-Katalog

Teil 2 (beliebige dünnwandige Querschnitte) steht in
[`PLAN-duennwandige-querschnitte.md`](PLAN-duennwandige-querschnitte.md) und
kommt **später**. Dieser Plan ist so geschnitten, dass Teil 2 rein **additiv**
darauf aufsetzt — keine Änderung an Typen, die hier entstehen.

## Context

Der FEM-Strang rechnet, aber mit erfundenen Steifigkeiten: in
`apps/demo/fem-viewer.ts:269` und `apps/demo/fem-scripting.ts:148` steht
`getSectionProperties: () => ({ EA: 1e6, EI: 1000, GAs: 500 })`. Der Port
`SolverConfig.getSectionProperties` (`packages/fem-solver/src/config.ts:105`)
ist genau dafür geschnitten, und sein Kommentar benennt die Lücke schon:
*„Heute gibt es ihn nicht: `cross-section` exportiert nur den Typ `Segment`,
Fläche und Trägheitsmoment rechnet nirgends jemand aus."*

Ziel dieses Plans: **echte EA, EI und GAs für die FEM**, aus zwei Quellen —
Stahlprofil aus der Tabelle und parametrischer Querschnitt aus Formeln. Dazu
die **Spannungspunkte**, weil sie aus denselben Abmessungen fallen und die
Profildaten sonst zur Bemessung ein zweites Mal angefasst werden müssten.

Das ist Stufe 7, Schritte 1–3 aus `TODO.md`, ohne den dünnwandigen Zweig. Der
**Editor bleibt draußen** (Schritt 4). `TODO.md` begründet die Reihenfolge, und
sie gilt weiter: *„Ein Profilkatalog, der den Solver füttert, ist für sich
nützlich. Ein Editor ohne Rechenkern ist ein Zeichenprogramm."*

## Getroffene Entscheidungen

| Frage | Entscheidung |
| --- | --- |
| Paketschnitt | `cross-section` (Rechnen) + **neu** `@baustatik/steel-profiles` (Tabelle) |
| Parametrische Formen | **Closed-Form-Formeln direkt**, keine Geometrieerzeugung |
| Schub | `SectionValues` trägt **κ**; Adapter rechnet `GAs = κ · G · A` |
| Solver-Adapter | zunächst in `apps/demo`, kein eigenes Package |
| Spannungspunkte | **jetzt mit**, als gerechnete Vorlage je Profilreihe — nicht als Tabellenspalten (Befund 3) |
| Datenbasis | `IPE.md` + `HEA.md` (RSTAB-Export), HEB wird nachgeliefert; Extraktion per Skript, Ergebnis eingecheckt |
| Herkunftsangabe | ehrlich als Programmausgabe („RSTAB 8.29 Querschnittsdatenbank"), Normabgleich später nachrüstbar |

**Warum die Paketgrenze zwischen Rechnen und Tabelle liegt** (der Kern der
Antwort auf „ein Package oder alles in `cross-section`"): `TODO.md:524` hält
fest, dass Tabellenwerte **keine nachgerechneten Werte** sind — `Iy` von
IPE 300 stammt aus der Norm, berücksichtigt die Ausrundungsradien und ist
gerundet. Läge der Integrator im selben Package neben der Tabelle, würde früher
oder später jemand die Tabelle „korrigieren", weil die Nachrechnung 0,3 %
daneben liegt. Die Grenze plus Herkunftsangabe je Datensatz (ADR 0001) macht
das sichtbar. Parametrische Formen sind dagegen keine Daten, sondern Formeln —
die gehören zum Rechenkern.

**Was der Wahl „Closed-Form" folgt:** Ein parametrischer Querschnitt liefert
**Werte, keine Geometrie**. Der Editor kann einen so definierten I-Träger nicht
zeichnen — in Ordnung, solange die Wege getrennt bleiben. Sollen die Formen
später gezeichnet werden, kommt je Form ein `geometry()` dazu; die Werte
bleiben trotzdem aus der Formel, sonst gibt es zwei Rechenwege.

**Was der Wahl „κ" folgt:** `kappaY`/`kappaZ` sind **optional**, `undefined`
heißt *schubstarr* — der Adapter bildet das auf das schon vorhandene
`GAs: 'rigid'` (`fem-element/src/types.ts:96`) ab. Ein geratenes κ wäre
schlechter als ein ehrliches „schubstarr". Gebraucht wird das schon in Teil 1:
nicht jede Profilreihe bringt eine Schubfläche mit (siehe unten).

---

## Befund aus `apps/demo/IPE80.pdf`

Der Ausdruck ist ein vollständiges Referenzblatt für **ein** Profil und hat drei
Dinge geklärt, von denen zwei diesen Plan korrigieren.

### Korrektur 1 — es gibt DREI Schubflächen, und wir brauchen die dritte

```
Ay    = 4,03 cm²   Az    = 2,69 cm²   „Schubfläche"
Av,y  = 5,12 cm²   Av,z  = 3,57 cm²   „Wirksame Schubfläche nach EC 3"
Apl,y = 4,78 cm²   Apl,z = 2,84 cm²   „Plastische Schubfläche"
```

Bei `A = 7,64 cm²` sind das drei verschiedene Zahlen für dasselbe Wort:

- **`Az = 2,69 cm²`** ist die Schubfläche der **schubweichen Balkentheorie**.
  `κz = Az/A = 0,352`. **Das ist die, die unser Timoshenko-Element braucht.**
- `Av,z = 3,57 cm²` ist EN 1993-1-1 §6.2.6, nachgerechnet
  `A − 2·b·tf + (tw+2r)·tf = 7,64 − 4,784 + 0,718 = 3,57` ✓ — **Bemessung**.
- `Apl,z = 2,84 cm²` geht in `Vpl,z,d` ein — ebenfalls Bemessung.

Der Entwurf hatte das Feld `Avz` genannt und mit „Schubfläche für Vz"
kommentiert. Das ist mehrdeutig und hätte beim Abtippen mit hoher
Wahrscheinlichkeit den EC3-Wert eingesammelt: `GAs` wäre bei IPE 80 um **33 %
zu groß** gewesen, ohne dass ein Test anschlägt — eine zu steife Rechnung
sieht plausibel aus. Das Feld heißt jetzt `Az`, und der Unterschied steht im
Kommentar.

`Ay`/`Az` stehen in gedruckten Profiltabellen **nicht** — die geben `Av` nach
EC 3. Die Datenbasis (siehe unten) führt sie für jedes Profil, damit ist κ von
Anfang an für alle Reihen da. Im Typ bleiben sie trotzdem **optional**: eine
später ergänzte Reihe ohne Schubfläche soll schubstarr rechnen dürfen statt
einen Näherungswert zu erfinden.

### Korrektur 2 — `Wpl` ist bestätigt materialfrei, die Bemessungswerte stehen daneben

Die PDF trennt es selbst sauber. Materialfrei tabelliert:
`Wpl,y = 23,22 cm³`, `Wpl,z = 5,82 cm³`, dazu der plastische Formbeiwert
`αpl,y = Wpl,y/Wel,y = 23,22/20,03 = 1,159` ✓.

Materialabhängig, und ausdrücklich mit **„für S 235"** beschriftet:

| Wert | PDF | nachgerechnet |
| --- | --- | --- |
| `Npl,d` | 166,705 kN | `A · fy,d` = 7,64 × 21,82 = 166,70 ✓ |
| `Vpl,z,d` | 35,808 kN | `Apl,z · fy,d/√3` = 2,84 × 12,60 = 35,78 ✓ |
| `Mpl,y,d` | 5,067 kNm | `Wpl,y · fy,d` = 23,22 × 21,82 = 506,6 kNcm ✓ |

`fy,d = 240/1,1 = 21,82 kN/cm²` — **DIN 18800-1 rechnet S235 mit 240 N/mm²,
nicht mit 235.** Genau die Sorte stiller Abweichung, für die ADR 0001 existiert.

Zweiter materialabhängiger Block: die **Knicklinien**. RSTAB löst die
Materialabhängigkeit nicht als Funktion, sondern durch vier Spaltenpaare —
`KLy/z,DIN`, `KLy/z,DIN,S460`, `KLy/z,EN`, `KLy/z,EN,S460`. Nicht nachbauen:
die Knicklinie ist `(Profilform, Güte, Norm) → Linie` und gehört ins spätere
Bemessungspaket. `steel-profiles` liefert nur die Formseite.

**Alles in dieser Korrektur gehört NICHT in diesen Plan** — siehe
„Ausdrücklich nicht in diesem Plan". Sie steht hier, weil sie beim Abtippen der
Tabellen sonst mit hineinrutscht.

### Befund 3 — Spannungspunkte kommen mit, und sie kosten keine einzige Tabellenzeile

13 Punkte je Profil mit `{ nr, y, z, t, Sy, Sz, ω, Sω }`.

Ich hatte das zunächst auf ein späteres Bemessungspaket geschoben. Der Einwand
dagegen ist richtig und derselbe wie bei `Wpl`: **400 Profilzeilen fasst man
einmal an.** Beim Nachrechnen an der PDF stellt sich allerdings heraus, dass
die Sorge unbegründet war — es gibt hier gar nichts abzutippen.

**Die Punkte sind ein Bauplan je Profilreihe, keine Daten je Profil.** Jedes
I-Profil hat dieselben 13 Punkte in derselben Nummerierung; was sich von IPE 80
zu HEB 300 ändert, sind nur die fünf Abmessungen, die schon in der Zeile
stehen. Gegen die PDF nachgerechnet:

| | Formel | PDF |
| --- | --- | --- |
| y | `±b/2`, `±(tw/2+r)`, `0` | ±23,0 ±6,9 0 ✓ |
| z | `±h/2`, `±(h/2−tf−r)`, `0` | ±40,0 ±29,8 0 ✓ |
| t | `tf` am Flansch, `tw` am Steg | 5,2 / 3,8 ✓ |
| Sy(P11) | Flansch + Ausrundung, integriert | 9,92 (gerechnet 9,90) ✓ |
| Sy(P13) | = `Sy,max` aus der Tabelle | 11,61 ✓ |

**Die Datenbasis enthält die Punkte zwar tabelliert** (13 je Profil, 42 Profile
= 546 Zeilen) — sie werden trotzdem **gerechnet**. Der Grund steht in den
Daten selbst. IPE 220, Punkte 11 und 12, dieselbe Stelle gespiegelt:

```
11 | y=0,0 | z=−88,8 | Sy = −119,44
12 | y=0,0 | z=+88,8 | Sy = −119,73
```

Bei einem doppelsymmetrischen Profil müssen die gleich sein. Die 0,25 % sind
RSTABs interne Diskretisierung; dasselbe bei den Punkten 2/7 (−38,78 / −38,84).
Diese Spalten sind also **eine Programmausgabe, keine Tabelle** — anders als
`Iy` oder `Wpl`, die aus der Norm kommen. Ein gerechneter Wert ist exakt
symmetrisch, gilt für jede spätere Reihe (U, Winkel, Rohr) ohne neuen Export,
und die 546 Zeilen werden zum **Prüfstein statt zum Ballast**.

Damit fällt die Entscheidung anders aus als im ersten Entwurf:

1. **Kein Feld in `SteelProfileData`, sondern eine Funktion** in
   `cross-section` über die Abmessungen der Zeile. Die Bundle-Sorge („5200
   Zeilen in jedem Bundle, das nur `Iy` will") löst sich damit von selbst:
   eine Funktion, die niemand importiert, fällt beim Tree-Shaking heraus.
2. **Genau eine neue Spalte:** `Sz` (statisches Moment um z). `Sy` steht
   ohnehin in jeder Tabelle. Beide sind ab jetzt doppelt nützlich — als
   Eingang für τ **und** als Prüfstein: das integrierte `Sy` im Schwerpunkt
   muss den Tabellenwert treffen, je Profil, alle 400. Ein besserer Test als
   jede Handrechnung.
3. **`ω` und `Sω` bleiben draußen.** Wölbkrafttorsion, und `StressPoint` kann
   sie später als optionale Felder bekommen — das berührt weder eine
   Tabellenzeile noch einen bestehenden Aufrufer.

**Die Nummerierung ist ein veröffentlichter Vertrag.** Die PDF druckt „S-Punkt
Nr. 1…13"; sobald unser Bericht das auch tut, ist Nummer↔Ort festgenagelt. Wir
übernehmen die RSTAB-Reihenfolge (1–5 oberer Flansch von links, 6–10 unterer,
11/12 Steganfang oben/unten, 13 Schwerpunkt), weil es sie schon gibt und ein
zweiter Standard niemandem hilft. Ein Test hält sie fest, bevor der erste
Bericht sie druckt.

Nebenbei bestätigt die PDF unsere Achskonvention: das Modell steht auf
„Positive Richtung der globalen Z-Achse: **Nach unten**", und die Punkte 1–5
mit `z = −40,0` sind der **obere** Flansch. Dieselbe Richtung wie
`fem-geometry` und wie `Segment {y, z}`.

**Der Preis, ehrlich benannt:** die Ausrundung sauber mitzuintegrieren ist die
fummeligste Rechnung in diesem Plan — die Fläche zwischen Flanschunterseite und
geradem Stegteil ist `tw·r + 2·(1−π/4)·r²` mit einem Schwerpunkt, den man
herleiten muss.

Dass es geht, ist allerdings **nachgerechnet**, nicht gehofft. Dieselbe
Integration liefert für IPE 80 aus nur `h, b, tw, tf, r`:

```
A     = 2·b·tf + (h−2tf)·tw + (4−π)·r²   = 7,643 cm²   Tabelle 7,64   ✓
Iy    = Flansche + Steg + 4 Ausrundungen = 80,14 cm⁴   Tabelle 80,14  ✓
Wpl,y = 2·Sy,max                         = 23,22 cm³   Tabelle 23,22  ✓
```

Die Routine, die die Spannungspunkte braucht, reproduziert also die
Katalogwerte auf Tabellengenauigkeit. Zusammen mit dem `Sy,max`-Abgleich je
Profil und den 546 Referenzpunkten ist das dreifach abgesichert.

---

## Datenbasis

`apps/demo/HEA.md` und `IPE.md` (dieselbe RSTAB-Quelle wie `IPE80.pdf`, nur als
Markdown statt PDF) sind der Datenbestand. Geprüft:

| | IPE.md | HEA.md | HEB |
| --- | --- | --- | --- |
| Profile | **18** — IPE 80…600, vollständige Reihe | **24** — HEA 100…1000, vollständig | **fehlt**, wird nachexportiert |
| Werteblock je Profil | ja, ~40 Zeilen | ja | — |
| Spannungspunkte | 13 je Profil | 13 je Profil | — |

Stichproben gegen veröffentlichte Werte stimmen exakt: IPE 120
`A = 13,21 / Iy = 317,8 / Wpl,y = 60,73 / It = 1,74`, HEA 300
`A = 112,5 / Iy = 18260`, HEA 360 `A = 142,8`, HEA 500 `A = 197,5`.

### Extraktion

Ein **einmaliges Skript im Repo**, nicht Handarbeit und nicht im Build:
`packages/steel-profiles/scripts/extract.ts` liest die `.md` und schreibt
`src/data/*.ts`. Die erzeugten Dateien werden **eingecheckt** — der ganze Sinn
des Katalogs ist, dass man die Zahlen im Diff sieht. Das Skript bleibt liegen,
damit eine nachgelieferte Reihe (HEB) reproduzierbar dazukommt.

Die Quelldateien ziehen dabei nach
`packages/steel-profiles/data-source/{IPE,HEA,HEB}.md` um; in `apps/demo` haben
sie nichts zu suchen.

**Parser-Fallen, beide bereits nachgewiesen:**

1. **Nicht naiv nach Label greppen.** Die Zellen enthalten `<br>` und
   uneinheitliche Leerzeichen — `Schubfläche<br>Az` trifft nur 8 der 18
   IPE-Zeilen. Nach Normalisierung (`<br>` → Leerzeichen, Whitespace
   kollabieren) ist es eine saubere `| Label | Symbol | Wert | Einheit |`-Tabelle
   und alle 18 treffen.
2. **Nicht auf das Symbol schlüsseln.** Die Konvertierung hat die griechischen
   Buchstaben verschluckt: `Iω` heißt jetzt `I`, `ωmax` heißt `max`,
   `αpl,y` heißt `pl,y`. Schlüssel ist **Label + Einheit** — bei `Iw` macht
   erst `cm⁶` es eindeutig.

Das Skript muss am Ende die Zeilenzahl je Reihe gegen die erwartete Anzahl
prüfen (18 / 24 / 24) und bei Abweichung abbrechen. Ein stillschweigend
übersprungenes Profil ist der wahrscheinlichste Fehler dieses ganzen Plans.

### Herkunftsangabe

Entschieden: **ehrlich als Programmausgabe deklarieren.**

```
// Quelle: RSTAB 8.29.01 Querschnittsdatenbank (Dlubal),
//         Ausdruck vom 29.07.2026, extrahiert mit scripts/extract.ts.
// Tabellenwerte — NICHT nachgerechnet. Abweichungen gegen einen
// Integrator sind erwartet (Ausrundungsradien, Rundung).
```

Für die Spannungspunkte lautet dieselbe Zeile anders — „aus den Abmessungen
gerechnet, gegen die RSTAB-Punkte geprüft". Zwei Sorten Herkunft im selben
Package, und genau deshalb steht sie je Datei und nicht einmal zentral.

Falls das Package später wirklich veröffentlicht wird, ist ein Abgleich gegen
EN 10365 (Abmessungen) und einen freien Herstellerkatalog (Querschnittswerte)
nachrüstbar, ohne eine Zeile anzufassen — es wäre reine Zitierarbeit.

### IPE 80 bleibt der goldene Einzelfall

`apps/demo/IPE80.pdf` ist der vollständige Ausdruck für ein Profil und wird
nicht durch die Massendaten ersetzt: an ihm sind die Werte von Hand
nachgerechnet (Korrektur 1 und 2 oben), er ist also die einzige Stelle, an der
nicht nur „Datei sagt X" geprüft wird, sondern „X ist richtig".

---

## Paket 1 (neu): `@baustatik/steel-profiles`

Blatt-Package, **null Dependencies**, wie `@baustatik/actions` (ADR 0015).
Nichts wirft: der Lookup liefert `undefined` statt eines Fehlers, damit die
Fehlerhierarchie und damit `@baustatik/errors` gar nicht erst gebraucht wird.

Aufbau nach dem Muster von `packages/material/`:

```
packages/steel-profiles/
  data-source/IPE.md, HEA.md, HEB.md      <- Rohdaten, umgezogen aus apps/demo
  scripts/extract.ts                      <- einmalig, erzeugt src/data/*
  src/data/ipe.ts, hea.ts, heb.ts         <- erzeugt UND eingecheckt
  src/types.ts                            <- SteelProfile
  src/lookup.ts                           <- lookupProfile, profileSeries
  src/index.ts
  tests/
  package.json  tsconfig.json  vite.config.ts  vitest.config.ts  CONTEXT.md
```

**Reihenfolge:** IPE und HEA können sofort laufen, HEB kommt nach, sobald der
Export da ist. Das Skript und der Typ ändern sich dafür nicht — genau dafür ist
die Struktur gebaut. Bis dahin fehlt in `ProfileId` schlicht die HEB-Union.

**Datensatzform.** Die volle Standardzeile auf einmal, nicht das Minimum: 400
Zeilen will man **einmal** abtippen. Eine Spalte nachzutragen heißt, jede Zeile
erneut anzufassen — und jede Berührung ist eine Gelegenheit für einen
Zahlendreher.

```ts
export interface SteelProfileData {
  /** Abmessungen [mm]. */
  readonly h: number; readonly b: number;
  readonly tw: number; readonly tf: number; readonly r: number;

  /** Querschnittsfläche [cm²]. */
  readonly A: number;

  /**
   * Schubflächen der SCHUBWEICHEN BALKENTHEORIE [cm²] — daraus kappa = A_/A.
   *
   * NICHT `Av` nach EN 1993-1-1 §6.2.6 und NICHT `Apl`: bei IPE 80 ist
   * Az = 2,69, Av,z = 3,57 und Apl,z = 2,84. Wer hier den EC3-Wert einträgt,
   * macht den Stab um 33 % zu steif, und kein Test merkt es.
   *
   * Die Datenbasis fuehrt sie fuer jedes Profil. Optional bleiben sie fuer
   * spaeter ergaenzte Reihen ohne Schubflaeche: die rechnen dann schubstarr,
   * statt dass hier ein Naeherungswert erfunden wird.
   */
  readonly Ay?: number; readonly Az?: number;

  /** Trägheitsmomente [cm⁴] und Trägheitsradien [cm]. */
  readonly Iy: number; readonly Iz: number;
  readonly iy: number; readonly iz: number;

  /** Widerstandsmomente [cm³] — elastisch und plastisch. */
  readonly Wely: number; readonly Welz: number;
  readonly Wply: number; readonly Wplz: number;

  /** Torsion: It [cm⁴], Iw [cm⁶]. */
  readonly It: number; readonly Iw: number;

  /**
   * Statische Momente des Halbquerschnitts [cm³] — Sy,max und Sz,max.
   *
   * Doppelte Rolle: Eingang fuer tau = V*S/(I*t), UND der Pruefstein fuer die
   * berechneten Spannungspunkte. Das aus den Abmessungen integrierte Sy im
   * SCHWERPUNKT muss diesen Tabellenwert treffen — je Profil, alle 400.
   */
  readonly Sy: number; readonly Sz: number;

  /** Masse [kg/m]. */
  readonly mass: number;
}
```

`Wply`/`Wplz` sind bewusst dabei, obwohl dieser Plan sie nicht benutzt: der
IPE-80-Ausdruck belegt, dass sie **materialfrei** sind (`Mpl,y,d` entsteht erst
durch `× fy,d`), sie stehen in jeder Tabelle, und sie später nachzutragen hieße,
alle Zeilen anzufassen. Dazu die Einschränkung als Kommentar: `Wpl` ist nur bei
**homogenem** Querschnitt reine Geometrie — sobald zwei Streckgrenzen im Spiel
sind, balanciert die plastische Nulllinie Kräfte statt Flächen.

**Einheiten verbatim wie in der Norm** (mm, cm², cm⁴), nicht in Metern. Der
Grund ist Prüfbarkeit: `Iy: 8356` lässt sich gegen die Tabelle diffen,
`8.356e-5` nicht. Die Umrechnung nach SI passiert an **genau einer** Stelle,
beim Mapping nach `SectionValues` in `cross-section`.

**Herkunft je Tabelle** als Kopfkommentar, exakt wie
`material/src/data/steel.ts:1-5` es vormacht (Norm, Ausgabe, Quelle des
Gegenchecks, Einheiten) — und zusätzlich der Satz, dass diese Zahlen
**tabelliert und nicht nachgerechnet** sind, samt Grund (Ausrundungsradien,
Rundung der Norm). Eine Abweichung gegen einen Integrator ist kein Fehler.

**API:**

```ts
export type ProfileId = keyof typeof IPE | keyof typeof HEA | keyof typeof HEB;
export function lookupProfile(id: string): SteelProfile | undefined;
export function profileSeries(): readonly ProfileSeries[];  // für Auswahllisten
```

`SteelProfile` = `SteelProfileData` + `{ id, series }`.

**Start-Umfang: IPE, HEA, HEB.** U, Winkel, RHS/SHS/CHS folgen als reine
Datendateien, ohne dass am Rechenkern etwas anzufassen ist.

---

## Paket 2 (ausbauen): `@baustatik/cross-section`

Bekommt **genau eine** neue Dependency: `@baustatik/steel-profiles`. Kein
Zyklus (das Blatt hängt an nichts), und für Teil 1 wird weder `errors` noch
`section-geometry` gebraucht — beides kommt erst mit dem dünnwandigen Zweig.

### `src/values.ts` — der Wertetyp, das Rückgrat

Name bewusst **`SectionValues`**, nicht `SectionProperties` — letzteres ist in
`fem-element` schon vergeben und meint etwas anderes (Steifigkeiten, mit E und
G drin). Zwei Namen für zwei Begriffe.

```ts
export type SectionValues = {
  /** A [m²]. */            A: number;
  /** Iy, Iz [m⁴] — auf den Schwerpunkt bezogen. */
  Iy: number; Iz: number;
  /** Iyz [m⁴]. 0 bei jeder symmetrischen Form. */
  Iyz: number;
  /** Schwerpunkt im Eingabesystem y/z [m]. */
  ys: number; zs: number;
  /**
   * Schubkorrekturbeiwert der schubweichen Balkentheorie.
   * `undefined` = schubstarr. Siehe die Warnung zu Az/Av,z/Apl,z.
   */
  kappaY?: number; kappaZ?: number;
};
```

Alles in **SI-Metern**. Widerstandsmomente und Hauptachsenwinkel kommen erst
mit der Bemessung — jetzt aufgenommen wären es ungenutzte Felder.

### `src/shapes/` — parametrische Querschnitte, Closed-Form

Je Form ein Modul mit typisierten Parametern → `SectionValues`. Vier Formen:

| Form | Parameter | Besonderheit |
| --- | --- | --- |
| `rectangle` | `b, h` | κ = 5/6, beide Richtungen |
| `hollowRectangle` | `b, h, t` (umlaufend) | Iy als Differenz außen − innen; κz ≈ 2·h·t/A |
| `iSymmetric` | `h, b, tw, tf` | geschweißt, **ohne Ausrundung** — der Unterschied zum Katalog, gehört in den Kommentar |
| `tBeam` (Plattenbalken) | `bf, hf, bw, h` | **unsymmetrisch** — der einzige Fall mit `zs ≠ h/2` und Steiner-Anteil |

`tBeam` ist der wichtigste Test: der einzige, bei dem ein Vorzeichenfehler im
Steiner-Anteil oder eine falsche z-Richtung auffällt.

**κ je Form** steht als Formel neben dem Wert, mit der Quelle im Kommentar. Für
`iSymmetric` und `hollowRectangle` ist es die Stegflächen-Näherung κ ≈ A_Steg/A.
Hier gilt die Warnung aus Korrektur 1 sinngemäß: es ist **nicht** `Av` nach
EC 3. Bei `iSymmetric` mit IPE-80-Maßen kommt `hi·tw/A = 6,96·0,38/7,64 =
0,346` heraus, gegen `Az/A = 0,352` aus der PDF — 1,7 % Abweichung, und das ist
die richtige Größenordnung. Käme etwas nahe 0,47 (= Av,z/A) heraus, wäre die
falsche Formel im Code.

### `src/section.ts` — eine Tür für alle Quellen

```ts
export type CrossSection =
  | { kind: 'shape';   id: string; shape: ShapeSpec }
  | { kind: 'profile'; id: string; profile: string };

export function sectionValues(cs: CrossSection): SectionValues | undefined;
```

Teil 2 fügt `{ kind: 'thin-walled'; ... }` hinzu — **additiv**, kein Breaking
Change, solange niemand vorher exhaustiv über die Union schaltet. Der Test dazu
wird gleich mitgeschrieben.

`undefined` heißt „Profil unbekannt" und passt ohne Übersetzung auf den
bestehenden Port-Vertrag: `getSectionProperties` gibt `undefined` zurück, und
`config.ts:96-98` begründet, warum das ein **Bericht** wird und kein Wurf.

Für `kind: 'profile'` mappt eine Funktion `SteelProfileData` → `SectionValues`:
cm²→m² (`1e-4`), cm⁴→m⁴ (`1e-8`), `kappaZ = Az/A` (dimensionslos, also direkt
aus den cm²-Werten; `undefined`, wenn `Az` fehlt), `ys = zs = 0` (Katalogwerte
sind schwerpunktbezogen), `Iyz = 0`.

### `src/stress-points.ts` — wo gerechnet wird, wenn es an die Bemessung geht

```ts
export type StressPoint = {
  /** Nummer im Bericht — VERTRAG, siehe Befund 3. */
  readonly nr: number;
  /** Lage relativ zum Schwerpunkt [m]. */
  readonly y: number; readonly z: number;
  /** Wanddicke an dieser Stelle [m] — Nenner in tau. */
  readonly t: number;
  /** Statische Momente des abgeschnittenen Teils [m³]. */
  readonly Sy: number; readonly Sz: number;
};

export function stressPoints(cs: CrossSection): readonly StressPoint[] | undefined;
```

Je Quelle eine Herleitung, dieselbe Aufteilung wie bei `sectionValues`:

- **Profil:** ein Bauplan je Reihe. Für I-Querschnitte (IPE, HEA, HEB) die 13
  Punkte aus Befund 3, gerechnet aus `h, b, tw, tf, r`. U und Winkel bekommen
  später eigene Baupläne — wieder ohne dass eine bestehende Zeile angefasst
  wird.
- **Parametrische Form:** jede Form kennt ihre Punkte. Rechteck vier Ecken,
  `iSymmetric` dieselben 13 wie das Walzprofil (nur ohne Ausrundung), `tBeam`
  sechs. Die Nummerierung folgt dem Profil-Bauplan, damit ein geschweißter
  I-Träger und ein IPE im Bericht gleich zu lesen sind.

Dazu die zwei Formeln, für die die Punkte überhaupt existieren — reine
Funktionen über Zahlen, ohne Abhängigkeit zum FEM-Strang:

```ts
export function normalStress(v: SectionValues, p: StressPoint,
  f: { N: number; My: number; Mz: number }): number;   // N/A + My/Iy*z - Mz/Iz*y

export function shearStress(v: SectionValues, p: StressPoint,
  f: { Vz: number }): number;                           // Vz*Sy / (Iy*t)
```

Sie kosten sechs Zeilen und machen die Punkte prüfbar: ohne sie wäre `Sy` an
Punkt 11 eine Zahl, die niemand benutzt und deshalb niemand kontrolliert. Die
Schnittgrößen kommen als schlichtes Objekt herein — `cross-section` bekommt
dadurch **keine** Abhängigkeit auf `fem-solver` oder `fem-element`.

Was hier ausdrücklich **nicht** entsteht: ein Nachweis. `sigma <= fy/gammaM0`
braucht Material und Norm und gehört ins spätere EN-1993-Paket.

---

## Anschluss: `apps/demo/section-adapter.ts`

```ts
export function createSectionAdapter(
  sections: ReadonlyMap<string, CrossSection>,
  materials: Materials,
): (beam: Beam) => SectionProperties | undefined
```

`Beam` trägt `crossSectionId` **und** `materialId` (`fem/src/types.ts:70-71`).

**Die Einheiten-Falle, ausgeschrieben, weil sie sonst niemand sieht:**
`material` liefert `Es` in **MPa** (`material/src/data/steel.ts:19`), also
N/mm². `SectionProperties.EA` erwartet **kN**, `EI` **kNm²**
(`fem-element/src/types.ts:91-96`). Damit ist `E[kN/m²] = Es[MPa] · 1000`, und
mit `A` in m² kommt `EA` in kN heraus.

Gegenprobe an der PDF: sie druckt `E = 21000 kN/cm² = 2,1e8 kN/m²` und
`G = 8076,92 kN/cm²`. Damit ist IPE 80 aus S235:
`EA = 2,1e8 · 7,64e-4 = 160 440 kN`, `EI = 2,1e8 · 80,14e-8 = 168,3 kNm²`.
Das wird der Test.

`GAs = kappaZ === undefined ? 'rigid' : kappaZ · G · A`.

Danach `fem-viewer.ts:269` und `fem-scripting.ts:148` auf den Adapter
umstellen und je einen echten Querschnitt eintragen (z. B. HEB 300 und einen
Plattenbalken), damit sofort sichtbar ist, dass die Verformungen sich ändern.

---

## Doku

- `packages/steel-profiles/CONTEXT.md` — Zweck, Grenze, und als Erstes die
  Invariante „tabelliert, nicht nachgerechnet". Dazu die drei Schubflächen als
  Domänensprache: `Az` (Theorie) ≠ `Av,z` (EC 3) ≠ `Apl,z` (plastisch). Und der
  Weg von der `.md` zur `.ts` samt der beiden Parser-Fallen, damit ein
  Nachexport nicht neu erforscht werden muss.
- `packages/cross-section/CONTEXT.md` — neu; `SectionValues` vs.
  `SectionProperties`, κ optional mit `undefined` = schubstarr, dass
  parametrische Formen Werte und keine Geometrie liefern, und die
  Spannungspunkt-Nummerierung als Vertrag (mit dem Bild aus der PDF als
  Referenz).
- `AGENTS.md`: Zeile für `@baustatik/steel-profiles` in die Paket-Tabelle,
  Zeile 25 für `cross-section` aktualisieren (heute: „Cross-section domain
  model and calculations", Dependencies leer).
- `docs/adr/0020-section-values-separate-from-tabulated-profiles.md` — warum
  die Tabelle ein eigenes Package ist, warum parametrische Formen Closed-Form
  rechnen, warum κ optional ist, **und warum `Az` und nicht `Av,z`**.
- `docs/adr/0021-stress-points-are-a-template-not-table-data.md` — warum die
  Spannungspunkte gerechnet und nicht tabelliert werden, obwohl im selben
  Package die Regel „tabelliert, nicht nachgerechnet" gilt: es gibt für sie
  **keine** Tabellenquelle, die Herkunft ist deshalb ausdrücklich „aus den
  Abmessungen gerechnet, gegen `Sy,max` geprüft". Dazu die Nummerierung als
  Vertrag. Verhindert, dass jemand die Regeln der beiden Sorten verwechselt.
- `TODO.md` Stufe 7: Schritte 1–3 für den parametrischen und den Katalog-Zweig
  als erledigt markieren; den dünnwandigen Zweig auf Teil 2 verweisen.
- Changesets für `cross-section` (minor) und `steel-profiles` (initial).

## Verifikation

Referenz für 1–3 und 5 ist durchgehend `apps/demo/IPE80.pdf`.

1. **Katalog gegen die PDF, IPE 80:** `A = 7,64 cm²`, `Iy = 80,14 cm⁴`,
   `Iz = 8,49 cm⁴`, `Wel,y = 20,03 cm³`, `Wpl,y = 23,22 cm³`,
   `It = 0,70 cm⁴`, `iy = 3,24 cm`, `mass = 6,0 kg/m`.
2. **Umrechnung:** nach dem Mapping `A = 7,64e-4 m²`, `Iy = 8,014e-7 m⁴`.
3. **κ aus der Tabelle:** `kappaZ = Az/A = 2,69/7,64 = 0,352`. Ein zweiter
   Test hält fest, dass **`Av,z/A = 0,467` das falsche Ergebnis wäre** — der
   Test ist der Wächter über Korrektur 1.
4. **Handrechnung, Parametrik:** Rechteck 200×500 → `A = 0,1 m²`,
   `Iy = 2,0833e-3 m⁴`, `κ = 5/6`. Plattenbalken gegen eine von Hand
   gerechnete Schwerpunktlage — der Fall, der Steiner prüft.
5. **Querprobe Parametrik ↔ Katalog:** `iSymmetric` mit den IPE-80-Maßen
   (h=80, b=46, tw=3,8, tf=5,2) muss **nahe**, aber nicht gleich der Tabelle
   liegen — die Ausrundung `r = 5,0` fehlt, also kommt etwas unter
   `A = 7,64 cm²` heraus. Als Test mit großzügiger Toleranz formuliert: er
   **belegt** die Invariante, statt sie zu verletzen.
6. **Adapter-Einheiten:** IPE 80 aus S235 → `EA = 160 440 kN`,
   `EI = 168,3 kNm²` (Rechnung siehe oben).
7. **Vollzähligkeit der Extraktion:** 18 IPE, 24 HEA, 24 HEB. Das Skript
   bricht bei Abweichung ab, und ein Test wiederholt die Zählung gegen die
   erzeugten Dateien — ein stillschweigend übersprungenes Profil ist der
   wahrscheinlichste Fehler dieses Plans.
8. **Spannungspunkte gegen die PDF, IPE 80:** alle 13 Koordinaten
   (`y ∈ {±23,0, ±6,9, 0}`, `z ∈ {±40,0, ±29,8, 0}` mm), die Dicken
   (5,2 am Flansch, 3,8 am Steg) und `Sy` an Punkt 11 (9,92 cm³) und
   Punkt 1 (0). Dazu ein Test, der festhält, dass es **genau 13** sind und
   welche Nummer wo sitzt — der Vertrag aus Befund 3.
9. **Die 546 Referenzpunkte:** `cross-section/tests/fixtures/stress-points.json`
   entsteht aus derselben Extraktion und trägt alle 13 Punkte von 42 (später
   66) Profilen. Der Test läuft über alle und vergleicht `y`, `z`, `t`, `Sy`,
   `Sz`. **Toleranz 0,3 %** — hergeleitet aus der beobachteten Asymmetrie in
   den Quelldaten (IPE 220: 119,44 vs. 119,73, also ±0,12 %), nicht geraten.
   Der Kommentar am Test nennt diesen Grund, sonst zieht sie jemand später
   enger und wundert sich.
10. **Der Selbstcheck über den ganzen Katalog:** für **jedes** Profil muss das
    gerechnete `Sy` im Schwerpunkt (Punkt 13) den tabellierten Wert `Sy` der
    Zeile treffen, `Sz` analog — und `2·Sy = Wpl,y` als zweite, unabhängige
    Gleichung. Deckt Tippfehler in den Abmessungen und einen Fehler in der
    Ausrundungs-Integration gleichzeitig auf.
11. **Die Integration reproduziert den Katalog:** für jedes Profil `A` und `Iy`
    aus `h, b, tw, tf, r` gerechnet gegen die tabellierten Werte, Toleranz
    0,2 %. An IPE 80 von Hand belegt (7,643 / 80,14). Dieser Test ist der
    eigentliche Beleg dafür, dass die Ausrundung richtig sitzt — die
    Spannungspunkte erben ihn.
12. **Spannungsformeln:** IPE 80 unter `My = 5,067 kNm` (dem `Mpl,y,d` aus der
    PDF) an Punkt 1 → `σ = My/Iy · z = 5,067/8,014e-7 · 0,04 = 252,9 MN/m²`.
    Gegenprobe über `Wel,y`: `5,067/20,03e-6 = 253,0` ✓. Prüft Vorzeichen und
    Einheiten in einem Zug.
13. **End-to-end:** `pnpm --filter @baustatik/steel-profiles test`,
   `pnpm --filter @baustatik/cross-section test`, dann `pnpm build` und
   `pnpm dev` — im Demo-Kragarm den Querschnitt von HEB 300 auf IPE 300
   umstellen und prüfen, dass die Verformung im erwarteten Verhältnis wächst
   (`Iy` 25170 vs. 8356 cm⁴ → Faktor ≈ 3,0).
14. `pnpm lint` und `pnpm test` über das Repo, weil `AGENTS.md` und die
    Demo-Composition-Roots mit angefasst werden.

## Ausdrücklich nicht in diesem Plan

- **Beliebige dünnwandige Querschnitte** — Teil 2,
  [`PLAN-duennwandige-querschnitte.md`](PLAN-duennwandige-querschnitte.md).
- Der **Editor** (Stufe 7.4) — braucht Teil 1 und Teil 2 als Voraussetzung.
- **Bemessungswerte**: `Npl,d`, `Vpl,z,d`, `Mpl,y,d`, Querschnittsklasse,
  `A_eff`/`W_eff`, Knicklinien. Alle materialabhängig (siehe Korrektur 2), alle
  in ein späteres EN-1993-Paket. Weder `steel-profiles` noch `cross-section`
  darf `fy` kennen.
- **Der Spannungsnachweis** — `σ` und `τ` werden gerechnet (Befund 3), aber
  nicht gegen `fy/γM0` gestellt. Das braucht Material und Norm.
- **Spannungspunkte für U und Winkel** — die 13-Punkte-Vorlage gilt für
  I-Querschnitte. Andere Reihen bekommen eigene Vorlagen, sobald ihre Daten da
  sind; bestehende Zeilen ändern sich dadurch nicht.
- **`Av,z` und `Apl,z`** als Katalogspalten — gehören zur Bemessung, und im
  selben Datensatz neben `Az` wären sie eine Einladung zur Verwechslung.
- **Wölbgrößen** (`ω`, `Sω`, Schubmittelpunkt) und Hauptachsendrehung — erst
  mit Torsion bzw. unsymmetrischen Querschnitten. `Iw` reist als Tabellenspalte
  mit, wird aber nicht ausgewertet; `StressPoint` kann `ω`/`Sω` später als
  optionale Felder bekommen, ohne dass eine Tabellenzeile angefasst wird.
- **Polygon-Trägheitsmomente in `section-geometry`** — durch die
  Closed-Form-Entscheidung hier nicht gebraucht. Fällig, sobald ein
  Vollquerschnitt aus beliebigen Polygonen kommen soll.
- **(c/t)-Teile** und Querschnittsklassifizierung — `c` und `c/t` sind
  Geometrie, aber die Klasse braucht `ε = √(235/fy)`, also Material.
