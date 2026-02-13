import { describe, it, expect } from 'vitest';
import { helloCore } from './index';

describe('core', () => {
    it('should say hello', () => {
        expect(helloCore()).toBe('Hello from Core');
    });
});
