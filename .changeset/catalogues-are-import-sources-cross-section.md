---
'@baustatik/cross-section': minor
---

Die Profil-Variante traegt die Tabellenzeile.

- **`{ kind: 'profile'; id; profile; data: SteelProfileData }`** — `data` ist neu
  und pflicht, `profile` ist nur noch die HERKUNFT
  ([ADR 0027](../docs/adr/0027-catalogues-are-import-sources.md)).
- **Dieses Package schlaegt nichts mehr nach.** `sectionProperties` und
  `stressPoints` lesen `cs.data`; der Profilzweig ist damit TOTAL. `undefined`
  heisst nur noch „unsinnige Abmessungen" bzw. „fuer diese Form gibt es keine
  Vorlage" — der Fall „unbekanntes Profil" ist hier verschwunden und wird beim
  ANLEGEN gemeldet, wo der Tippfehler steht (`@baustatik/script`).
- **DIE GANZE ZEILE, nicht die fuenf Zahlen der Steifigkeit.** Zwei Verbraucher
  lesen heute schon disjunkte Teilmengen — `profileProperties` liest
  `A`/`Ay`/`Az`/`Iy`/`Iz`, die Spannungspunkte lesen `h`/`b`/`tw`/`tf`/`r` — und
  die Bemessung liest spaeter `Wply` und `It`. Jede Teilmenge waere eine weitere
  Meinung darueber, was ein Profil ist.
- **`ShapeSpec` bleibt unveraendert und wird NICHT kopiert.** Dort sind `b`/`h`
  die Eingabe, `A`/`Iy` eine reine Funktion davon, und die Funktion liegt in
  git. Kopieren hiesse zwei Wahrheiten ueber eine Zahl.
- Die Abhaengigkeit auf `@baustatik/steel-profiles` ist im `src` nur noch ein
  Typimport.
