# Projekt als Bindungsort des Nationalen Anhangs (Schritt 2)

> **Schritt 1 ist erledigt.** „Material als Modellsatz" ist umgesetzt:
> `Material` ist ein Record in `@baustatik/material`, der Snapshot steht auf
> `schemaVersion: 3`, `resolveSectionStiffness` liest Records und kennt alle
> drei Familien. Siehe
> [ADR 0026](../docs/adr/0026-materials-belong-to-the-model.md).
>
> Was hier steht, ist der Rest: der Nationale Anhang.
>
> **Zurueckgestellt zugunsten von
> [ADR 0027](../docs/adr/0027-catalogues-are-import-sources.md)** —
> „Kataloge sind Importquellen, das Modell besitzt seine Werte"
> ([Umsetzungsplan](PLAN-katalog-als-importquelle.md)). Danach traegt jeder
> Modellsatz seine Zahlen selbst, und der Anhang wird nur noch dort gebraucht,
> wo bemessen wird — also noch nirgends. Offene Frage 1 unten ist damit
> beantwortet: dieselbe Regel, also volle `NationalAnnexParams` mit `'DE'` als
> Herkunft.

## Das offene Problem

`createMaterials({ na: 'DE' })` steht im Composition Root der App
(`apps/demo/fem-viewer.ts`, `apps/demo/fem-scripting.ts`). Der Anhang ist damit
weder Modell- noch Projektzustand: ein gespeichertes Modell traegt seinen NA
nicht mit.

Und der NA ist mehr als eine Material-Einstellung — er steuert spaeter ebenso
die Bemessung. Was fehlt, ist die Ebene darueber: das **Projekt**.

Die **Norm** (EN 1992 vs. EN 1993) gehoert bewusst *nicht* dorthin: in einem
Projekt wird sowohl Beton als auch Stahl bemessen; die Norm folgt aus dem, was
bemessen wird, nicht aus dem Projekt.

Schritt 1 hat dabei eine Beobachtung geliefert, die den Druck herausnimmt:
**der Anhang bewegt die FEM-Rechnung nicht.** `Es`, `Ecm` und `E0,mean` sind
charakteristische Werte; `EA`/`EI`/`GAs` sind unter DE und EN identisch, und ein
Test haelt das fest. Der NA fehlt also erst dort, wo bemessen wird — und das
gibt es noch nicht.

## Entwurf

### `@baustatik/project`

Nach dem Muster von [ADR 0011](../docs/adr/0011-analysis-settings-split-into-versioned-policy-and-ports.md)
(Daten vs. Faehigkeit):

```ts
// DATEN — serialisierbar, versioniert
export type ProjectSettings = {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly na: NationalAnnexId;   // 'DE' | 'EN'
};

// FAEHIGKEIT — Code, nicht persistiert
export type Project = {
  readonly settings: ProjectSettings;
  readonly materials: MaterialCatalog;   // NA-gebundener Katalog
};

export function createProject(overrides?: ProjectSettingsOverrides): Project;
export function parseProjectSettings(input: unknown): ProjectSettings;
```

Die gewuenschte Ergonomie, eine Zeile Destrukturierung:

```ts
const project = createProject({ name: 'Demo', na: 'DE' });
const { concrete, steel, timber } = project.materials;
concrete('C30/37').fcd   // 17.0 — DE-NA, ohne globalen Zustand
```

[ADR 0002](../docs/adr/0002-national-annex-via-factory-not-singleton.md) bleibt
unangetastet: weiterhin Factory-Bindung, kein globaler Setter. Das Projekt ist
nur der Ort, an dem die Bindung *einmal* geschieht und persistiert wird.

### Das Projektdokument

```ts
export type ProjectDocument = {
  readonly schemaVersion: 1;
  readonly settings: ProjectSettings;
  readonly analysis: AnalysisPolicy;              // Eigentuemer: fem-solver
  readonly models: readonly FEMModelSnapshot[];   // Eigentuemer: script
};
```

Drei Geschwister statt Verschachtelung, weil jede Scheibe ihren Eigentuemer
behaelt (ADR 0011). `parseProjectDocument` prueft die eigenen Felder und
delegiert an `parseAnalysisPolicy` und `parseFEMModelSnapshot`; jeder Record
traegt seine eigene `schemaVersion`.

