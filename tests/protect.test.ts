import { describe, expect, it } from 'vitest';
import { protectRedmineSyntax } from '../src/converter';

describe('protectRedmineSyntax', () => {
  it('restores every protected construct exactly', () => {
    const source = '#123 ##456 ###789 r10 commit:abc123 @mhamed [[Page|Label]] attachment:file.png {{toc}} ==raw==';
    const protectedValue = protectRedmineSyntax(source);
    expect(protectedValue.text).not.toContain('#123');
    expect(protectedValue.restore(protectedValue.text)).toBe(source);
  });
});

it('preserves nested Redmine macros', () => {
  const source = '{{collapse(Details)\nBefore {{include(Page)}} after\n}}';
  const protectedValue = protectRedmineSyntax(source);
  expect(protectedValue.restore(protectedValue.text)).toBe(source);
});
