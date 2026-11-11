import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { markdownToTextile, textileToMarkdown } from '../src/converter';

describe('markdownToTextile', () => {
  it('converts headings and inline formatting', () => {
    expect(markdownToTextile('# Title\n\n**bold** and *italic* and ~~gone~~').text)
      .toBe('h1. Title\n\n*bold* and _italic_ and <del>gone</del>');
  });

  it('converts links, images, code and issue references', () => {
    const result = markdownToTextile('[OpenAI](https://openai.com) ![shot](file.png) `x` #123 @mhamed').text;
    expect(result).toContain('"OpenAI":https://openai.com');
    expect(result).toContain('!file.png(shot)!');
    expect(result).toContain('@x@');
    expect(result).toContain('#123');
    expect(result).toContain('@mhamed');
  });

  it('preserves Redmine-native syntax', () => {
    const source = '{{toc}}\n\n[[Wiki Page|Wiki]]\n\nattachment:file_name.png\n\ncommit:abc123 #42';
    const result = markdownToTextile(source).text;
    expect(result).toContain('{{toc}}');
    expect(result).toContain('[[Wiki Page|Wiki]]');
    expect(result).toContain('attachment:file_name.png');
    expect(result).toContain('commit:abc123');
    expect(result).toContain('#42');
  });

  it('converts nested lists', () => {
    const result = markdownToTextile('- one\n  - two\n1. first\n   1. second').text;
    expect(result).toContain('* one');
    expect(result).toContain('** two');
    expect(result).toContain('# first');
    expect(result).toContain('## second');
  });

  it('converts fenced code blocks with language', () => {
    const result = markdownToTextile('```php\n$a = "<x>";\n```').text;
    expect(result).toBe('<pre><code class="php">$a = &quot;&lt;x&gt;&quot;;</code></pre>');
  });

  it('converts GFM tables', () => {
    const result = markdownToTextile('| A | B |\n| --- | --- |\n| 1 | 2 |').text;
    expect(result).toContain('| _. A | _. B |');
    expect(result).toContain('| 1 | 2 |');
  });

  it('reports degraded task lists', () => {
    const result = markdownToTextile('- [ ] todo\n- [x] done');
    expect(result.text).toContain('* [ ] todo');
    expect(result.warnings.some(warning => warning.code === 'task-list-degraded')).toBe(true);
  });

  it('converts supported emoji shortcodes to Unicode', () => {
    expect(markdownToTextile(':x: :rocket:').text).toBe('❌ 🚀');
  });
});

describe('textileToMarkdown', () => {
  it('converts common Textile back to Markdown', () => {
    const result = textileToMarkdown('h2. Hello\n\nThis is *bold* and _italic_.').text;
    expect(result).toContain('## Hello');
    expect(result).toContain('**bold**');
    expect(result).toContain('*italic*');
  });

  it('preserves macros and Redmine references', () => {
    const result = textileToMarkdown('{{toc}}\n\nSee #123 and [[Wiki Page]].').text;
    expect(result).toContain('{{toc}}');
    expect(result).toContain('#123');
    expect(result).toContain('[[Wiki Page]]');
  });
});

describe('supported-subset round trip', () => {
  it('keeps plain paragraphs structurally stable', () => {
    fc.assert(fc.property(
      fc.array(fc.stringMatching(/^[A-Za-z0-9 ,.":;]*$/), { minLength: 1, maxLength: 6 }),
      (lines: string[]) => {
        const markdown = lines.join('\n').trimEnd();
        fc.pre(!/:(?:smile|thumbsup|tada|warning|bug|rocket|white_check_mark|x|eyes|fire):/.test(markdown));
        const textile = markdownToTextile(markdown).text;
        const roundTrip = textileToMarkdown(textile).text;
        expect(roundTrip.replace(/\s+/g, ' ').trim()).toBe(markdown.replace(/\s+/g, ' ').trim());
      }
    ), { numRuns: 100 });
  });
});
