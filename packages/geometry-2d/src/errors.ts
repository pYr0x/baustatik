import { BaustatikError } from '@baustatik/errors'

export class CollinearPointsError extends BaustatikError {
  constructor() {
    super('Arc.fromPoints: die drei Punkte sind kollinear - kein eindeutiger Kreis moeglich')
  }
}

export class DegenerateVectorError extends BaustatikError {
  constructor() {
    super('Vector.normalize: Nullvektor kann nicht normalisiert werden')
  }
}

export class OpenPolylineError extends BaustatikError {
  constructor() {
    super('Polyline.toPolygon: Polyline ist nicht geschlossen')
  }
}

export class InvalidPolygonError extends BaustatikError {
  constructor(reason: string) {
    super(`Polygon ungueltig: ${reason}`)
  }
}

export class InvalidArcError extends BaustatikError {
  constructor(reason: string) {
    super(`Arc ungueltig: ${reason}`)
  }
}

export class DegenerateAxisError extends BaustatikError {
  constructor() {
    super('mirror: axisP1 und axisP2 sind identisch - Spiegelachse ist degeneriert')
  }
}

export class InvalidPolylineError extends BaustatikError {
  constructor(reason: string) {
    super(`Polyline ungueltig: ${reason}`)
  }
}

export class DiscontinuousLinesError extends BaustatikError {
  constructor(index: number) {
    super(`Linien sind nicht verbunden: Linie ${index} endet nicht am Startpunkt von Linie ${index + 1}`)
  }
}
