# `@baustatik/fem-section-resolve`

## Zweck

`CrossSection` × `Material` → `SectionStiffness`. Der Zwilling von
`@baustatik/fem-load-resolve`: Domaeneneingabe hinein, Elementzahlen heraus.

```text
CrossSection.data / .shape            Material.moduli { E, G }
   -> SectionProperties                      (Kopie im Modellsatz)
                        \                    /
                         v                  v
                @baustatik/fem-section-resolve
                  resolveSectionStiffness(beam, model) -> SectionStiffness | undefined
                                  |
                                  v
                fem-element  SectionStiffness { EA, EI, GAs }
```

**Beide Eingaben kommen aus dem Modell**, keine aus einem Katalog: seit
[ADR 0027](../../docs/adr/0027-catalogues-are-import-sources.md) tragen die
Saetze ihre Zahlen selbst. Nachgeschlagen wird beim Anlegen, nicht beim Rechnen.

Dies ist die **einzige** Stelle im Repository, an der Geometrie mit Material
multipliziert wird.

## Die Einheitenkette, ausgeschrieben

`material` liefert `Es` und `G` in **MPa** (N/mm²), `SectionStiffness` erwartet
`EA` in **kN** und `EI` in **kNm²**. Dazwischen steht **eine** Zahl:

```text
1 MPa = 1 N/mm² = 1e6 N/m² = 1e3 kN/m²
```

Also `E[kN/m²] = Es[MPa] · 1000`, und mit `A` in m² kommt `EA` in kN heraus:

| | | IPE 80 in S235 |
| --- | --- | --- |
| `EA` | `E · A` | `2,1e8 · 7,64e-4 = 160 440 kN` |
| `EI` | `E · Iy` | `2,1e8 · 8,014e-7 = 168,3 kNm²` |
| `GAs` | `kappaZ · G · A` | `0,352 · 8,0769e7 · 7,64e-4 = 21 727 kN` |

Bei einem Katalogprofil ist `kappaZ = Az/A`, also `kappaZ · G · A ≡ G · Az`.
Ein zweiter Test rechnet direkt `8,0769e7 · 2,69e-4` und muss dieselbe Zahl
treffen — das deckt einen vertauschten oder doppelt angewandten κ-Faktor auf,
den die erste Rechnung allein nicht sieht.

`κ` gehoert zu **z**, weil der ebene Rahmen um y biegt und quer in z schiebt.

## Zwei Funktionen, zwei Aufgaben

- **`resolveSectionStiffness(beam, model)`** loest die IDs auf.
- **`sectionStiffness(props, moduli)`** rechnet.

**Eine Herkunft.** Bis ADR 0027 kam ein dritter Parameter `catalog` herein, und
die Naht zwischen „was gespeichert wird" und „was am Nationalen Anhang haengt"
lag genau hier. Seit die Moduln als Kopie im Modellsatz stehen, gibt es diese
Naht nicht mehr: `model` (`crossSections` und `materials`) ist alles. Ein Store,
der beide Listen fuehrt, erfuellt `SectionModel` strukturell und reist als ein
Stueck hinein.

Die Naht liegt zwischen Nachschlagen und Multiplizieren. Wer schon
`SectionProperties` in der Hand hat — Bemessung, Vorbemessung, ein Diagramm
ueber eine Profilreihe — braucht die Aufloesung nicht.

## Keine Fabrik, keine Closure, keine Map

Solange der Querschnitt **Anwendungszustand** war, brauchte der Adapter eine
Sammlung und musste deshalb `createSectionAdapter(...)` heissen. Als
**Modellsatz** braucht er sie nicht: die Querschnitte reisen mit dem Modell, und
eine reine Funktion, die sie entgegennimmt, hat keinen Zustand, der veralten
koennte. Seit ADR 0026 gilt dasselbe fuer das Material.

## Die Familienwahl ist hier verschwunden

Der `switch` ueber `Material.kind` mit einem `as SteelGrade` je Zweig stand bis
ADR 0027 hier. Er ist **ersatzlos weg**: die Wahl faellt einmal beim Anlegen des
Modellsatzes, und `Material.moduli` traegt das Ergebnis. Welche Zuordnung dabei
gilt, sagt `@baustatik/material` (`lookupMaterial`):

| `kind` | E | G |
| --- | --- | --- |
| `steel` | `Es` | `G` |
| `concrete` | `Ecm` | `G` (= `Ecm/(2(1+ν))`, ν = 0,2, **ungerissen**) |
| `timber` | `E0mean` | `Gmean` |

Alle drei sind **charakteristische** Werte. Bis ADR 0026 war das eine
Zusicherung mit Test (`EA`/`EI`/`GAs` identisch unter DE und EN); seit ADR 0027
ist es eine Bauform — dieses Package hat keinen Parameter mehr, an dem ein
Anhang haengen koennte, und importiert `@baustatik/material` nur noch fuer zwei
Typen.

Warum der Adapter hier lebt und nicht in `cross-section`: `cross-section` bleibt
damit frei von `material` und `fem-element`. Der Wertekern beantwortet „was ist
die Flaeche", nicht „wie steif ist der Stab".

## Was `undefined` heisst

Unbekannter `crossSectionId`, unbekannter `materialId`, oder ein Querschnitt,
dessen Werte sich nicht bilden lassen. Der Solver-Port `getSectionStiffness` hat
genau dieses Vokabular; daraus wird ein Modellfehler **im Bericht**
(`UnknownSectionStiffnessError`) statt einer Ausnahme mitten in `solve()`.

