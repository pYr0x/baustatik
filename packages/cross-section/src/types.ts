import type { mm } from '@baustatik/units';
import type { Idealisation } from './section';

/**
 * Der gespeicherte Querschnitt des EDITORS — die dritte Quelle neben der
 * parametrischen Form und der Katalogzeile
 * ([ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)).
 *
 * ZWEI VARIANTEN, ZWEI EINGABEARTEN, und die Trennung ist die eigentliche
 * Aussage:
 *
 *   `midline` — ein Mittellinienmodell: Knoten, Waende mit Dicke. Der Umriss
 *               entsteht daraus durch Aufweitung um `t/2`.
 *   `outline` — Ringe, die den Umriss unmittelbar beschreiben. Fuer den
 *               Vollquerschnitt, dem keine Wandstaerke zuzuordnen ist.
 *
 * BEIDE MARKEN BENENNEN EINE LINIE, nicht ihren Inhalt: die Mittellinie gegen
 * den Umriss. `midline` ist der Begriff der englischsprachigen Fachwelt fuer
 * die `Mittellinie` — SCIA definiert den duennwandigen Querschnitt als „defined
 * by its centreline (or midline) and the width", SHAPE-THIN setzt seine
 * Punkte auf die `center lines`. `midline` statt `centreline`, weil letzteres
 * den Streit centre/center in jeden Import traegt.
 *
 * `idealisation` sitzt IN der `midline`-Variante und nicht darueber. Die
 * verbotene Zelle „freier Umriss, aber duennwandig gerechnet" ist damit ein
 * COMPILERFEHLER und keine Laufzeitpruefung — ein Umriss ohne Waende hat keine
 * Mittellinien, laengs derer ein Schubfluss laufen koennte.
 *
 * DER ABGELEITETE UMRISS REIST MIT. Er ist eine Denormalisierung, aber keine
 * ungepruefte: das Gate leitet ihn ohnehin ab, der Vergleich kostet nichts,
 * und aus stiller Drift wird ein Befund. Der Grund ist derselbe wie bei der
 * kopierten Profilzeile ([ADR 0027](../../../docs/adr/0027-catalogues-are-import-sources.md)):
 * ein Bericht druckt `A = 5163,21 mm²`, eine neue Bibliotheksversion liefert
 * `5163,19` — still. Ihn als `Ring[]` mit `bulge` mitzufuehren sicherte nur die
 * TOPOLOGIE, nicht die Punktzahl, aus der `A`, `Iy` und `Iz` fallen: voller
 * Preis, halber Schutz.
 *
 * Reine Daten, JSON-serialisierbar — Voraussetzung dafuer, dass der Querschnitt
 * im Snapshot mitreisen kann (`schemaVersion: 7`, wo seit ADR 0033 auch die
 * `SectionPolicy` steht, unter der `outline` erzeugt wurde).
 */
export type SectionGeometry =
  | {
      kind: 'midline';
      nodes: SectionNode[];
      walls: Wall[];
      idealisation: Idealisation;
      /** ABGELEITET aus `nodes`/`walls`, nicht unabhaengig gepflegt. */
      outline: Polygon[];
    }
  | {
      kind: 'outline';
      rings: Ring[];
      /** ABGELEITET aus `rings`, nicht unabhaengig gepflegt. */
      outline: Polygon[];
    };

/**
 * Ein Knoten des Wandgraphen. ABMESSUNGEN IN MILLIMETERN, wie `ShapeSpec`.
 *
 * STRING-ID, KEIN INDEX. Ein geloeschter Knoten verschoebe sonst jeden
 * folgenden, und ein Modell-Diff waere unlesbar. Die Entscheidung traegt nicht
 * die Zellenerkennung (die darf nie kommen), sondern der Wandweg fuer offene
 * Profile: er braucht eine Durchlaufordnung, und die waere im flachen Modell
 * dieselbe Epsilon-Suche, nur frueher faellig.
 */
export type SectionNode = { id: string; y: mm; z: mm };

