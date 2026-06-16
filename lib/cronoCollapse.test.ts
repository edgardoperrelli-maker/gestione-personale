import { describe, it, expect } from 'vitest';
import { parseCollapsed } from './cronoCollapse';

describe('parseCollapsed', () => {
  it('null → []', () => expect(parseCollapsed(null)).toEqual([]));
  it('JSON malformato → []', () => expect(parseCollapsed('{bad')).toEqual([]));
  it('oggetto non-array → []', () => expect(parseCollapsed('{"a":1}')).toEqual([]));
  it('array valido → stesso', () => expect(parseCollapsed('["a","b"]')).toEqual(['a', 'b']));
  it('array misto → solo stringhe', () => expect(parseCollapsed('["a",1,null,"b"]')).toEqual(['a', 'b']));
});
