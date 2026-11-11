import textile from 'textile-js';
import TurndownService from 'turndown';
import type { ConversionResult, ConversionWarning, LineBreakMode } from '../shared/types';
import { protectRedmineSyntax } from './protect';

export interface TextileToMarkdownOptions {
  lineBreakMode?: LineBreakMode;
}

const SERIALIZED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&#34;': '"',
  '&#35;': '#',
  '&#37;': '%',
  '&#39;': "'",
  '&#40;': '(',
  '&#42;': '*',
  '&#43;': '+',
  '&#45;': '-',
  '&#46;': '.',
  '&#60;': '<',
  '&#62;': '>',
  '&#63;': '?',
  '&#64;': '@',
  '&#91;': '[',
  '&#95;': '_',
  '&#120;': 'x'
};

function protectSerializedEntities(input: string) {
  const values: string[] = [];
  const text = input.replace(/&amp;|&#(?:34|35|37|39|40|42|43|45|46|60|62|63|64|91|95|120);/g, match => {
    const index = values.push(SERIALIZED_ENTITIES[match] ?? match) - 1;
    return `MARKMINEENTITY${index}TOKEN`;
  });

  return {
    text,
    restore(value: string) {
      return value.replace(/MARKMINEENTITY(\d+)TOKEN/g, (_, index: string) => values[Number(index)] ?? _);
    }
  };
}

function createTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**'
  });

  service.addRule('del', {
    filter(node: Node) {
      return ['DEL', 'S', 'STRIKE'].includes(node.nodeName);
    },
    replacement(content: string) {
      return `~~${content}~~`;
    }
  });

  service.addRule('redmineCodeBlock', {
    filter(node: Node) {
      return node.nodeName === 'PRE';
    },
    replacement(_content: string, node: Node) {
      const element = node as HTMLElement;
      const code = element.querySelector('code');
      const language = Array.from(code?.classList ?? [])
        .find(value => value !== 'code' && value !== 'syntaxhl')
        ?.replace(/^language-/, '') ?? '';
      const text = code?.textContent ?? element.textContent ?? '';
      return `\n\n\`\`\`${language}\n${text.replace(/\n$/, '')}\n\`\`\`\n\n`;
    }
  });

  return service;
}

export function textileToMarkdown(input: string, options: TextileToMarkdownOptions = {}): ConversionResult {
  const serializedEntities = protectSerializedEntities(input);
  const protectedText = protectRedmineSyntax(serializedEntities.text);
  const warnings: ConversionWarning[] = [];
  let html: string;

  try {
    html = textile(protectedText.text, { breaks: options.lineBreakMode !== 'markdown' });
  } catch (error) {
    return {
      text: input,
      warnings: [{
        code: 'textile-parse-failed',
        message: `Textile parsing failed; the original content was preserved. ${String(error)}`
      }]
    };
  }

  const markdown = createTurndown().turndown(html).trimEnd();
  const restored = serializedEntities.restore(protectedText.restore(markdown));

  if (/<(?:notextile|pre)\b/i.test(input)) {
    warnings.push({
      code: 'opaque-textile',
      message: 'Protected Textile/HTML blocks were preserved verbatim.'
    });
  }

  return { text: restored, warnings };
}
