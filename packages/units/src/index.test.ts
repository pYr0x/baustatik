import { describe, expect, it } from 'vitest';
import { convert } from './index';

describe('@baustatik/units - Public API', () => {
  it('should export convert function', () => {
    expect(convert).toBeDefined();
    expect(typeof convert).toBe('function');
  });

  it('should convert units via public API', () => {
    // Test that the exported function works correctly
    expect(convert(1).from('m').to('cm')).toBe(100);
    expect(convert(1).from('dm').to('cm')).toBe(10);
  });
});
