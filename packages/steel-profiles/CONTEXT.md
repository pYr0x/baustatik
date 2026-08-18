# `@baustatik/steel-profiles`

## Die Invariante zuerst

> **Tabelliert, nicht nachgerechnet.**

`Iy` von IPE 300 steht hier, weil es in der Norm steht — mit Ausrundungsradien,
mit der Rundung der Norm, mit der Asymmetrie, die ein Ausdruck nun einmal hat.
Es steht **nicht** hier, weil jemand es ausgerechnet hat.

Wer den Katalog gegen einen Integrator haelt, findet Abweichungen von einigen
Zehntelprozent. Das ist der **erwartete** Befund und nie ein Grund, die Tabelle
zu korrigieren. Genau deshalb liegt der Integrator in einem anderen Package:
laege er nebenan, wuerde frueher oder spaeter jemand die Tabelle „richtigstellen",
weil die Nachrechnung 0,3 % daneben liegt.

## Zweck und Grenze

Ein **Blatt-Package ohne jede Abhaengigkeit** — nicht einmal
`@baustatik/errors`, weil nichts wirft: `lookupProfile` liefert `undefined`.
Dasselbe Muster wie `@baustatik/actions`
([ADR 0015](../../docs/adr/0015-action-categories-live-in-a-leaf-package.md)).

Es enthaelt **Daten und einen Lookup**. Es enthaelt keine Rechnung, keine
Geometrie, keine Spannungspunkte und vor allem **keine Festigkeit**: `fy`,
Querschnittsklasse, `Npl,d` gehoeren in das spaetere EN-1993-Paket. Ein Profil
ist hier eine Zeile aus Zahlen, kein Bauteil.

Der Katalog ist eine **Importquelle, keine Live-Referenz**
([ADR 0027](../../docs/adr/0027-catalogues-are-import-sources.md)): `lookupProfile`
wird gerufen, wenn ein Querschnitt ANGELEGT wird, und die Zeile geht als Kopie
ins Modell. Dieses Package weiss davon nichts — es liefert nur zwei Dinge dazu:
`profileData(p)` streift `id` und `series` ab, und `PROFILE_DATA_KEYS` sagt,
woraus eine Zeile besteht, damit der Snapshot-Parser keine zweite Spaltenliste
fuehren muss. Beide Richtungen der Liste sind zur Uebersetzungszeit belegt:
`satisfies` verbietet einen Namen, den es nicht gibt, `NoColumnMissing` eine
Spalte, die fehlt.

Wer daraus `A`, `Iy` und κ in SI-Einheiten braucht, geht ueber
`@baustatik/cross-section`; wer daraus `EA`, `EI`, `GAs` braucht, ueber
`@baustatik/fem-section-resolve`.

## Domaenensprache: drei Schubflaechen, drei Bedeutungen

Der gedruckte Ausdruck fuehrt fuer IPE 80 **drei** Schubflaechen nebeneinander, und
sie sind nicht austauschbar:

| Groesse | IPE 80 | Bedeutung | Wofuer |
| --- | --- | --- | --- |
| `Az` | 2,69 cm² | Schubenergie, `A_s = I² / ∫ (S/t)² dA` | **Verformung** — das ist unsere Spalte |
| `Av,z` | 3,57 cm² | wirksame Schubflaeche nach EN 1993-1-1 §6.2.6 | Tragfaehigkeit |
| `Apl,z` | 2,84 cm² | plastische Schubflaeche | Traglast |

Der Datensatz fuehrt **nur `Ay`/`Az`**. `Av` und `Apl` fehlen mit Absicht: neben
`Az` waeren sie eine Einladung zur Verwechslung, und wer den EC3-Wert einsetzt,
macht den Stab um ein Drittel zu steif, ohne dass eine Rechnung stolpert.
`tests/catalogue.test.ts` haelt den Unterschied als Waechter fest.

`Ay`/`Az` sind **optional**. Eine spaeter ergaenzte Reihe ohne Schubflaechen
rechnet dann schubstarr — besser als ein hier erfundener Naeherungswert.

## Einheiten

**Verbatim wie in der Norm**: mm, cm², cm³, cm⁴, cm⁶, kg/m. Nicht SI.

Der Grund ist Pruefbarkeit: `Iy: 8356` laesst sich gegen die gedruckte Tabelle
diffen, `8.356e-5` nicht. Die Umrechnung nach SI passiert an **genau einer**
Stelle, im Profil-Mapping in `@baustatik/cross-section`.

Eine Ausnahme, weil die Quelle uneinheitlich ist: die Traegheitsradien druckt
die Quelle in **mm**, der Datensatz fuehrt sie in **cm** (IPE 80: `iy = 3,24`). Das
Skript rechnet um.

