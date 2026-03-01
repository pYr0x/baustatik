import { BaustatikError } from '@baustatik/errors';

export class CollinearPointsError extends BaustatikError {
    constructor() {
        super('Points are collinear and cannot form an arc.');
    }
}

export class InvalidContourError extends BaustatikError {
    constructor(message: string) {
        super(`Invalid contour: ${message}`);
    }
}