## Offene Fragen — vor der Umsetzung zu entscheiden

1. **Wird `na` als ID oder als vollstaendige `NationalAnnexParams`
   persistiert?** Der Reiz der ID ist, dass `'DE'` ein Normdokument benennt, das
   ausserhalb des Programms versioniert ist. Dagegen steht ADR 0011 mit
   *„the persisted form is complete, not a diff"* und seiner Begruendung: ein
   Projekt ueberlebt eine Programmversion, und Reproduzierbarkeit schlaegt
   Kuerze. Aendern sich die DE-Beiwerte zwischen zwei Releases, rechnet ein
   gespeichertes Projekt still anders — genau der Ausfall, den ADR 0011
   verbietet. `NationalAnnexParams` ist bereits vollstaendig JSON-faehig.
2. **Sollte `ProjectDocument` warten, bis es einen Leser hat?** Heute speichert
   und laedt nichts im Repo einen Snapshot. Ein Dokumentformat ohne Schreiber
   friert Entscheidungen ein, die niemand geprueft hat.
3. **Warum haengt `Project` an `materials`, aber nicht an `analysis`?** Beides
   sind Faehigkeiten, die aus persistierten Daten entstehen. Entweder gehoeren
   beide hinein oder keins.
4. **Abhaengigkeitsrichtung.** `project` braucht fuer `ProjectDocument`
   `fem-solver` **und** `script`. Ein Package, das nur `ProjectSettings` traegt,
   braucht nur `material`. Das ist ein Argument, die beiden zu trennen.

## Nicht enthalten

- **Benutzerdefinierte Nationale Anhaenge** als persistierbarer Record.
- **Bemessung.** `fyd`/`fcd` sind ueber den Katalog erreichbar; ein
  EN-1993-Paket bleibt Zukunft.
- **Zustand II beim Stahlbeton** und **Kriechen beim Holz.** Keine
  Materialfragen — siehe `fem-section-resolve/CONTEXT.md`, „Zustand I ist die
  stillschweigende Annahme". Der Betonteil ist gross genug, um ein eigener
  Schritt zu sein; siehe unten.
- **Oberflaeche** fuer Projekteinstellungen und Materialauswahl.

## Vorgemerkt: Rechenzustand und Theorie am Lastfall

Kein Teil dieses Plans, aber der groesste bekannte offene Posten — und einer,
der frueh entschieden werden sollte, weil er eine Signatur beruehrt.

Heute rechnet alles **Theorie I. Ordnung** und Stahlbeton im **Zustand I**
(ungerissen). Beides ist fest verdrahtet, nirgends benannt und hat drei Folgen:

1. **Betondurchbiegungen sind unbrauchbar** — im Gebrauchszustand ist in der
   Regel Zustand II massgebend, `EI` liegt also zu hoch.
2. **Nichtlineare Bemessung im GZT** (EN 1992-1-1 §5.7) ist ausgeschlossen.
3. **Die Superposition faellt**, sobald einer der beiden Zustaende mitgerechnet
   wird. Rissbildung ist lastabhaengig, Theorie II. Ordnung
   verformungsabhaengig — in beiden Faellen darf man Lastfaelle nicht mehr
   getrennt rechnen und summieren, sondern muss die Kombination selbst rechnen.

Die beiden Schalter — `Theorie I. | II. Ordnung` und `Zustand I | II` — sind vom
selben Typ, brechen dieselbe Annahme und gehoeren an dasselbe: an das, was
gerechnet wird, also an den **Lastfall bzw. die Kombination**. Nicht an eine
globale `AnalysisPolicy`, denn im selben Projekt wird der GZT anders gerechnet
als der Verformungsnachweis im GZG.

Was daran haengt, ist der Port `getSectionStiffness(beam)` aus ADR 0009: er
bekommt keinen Lastfall, weil die Steifigkeit heute eine Eigenschaft des Stabes
ist. Mit Zustand II ist sie eine Eigenschaft des Paares (Stab, Lastniveau), und
die Signatur aendert sich mit.

Ausfuehrlich in `fem-section-resolve/CONTEXT.md`, vermerkt in
`fem-loads/CONTEXT.md` und `fem-solver/CONTEXT.md`, begruendet in
[ADR 0026](../docs/adr/0026-materials-belong-to-the-model.md).