`Wpl` reist mit, obwohl dieser Rechenstand es nicht benutzt: es ist
**materialfrei** (`Mpl,y,d` entsteht erst durch `× fy,d`) und damit hier
richtig — allerdings nur bei **homogenem** Querschnitt reine Geometrie.

`SyMax`/`SzMax` sind die statischen Momente des **Halbquerschnitts**. Nicht zu
verwechseln mit `StressPoint.Sy` in `cross-section`, das **am Ort** gilt; die
Namen sind bewusst verschieden.

## Der Weg von `.md` nach `.ts`

`data-source/{IPE,HEA}.md` sind PDF-Exporte des Querschnittsausdrucks.
`scripts/extract.ts` liest sie und schreibt `src/data/{ipe,hea}.ts`. Die
erzeugten Dateien sind **eingecheckt** — der Sinn des Katalogs ist, dass man die
Zahlen im Diff sieht.

`data-source/` selbst ist **nicht versioniert** (`.gitignore`): mehrere
Megabyte PDF, die nach dem einmaligen Lauf niemand mehr braucht. Wer das Skript
erneut laufen lassen will, legt die Ausdrucke wieder dort ab; wer nur die Zahlen
lesen will, braucht sie nicht. Was versioniert ist, ist das Ergebnis — und der
Kopfkommentar jeder Datendatei nennt Quelle und Ausdrucksdatum.

```text
pnpm --filter @baustatik/steel-profiles extract
```

Kein Build-Schritt, kein `tsx`: Node ≥ 22.6 strippt die Typen selbst.

### Drei nachgewiesene Parser-Fallen

1. **Nicht naiv nach Label greppen.** Die Zellen enthalten `<br>` und
   uneinheitliche Leerzeichen; `Schubfläche<br>Az` trifft nur einen Teil der
   Zeilen. Nach Normalisierung ist es eine saubere
   `| Label | Symbol | Wert | Einheit |`-Tabelle.
2. **Nicht auf das rohe Symbol schluesseln.** Die griechischen Buchstaben sind
   in die Private Use Area des Symbolfonts gerutscht: ω ist `U+F077`, α ist
   `U+F061`. Roh gelesen heisst `Iω` einfach `I`. Das Skript bildet die beiden
   Zeichen zurueck ab; danach ist das **Symbol** der eindeutige Schluessel — das
   **Label** ist es nie („Statisches Moment" steht zweimal da).
3. **Zellen verschmelzen ueber Zeilengrenzen.** Bei IPE 80 stehen `Iw = 120.00`
   und `Wel,y = 20.03` in *einer* Wertzelle, die naechste ist leer, und die
   Einheiten sind mitverrutscht. Das Skript repariert den Fall generisch und
   **protokolliert jede Reparatur**.

### Vier Abbruchbedingungen

Ein stillschweigend uebersprungenes oder falsch zugeordnetes Profil ist der
wahrscheinlichste Fehler dieser Extraktion. Das Skript bricht ab, wenn:

- die Zeilenzahl je Reihe nicht stimmt (IPE 18, HEA 24),
- ein Profilname doppelt vorkommt,
- `h` innerhalb der Reihe nicht streng waechst (Bloecke gegen Namen verschoben),
- `A`, aus `h, b, tw, tf, r` nachgerechnet, den Tabellenwert um mehr als 1 %
  verfehlt (Zeilen innerhalb eines Blocks verschoben).

Die letzte Bedingung ist die einzige Stelle im Package, an der gerechnet wird —
als **Pruefung**, nicht als Ergebnis. `tests/catalogue.test.ts` wiederholt die
ersten drei gegen die erzeugten Dateien, damit sie auch dann noch pruefen, wenn
das Skript laenger nicht gelaufen ist.

### Ein Schreibzugriff ueber die Paketgrenze

Derselbe Lauf schreibt
`packages/cross-section/tests/fixtures/rolled-i-stress-points.json` — 42 Profile ×
13 Spannungspunkte. Die Fixture ist das **Orakel** fuer die dortige Rechnung und
nicht Teil des Katalogs, deshalb liegt sie drueben. Dass ein Skript ueber die
Paketgrenze schreibt, ist vertretbar, weil es einmalig laeuft und kein
Build-Schritt ist.

## Der goldene Einzelfall

Der Ausdruck zu IPE 80 ist der einzige Fall, in dem nicht „die Datei sagt X"
geprueft wurde, sondern **„X ist richtig"** (Handrechnung).
`tests/catalogue.test.ts` haelt die ganze Zeile fest — der Test IST damit das,
was von der Handrechnung im Repository bleibt.

## Reihen

IPE (18) und HEA (24). HEB ist spaeter eine reine Datendatei — die Reihe kommt
als weiterer `data-source/HEB.md` dazu, `ProfileSeries` bekommt eine Variante,
sonst aendert sich nichts.
