import { describe, it, expect } from 'vitest';
import { generateCsv } from './csvExport';

describe('csvExport', () => {
  it('generates CSV string with headers', () => {
    const data = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];
    const result = generateCsv(data, ['name', 'age']);
    expect(result).toBe('name,age\nAlice,30\nBob,25');
  });

  it('handles empty data', () => {
    const result = generateCsv([], ['name', 'age']);
    expect(result).toBe('name,age');
  });

  it('escapes commas and quotes in values', () => {
    const data = [{ name: 'Smith, John', note: 'He said "hello"' }];
    const result = generateCsv(data, ['name', 'note']);
    expect(result).toBe('name,note\n"Smith, John","He said ""hello"""');
  });

  it('supports custom column labels', () => {
    const data = [{ firstName: 'Alice' }];
    const result = generateCsv(data, ['firstName'], { firstName: 'First Name' });
    expect(result).toBe('First Name\nAlice');
  });

  it('handles null and undefined values', () => {
    const data = [{ a: null, b: undefined, c: 0 }];
    const result = generateCsv(data as any, ['a', 'b', 'c']);
    expect(result).toBe('a,b,c\n,,0');
  });
});
