import { describe, expect, it } from 'vitest';
import { helloUnits } from './index';

describe('units', () => {
  it('should say hello', () => {
    expect(helloUnits()).toBe('Hello from Units');
  });
});
