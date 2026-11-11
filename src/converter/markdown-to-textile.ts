import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import type { ConversionResult, ConversionWarning, LineBreakMode } from '../shared/types';
import { protectRedmineSyntax } from './protect';

export interface MarkdownToTextileOptions {
  lineBreakMode?: LineBreakMode;
}

interface SerializeContext {
  listStack: Array<'bullet' | 'ordered'>;
  blockquoteDepth: number;
  warnings: ConversionWarning[];
  lineBreakMode: LineBreakMode;
}

const parser = new MarkdownIt({
  html: true,
  linkify: false,
  breaks: false,
  typographer: false
});

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeTextileText(value: string): string {
  const emoji: Record<string, string> = {
    ':smile:': '😄',
    ':thumbsup:': '👍',
    ':tada:': '🎉',
    ':warning:': '⚠️',
    ':bug:': '🐛',
    ':rocket:': '🚀',
    ':white_check_mark:': '✅',
    ':x:': '❌',
    ':eyes:': '👀',
    ':fire:': '🔥'
  };

  const entities: Record<string, string> = {
    '"': '&#34;',
    "'": '&#39;',
    '<': '&#60;',
    '>': '&#62;',
    '*': '&#42;',
    '_': '&#95;',
    '@': '&#64;',
    '%': '&#37;',
    '+': '&#43;',
    '?': '&#63;'
  };

  let output = value.replace(/:[A-Za-z0-9_+-]+:/g, match => emoji[match] ?? match);

  // textile-js applies typographic glyph substitutions unconditionally. Protect the
  // source sequences so Markdown -> Textile -> Markdown remains structurally stable.
  output = output.replaceAll('&', '&amp;');
  output = output
    .replace(/->/g, '-&#62;')
    .replace(/([\d.,]+['"]? ?)x( ?)(?=[\d.,]['"]?)/g, '$1&#120;$2')
    .replace(/\.\.\./g, '&#46;&#46;&#46;')
    .replace(/--/g, '-&#45;')
    .replace(/ - /g, ' &#45; ')
    .replace(/([([])(?=(?:C|R|TM|tm|1\/4|1\/2|3\/4|o|\+\/-)[\])])/g, (_, opener: string) => opener === '(' ? '&#40;' : '&#91;');

  output = output.replace(/["'<>*_@%+?]/g, character => entities[character] ?? character);
  output = output.replace(/^([#-])(?=\s)/, character => `&#${character.charCodeAt(0)};`);
  return output;
}

function encodeTextileUrl(value: string): string {
  return encodeURI(value)
    .replaceAll('(', '%28')
    .replaceAll(')', '%29')
    .replaceAll(' ', '%20');
}

function serializeInline(children: Token[], ctx: SerializeContext): string {
  let output = '';
  const stack: Array<{ type: string; href?: string }> = [];

  for (const token of children) {
    switch (token.type) {
      case 'text': {
        const top = stack.at(-1);
        if (top?.type !== 'attachment') output += escapeTextileText(token.content);
        break;
      }
      case 'strong_open':
        output += '*';
        stack.push({ type: 'strong' });
        break;
      case 'strong_close':
        output += '*';
        stack.pop();
        break;
      case 'em_open':
        output += '_';
        stack.push({ type: 'em' });
        break;
      case 'em_close':
        output += '_';
        stack.pop();
        break;
      case 's_open':
        output += '<del>';
        stack.push({ type: 's' });
        break;
      case 's_close':
        output += '</del>';
        stack.pop();
        break;
      case 'code_inline':
        output += token.content.includes('@')
          ? `<code>${escapeHtml(token.content)}</code>`
          : `@${token.content}@`;
        break;
      case 'link_open': {
        const href = token.attrGet('href') ?? '';
        if (href.startsWith('attachment:')) {
          stack.push({ type: 'attachment', href });
        } else {
          output += '"';
          stack.push({ type: 'link', href });
        }
        break;
      }
      case 'link_close': {
        const top = stack.pop();
        if (top?.type === 'attachment') output += top.href ?? '';
        else output += `":${encodeTextileUrl(top?.href ?? '')}`;
        break;
      }
      case 'image': {
        const src = token.attrGet('src') ?? '';
        const alt = token.content || token.attrGet('alt') || '';
        const isAttachment = !src.includes('/') && !src.includes(':');
        output += isAttachment
          ? `!${src}${alt ? `(${alt})` : ''}!`
          : `!${encodeTextileUrl(src)}${alt ? `(${alt})` : ''}!`;
        break;
      }
      case 'hardbreak':
        output += ctx.lineBreakMode === 'preserve' ? '\n' : '<br />\n';
        break;
      case 'softbreak':
        output += ctx.lineBreakMode === 'preserve' ? '\n' : ' ';
        break;
      case 'html_inline':
        output += token.content;
        ctx.warnings.push({
          code: 'raw-html',
          message: 'Raw HTML is passed through and may be sanitized by Redmine.'
        });
        break;
      default:
        output += token.content;
        break;
    }
  }

  return output;
}

function listPrefix(ctx: SerializeContext): string {
  return ctx.listStack.map(type => type === 'bullet' ? '*' : '#').join('');
}

function serializeTable(tokens: Token[], start: number, ctx: SerializeContext): { text: string; next: number } {
  const rows: string[][] = [];
  let row: string[] | null = null;
  let cell = '';
  let header = false;
  let i = start + 1;

  for (; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'table_close') break;
    if (token.type === 'thead_open') header = true;
    if (token.type === 'tbody_open') header = false;
    if (token.type === 'tr_open') row = [];
    if ((token.type === 'th_open' || token.type === 'td_open')) cell = '';
    if (token.type === 'inline') cell += serializeInline(token.children ?? [], ctx);
    if (token.type === 'th_close' || token.type === 'td_close') row?.push(`${header ? '_. ' : ''}${cell}`);
    if (token.type === 'tr_close' && row) rows.push(row);
  }

  return {
    text: rows.map(rowValue => `| ${rowValue.join(' | ')} |`).join('\n') + '\n\n',
    next: i
  };
}

function serializeTokens(tokens: Token[], ctx: SerializeContext): string {
  let output = '';
  let atLineStart = true;
  let inListItem = false;

  const ensureNewline = () => {
    if (!output.endsWith('\n')) output += '\n';
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    switch (token.type) {
      case 'heading_open':
        ensureNewline();
        output += `h${token.tag.slice(1)}. `;
        atLineStart = false;
        break;
      case 'heading_close':
        output += '\n\n';
        atLineStart = true;
        break;
      case 'paragraph_open':
        if (!inListItem && ctx.blockquoteDepth === 0) {
          ensureNewline();
          atLineStart = true;
        }
        if (ctx.blockquoteDepth > 0 && atLineStart) {
          output += ctx.blockquoteDepth === 1 ? 'bq. ' : '<blockquote>';
          atLineStart = false;
        }
        break;
      case 'paragraph_close':
        if (inListItem) break;
        if (ctx.blockquoteDepth > 1) output += '</blockquote>';
        output += '\n\n';
        atLineStart = true;
        break;
      case 'inline':
        output += serializeInline(token.children ?? [], ctx);
        atLineStart = false;
        if (/^\[[ xX]\]\s/.test(token.content)) {
          ctx.warnings.push({
            code: 'task-list-degraded',
            message: 'Task-list markers are stored as literal [ ] / [x] text in Textile.'
          });
        }
        break;
      case 'bullet_list_open':
        ctx.listStack.push('bullet');
        break;
      case 'bullet_list_close':
        ctx.listStack.pop();
        if (ctx.listStack.length === 0) output += '\n';
        break;
      case 'ordered_list_open':
        ctx.listStack.push('ordered');
        break;
      case 'ordered_list_close':
        ctx.listStack.pop();
        if (ctx.listStack.length === 0) output += '\n';
        break;
      case 'list_item_open':
        ensureNewline();
        output += `${listPrefix(ctx)} `;
        inListItem = true;
        atLineStart = false;
        break;
      case 'list_item_close':
        ensureNewline();
        inListItem = false;
        atLineStart = true;
        break;
      case 'blockquote_open':
        ctx.blockquoteDepth += 1;
        break;
      case 'blockquote_close':
        ctx.blockquoteDepth -= 1;
        if (!output.endsWith('\n\n')) output += '\n';
        break;
      case 'fence': {
        ensureNewline();
        const language = token.info.trim().split(/\s+/)[0];
        const className = language ? ` class="${escapeHtml(language)}"` : '';
        output += `<pre><code${className}>${escapeHtml(token.content.replace(/\n$/, ''))}</code></pre>\n\n`;
        atLineStart = true;
        break;
      }
      case 'code_block':
        ensureNewline();
        output += `<pre>${escapeHtml(token.content.replace(/\n$/, ''))}</pre>\n\n`;
        atLineStart = true;
        break;
      case 'hr':
        ensureNewline();
        output += '---\n\n';
        atLineStart = true;
        break;
      case 'html_block':
        ensureNewline();
        output += `${token.content.trimEnd()}\n\n`;
        ctx.warnings.push({
          code: 'raw-html',
          message: 'Raw HTML is passed through and may be sanitized by Redmine.'
        });
        atLineStart = true;
        break;
      case 'table_open': {
        const table = serializeTable(tokens, i, ctx);
        ensureNewline();
        output += table.text;
        i = table.next;
        atLineStart = true;
        break;
      }
    }
  }

  return output.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n').trimEnd();
}

export function markdownToTextile(markdown: string, options: MarkdownToTextileOptions = {}): ConversionResult {
  const protectedText = protectRedmineSyntax(markdown);
  const warnings: ConversionWarning[] = [];
  const tokens = parser.parse(protectedText.text, {});
  const text = serializeTokens(tokens, {
    listStack: [],
    blockquoteDepth: 0,
    warnings,
    lineBreakMode: options.lineBreakMode ?? 'preserve'
  });

  return {
    text: protectedText.restore(text),
    warnings: Array.from(new Map(warnings.map(item => [item.code, item])).values())
  };
}