/**
 * Eine Wand zwischen zwei Knoten — die MITTELLINIE plus ihre Dicke.
 *
 * `startNodeId`/`endNodeId` HEISSEN WIE BEIM STAB (`Beam` in
 * `@baustatik/fem`). Dieselbe Systematik — ein Objekt verbindet zwei Knoten
 * ueber Ids — traegt denselben Namen, und das `...Id`-Suffix sagt, dass dort
 * eine Referenz steht und keine Lage. Ein blosses `from` sagte weder das eine
 * noch das andere.
 *
 * `Wall` und nicht `Element` oder `Segment`: `Element` ist im Monorepo mit dem
 * Stabelement (`@baustatik/fem-element`) belegt, `Segment` bleibt fuer das
 * POSITIONIERTE Wegstueck reserviert, aus dem kappa und die Spannungspunkte
 * einmal gemeinsam fallen sollen (`packages/TODO.md`; das lagelose Gegenstueck
 * heisst `ShearFlowInterval`), und `Branch` meint in der Theorie duennwandiger
 * Profile einen ZUG zwischen Verzweigungsknoten — das Wort wird fuer den
 * Wandweg offener Profile noch gebraucht. Bleibt das Vokabular der Norm:
 * duennwandig, Wandstaerke, Wand.
 *
 * `t` ist PHYSIK (die Wandstaerke, mit der gerechnet wird), nicht die
 * Strichbreite am Schirm.
 *
 * `bulge` ist die DXF-Woelbung: `tan(Δ/4)` mit dem Oeffnungswinkel `Δ` des
 * Bogens. `0` oder weggelassen heisst Gerade. Sie ist DIMENSIONSLOS und
 * deshalb ungebrandet. Ihr Vorzeichen folgt `Arc.sweep`
 * (`@baustatik/section-geometry`): positiv dreht von `+y` nach `+z`
 * ([ADR 0031](../../../docs/adr/0031-the-cross-section-plane.md)). Die
 * Endtangente weicht damit um `Δ/2 = 2·atan(bulge)` von der Sehne ab — das ist
 * alles, was die Knickwarnung des Gates braucht, und der Grund, warum sie
 * ohne `Arc`-Objekt auskommt.
 */
export type Wall = {
  id: string;
  startNodeId: string;
  endNodeId: string;
  t: mm;
  bulge?: number;
};

/**
 * Ein Umrisspunkt der EINGABE — mit `bulge`, also mit gekruemmten Kanten.
 *
 * Eingabe und Ergebnis sind am Typ unterscheidbar: `Vertex` traegt `bulge`,
 * `Polygon` nicht. Wer ein Ergebnis dort einsetzt, wo eine Eingabe hingehoert,
 * merkt es beim Typecheck.
 */
export type Vertex = { y: mm; z: mm; bulge?: number };

/**
 * Ein geschlossener Ring der EINGABE. Der aeussere laeuft CCW, ein Loch CW.
 *
 * Der Umlaufsinn traegt die Bedeutung „Material" gegen „Loch"; er wird nicht
 * geraten, sondern hingeschrieben.
 *
 * `Ring` IST DER NORMBEGRIFF: OGC Simple Features und
 * [RFC 7946](https://datatracker.ietf.org/doc/html/rfc7946) nennen den
 * geschlossenen Linienzug „linear ring", fuehren den aeusseren zuerst und
 * legen genau diesen Umlaufsinn fest — aussen CCW, Loecher CW. Der Satz oben
 * ist keine Hauskonvention, sondern die uebernommene.
 */
export type Ring = { vertices: Vertex[] };

/**
 * Ein diskretisiertes Umrisspolygon — das ERGEBNIS, ohne `bulge`.
 *
 * Die Punktzahl haengt an der Diskretisierungstoleranz
 * (`SectionPolicy.arcTolerance`, voreingestellt `DEFAULT_ARC_TOLERANCE` aus
 * `@baustatik/section-geometry`), und genau deshalb reist das Polygon mit: `A`,
 * `Iy` und `Iz` fallen aus DIESEN Punkten und nicht aus denen, die die naechste
 * Bibliotheksversion erzeugen wuerde. Seit ADR 0033 reist die Toleranz SELBST
 * im Satz daneben — damit ist erstmals pruefbar, ob beide zusammenpassen.
 *
 * ACHTUNG, ABWEICHUNG VON OGC: dort ist ein *Polygon* die MENGE seiner Ringe,
 * hier ist es ein EINZELNER — dieselbe Bedeutung wie `Polygon` in
 * `@baustatik/geometry-2d` und `@baustatik/section-geometry`, und die
 * Hauskonvention schlaegt die fremde. `outline: Polygon[]` heisst deshalb „ein
 * Eintrag je Ring", Loecher eingeschlossen, und nicht „mehrere Polygone mit
 * Loechern". `Ring` und `Polygon` stehen damit auf DERSELBEN Ebene und
 * unterscheiden sich allein durch `bulge`: Eingabe gegen Ergebnis.
 */
export type Polygon = { points: { y: mm; z: mm }[] };
