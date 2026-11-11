import type { ServerFormat } from '../shared/types';

export interface RedmineDetection {
  isRedmine: boolean;
  format: Exclude<ServerFormat, 'auto'> | 'unknown';
  version: string | null;
}

function detectVersion(): string | null {
  const generator = document.querySelector<HTMLMetaElement>('meta[name="generator"]')?.content ?? '';
  const match = generator.match(/Redmine\s+([0-9.]+)/i);
  return match?.[1] ?? null;
}

function detectFormat(): RedmineDetection['format'] {
  const help = document.querySelector<HTMLAnchorElement>('.jstHelp[href]');
  const href = help?.getAttribute('href') ?? '';

  if (/wiki_syntax_textile/i.test(href)) return 'textile';
  if (/wiki_syntax_markdown/i.test(href)) return 'markdown';

  const body = document.body;
  if (body?.classList.contains('textile')) return 'textile';
  if (body?.classList.contains('markdown')) return 'markdown';

  return 'unknown';
}

export function detectRedmine(): RedmineDetection {
  const body = document.body;
  const hasCoreLayout = Boolean(document.querySelector('#content'));
  const hasEditor = Boolean(document.querySelector('.jstEditor, #issue_description, #issue_notes, #content_text'));
  const hasControllerClass = Array.from(body?.classList ?? []).some(name => name.startsWith('controller-'));
  const generator = document.querySelector<HTMLMetaElement>('meta[name="generator"]')?.content ?? '';
  const generatorSaysRedmine = /redmine/i.test(generator);

  return {
    isRedmine: generatorSaysRedmine || (hasCoreLayout && (hasEditor || hasControllerClass)),
    format: detectFormat(),
    version: detectVersion()
  };
}