**„Unbekannte Sorte" und „unbekanntes Profil" stehen seit ADR 0027 nicht mehr
in dieser Liste.** Die Zahlen stehen im Satz, also gibt es sie. Was uebrig
bleibt, sind Verweise, die ins Leere gehen — und das ist eine Aussage ueber das
Modell, keine ueber einen Katalog. Ein Tippfehler in Profil oder Sorte wird beim
**Anlegen** gemeldet (`FEMScriptError` in `@baustatik/script`), dort, wo er
steht. Damit sind zwei Fehler getrennt, die vorher als dasselbe `undefined` im
Bericht landeten.

## Was hier NICHT entschieden wird

- **Der Schubschalter.** Ob Schub ueberhaupt beruecksichtigt wird, ist eine
  globale Analyse-Einstellung; `fem-solver` ersetzt `GAs` bereits durch
  `'rigid'`, wenn `policy.shearDeformation === false`. Ein zweiter Schalter
  hier waere ein zweiter Ort fuer dieselbe Entscheidung.
- **Schubstarr vs. κ = 0.** `κ === undefined` heisst schubstarr und wird zu
  `'rigid'`; `κ = 0` hiesse „keine Schubsteifigkeit" — das Gegenteil. Der
  Adapter uebersetzt, er interpretiert nicht.
- **Der Zustand des Betons.** Siehe den eigenen Abschnitt unten — die Annahme
  ist gross genug, um nicht als Aufzaehlungspunkt zu enden.
- **Kriechen und `kdef` beim Holz.** `E0,mean` ist der Anfangswert. End- statt
  Anfangsverformung ist dieselbe Sorte Entscheidung wie oben.

## Zustand I ist die stillschweigende Annahme

Beton wird hier **linear-elastisch im Zustand I** gerechnet: ungerissener
Querschnitt, Zugzone voll mitwirkend, `Ecm` und `G = Ecm/(2(1+ν))` mit ν = 0,2
(EN 1992-1-1 §3.1.3(4)). Die drei Zeilen in `resolveModuli` sind die Stelle, an
der diese Annahme vollzogen wird.

Sie ist teurer, als sie aussieht, und die Kosten gehoeren hierhin geschrieben —
sonst liest jemand spaeter eine Verformung ab und glaubt ihr.

### 1. Durchbiegungen stimmen nicht

Im Gebrauchszustand ist beim Stahlbeton in der Regel **Zustand II** massgebend.
Sobald `fctm` in der Zugzone ueberschritten ist, reisst der Querschnitt, und die
wirksame Steifigkeit faellt — bei einem ueblichen Plattenbalken um ein
Mehrfaches. `EI` liegt hier also **zu hoch**, und die berechnete Verformung ist
**zu klein**.

Fuer Schnittgroessen am statisch bestimmten System ist das folgenlos: dort
haengt nichts an der Steifigkeit. Fuer einen Verformungsnachweis und fuer jedes
statisch unbestimmte System, dessen Kraefteverteilung sich nach der
Steifigkeitsverteilung richtet, ist es das nicht.

EN 1992-1-1 §7.4.3 interpoliert dafuer mit ζ zwischen Zustand I und II. Nichts
davon ist hier abgebildet.

### 2. Es gibt keine nichtlineare Bemessung im GZT

Ein Verfahren nach EN 1992-1-1 §5.7 braucht eine last- und rissabhaengige
Steifigkeit. Solange `getSectionStiffness` einen festen Wert liefert, ist die
Bemessung auf **linear-elastisch ermittelte Schnittgroessen** festgelegt — mit
oder ohne Umlagerung, aber nicht nichtlinear.

### 3. Die Superposition faellt — und das trifft die Signatur

Rissbildung ist **lastabhaengig**. Ob ein Querschnitt reisst, entscheidet die
Beanspruchung, nicht der Stab. Sobald der Zustand mitgerechnet wird, ist die
Steifigkeit keine Eigenschaft des Stabes mehr, sondern des Paares
**(Stab, Lastniveau)**.

Damit faellt das Superpositionsprinzip: Lastfaelle lassen sich nicht mehr
getrennt rechnen und hinterher zu einer Kombination summieren. Man muss die
**Kombination selbst** rechnen. Genau dieselbe Bruchstelle hat Theorie
II. Ordnung, und aus demselben Grund.

Das trifft nicht nur den Zahlenwert, sondern die **Bauform des Ports**:

```ts
getSectionStiffness(beam: Beam): SectionStiffness | undefined
//                  ^^^^ kein Lastfall, und es kann keinen geben
```

Der Port aus [ADR 0009](../../docs/adr/0009-fem-solver-ports-and-async-solve.md)
setzt voraus, dass die Steifigkeit lastunabhaengig ist. Das ist kein
Versaeumnis — es ist die Bauform von Theorie I. Ordnung im Zustand I, und
solange beides gilt, ist die schmale Signatur die richtige.

### Wohin der Schalter spaeter gehoert

Nicht an das Material (`Material` nennt eine Sorte, keinen Rechenzustand) und
nicht an diesen Adapter (er uebersetzt, er interpretiert nicht). Er gehoert
dorthin, wo auch **Theorie I./II. Ordnung** hingehoert — an das, was gerechnet
wird: den Lastfall bzw. die Kombination. Beide Schalter sind vom selben Typ, sie
brechen dieselbe Annahme, und sie sollten zusammen entschieden werden.

Vermerkt in `fem-solver/CONTEXT.md` („Keine Kombinationen") und
`fem-loads/CONTEXT.md` („Known constraints").
- **Eigengewicht.** `selfWeight` aus `A × gamma` ist der naechste Schritt und
  gehoert hierher — die Zutaten stehen bereits beide auf dem Tisch.
