---
'@baustatik/script': major
---

**Breaking: `schemaVersion` 6 → 7.** Jede v6-Datei wird abgelehnt.

`sectionPolicy` steht als **Pflichtfeld** auf Projektebene im Snapshot, neben
`crossSections` und `materials` (ADR 0033). Vollständig und nicht als
Abweichungsliste: hier stehen die **effektiven** Werte, sonst rechnete dasselbe
Projekt nach einer Änderung der Software-Defaults still anders.

`createFEMModelBuilder({ sectionPolicy })` nimmt eine **vollständige** Policy
entgegen, keine Overrides — dieselbe Regel wie `SolverConfig.analysisPolicy`.
Ohne Argument gilt `DEFAULT_SECTION_POLICY`; im Satz steht danach trotzdem der
effektive Wert. Der neue Typ `FEMModelBuilderConfig` ist exportiert.

Geprüft wird das Feld von seinem Eigentümer: der Parser ruft
`parseSectionPolicy` und lässt `InvalidSectionPolicyError` nach aussen reisen —
dieselbe Arbeitsteilung, mit der `fem-solver` `parseLoadValidationPolicy` ruft.

Ein v6 zu ergänzen wäre die verführerischste Migration von allen, weil
`DEFAULT_SECTION_POLICY` bereitliegt — und die schlimmste: sie behauptete, der
mitgeführte Umriss sei unter `0,05 mm` entstanden, und die Drift-Prüfung, um
derentwillen das Feld existiert, urteilte gegen eine erfundene Zahl.
