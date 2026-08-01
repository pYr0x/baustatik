---
'@baustatik/cross-section': minor
'@baustatik/script': minor
---

**Breaking im 0.x.** `CrossSection` heisst das Katalogprofil jetzt `profile`
statt `profileId`: `{ kind: 'profile'; id: string; profile: string }`.

Der Name trug ein `Id`, das keines war. `crossSectionId`, `materialId` und
`startNodeId` zeigen auf einen Satz IM MODELL; `profile` nennt eine Reihe im
Walzprofil-Katalog, den das Modell nicht besitzt und dessen Namen es nicht
vergibt. Ein Feld, das wie ein Verweis aussieht, aber keiner ist, laesst genau
die Frage offen, die `Beam.crossSectionId` beantwortet — worauf zeigt das hier.

Die Snapshot-Grenze zieht mit: `parseFEMModelSnapshot` verlangt bei
`kind: 'profile'` den Schluessel `profile`. **Kein `schemaVersion: 3`** —
Version 2 ist mit demselben Stapel Changesets unterwegs und war nie
veroeffentlicht, es gibt also keinen v2-Snapshot, der zu wandern haette.
