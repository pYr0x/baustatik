# Ersatzknotenlasten und Balken-FEM – Ressourcen

## Knowledge

- [TU Delft: Euler–Bernoulli beam elements](https://interactivetextbooks.citg.tudelft.nl/computational-modelling/structural_linear/euler_bernouilli.html)
  Leitet Hermite-Ansatzfunktionen, schwache Form und den rechten Lastvektor her. Verwenden für die Begründung von `f_e = ∫ Nᵀ q dx`.
- [TU Delft: 2D frame analysis](https://interactivetextbooks.citg.tudelft.nl/computational-modelling/structural_linear/space_frame.html)
  Beschreibt sechs lokale Freiheitsgrade und die Transformation beliebig orientierter Rahmenstäbe. Verwenden für lokale/globale Koordinaten und Assemblierung.
- [TU Delft: Timoshenko beam and shear-locking remedies](https://interactivetextbooks.citg.tudelft.nl/computational-modelling/structural_linear/Tutorials/Gridap_timoshenko.html)
  Behandelt unabhängige Felder für Durchbiegung und Rotation, die schwache Form sowie reduzierte Integration, gemischte Interpolationsordnungen und Stabilisierung gegen Schub-Locking.
- [MOOSE: C0 Timoshenko beam element](https://mooseframework.inl.gov/moose/modules/solid_mechanics/C0TimoshenkoBeam.html)
  Dokumentiert eine konkrete Timoshenko-Implementierung mit unabhängigen translatorischen und rotatorischen Freiheitsgraden und linearen Lagrange-Ansatzfunktionen.
- [Georgia Tech: Interval Finite Element Approach, Abschnitt 2.1.1](https://repository.gatech.edu/server/api/core/bitstreams/fab7870b-5a9a-4c0a-9a06-fd038e9d0675/content)
  Gibt die allgemeine Summe bzw. Integration konzentrierter und verteilter Lasten mit der Ansatzfunktionsmatrix sowie ein Euler–Bernoulli-Beispiel an. Verwenden für Punkt- und Bereichslasten.

## Gaps

- Eine Referenzquelle für Endfreigaben und die statische Kondensation des Elementlastvektors wird ergänzt, sobald Releases implementiert werden.
