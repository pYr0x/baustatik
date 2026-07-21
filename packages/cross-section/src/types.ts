// Rohdaten aus dem Store. Ein Wandsegment eines duennwandigen Querschnitts:
// Geometrie (Linie ODER Bogen) + physikalische Wandstaerke t.
export type Segment = {
  id: string;
  thickness: number; // t — PHYSIK (Berechnung), NICHT die Strichbreite am Schirm
} & (
  | {
      geometry: 'line';
      start: { y: number; z: number };
      end: { y: number; z: number };
    }
  | {
      geometry: 'arc';
      center: { y: number; z: number };
      radius: number;
      startAngle: number;
      sweep: number;
    }
);
