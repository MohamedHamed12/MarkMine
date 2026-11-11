import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import type { RedmineAdapter } from './adapters';

const emoji: Completion[] = [
  ['smile', '😄'], ['thumbsup', '👍'], ['tada', '🎉'], ['warning', '⚠️'], ['bug', '🐛'],
  ['rocket', '🚀'], ['white_check_mark', '✅'], ['x', '❌'], ['eyes', '👀'], ['fire', '🔥']
].map(([name, value]) => ({ label: `:${name}:`, apply: value, type: 'text' }));

function pageWikiCompletions(): Completion[] {
  const seen = new Set<string>();
  const values: Completion[] = [];

  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href*="/wiki/"]')) {
    const text = link.textContent?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    values.push({ label: `[[${text}]]`, apply: `[[${text}]]`, type: 'text' });
  }

  return values.slice(0, 50);
}

function memberCompletions(): Completion[] {
  const options = document.querySelectorAll<HTMLOptionElement>('#issue_assigned_to_id option');
  const values: Completion[] = [];

  for (const option of options) {
    const login = option.dataset.login;
    if (!login) continue;
    values.push({ label: `@${login}`, apply: `@${login}`, detail: option.textContent?.trim(), type: 'text' });
  }

  return values;
}

async function issueCompletions(query: string, adapter: RedmineAdapter): Promise<Completion[]> {
  const project = adapter.projectIdentifier();
  const params = new URLSearchParams({ limit: '10', status_id: '*', subject: query });
  if (project) params.set('project_id', project);

  try {
    const response = await fetch(`/issues.json?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    });
    if (!response.ok) return [];
    const data = await response.json() as { issues?: Array<{ id: number; subject: string }> };
    return (data.issues ?? []).map(issue => ({
      label: `#${issue.id}`,
      apply: `#${issue.id}`,
      detail: issue.subject,
      type: 'text'
    }));
  } catch {
    return [];
  }
}

function slashCommands(): Completion[] {
  return [
    { label: '/table', apply: '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |', detail: 'Insert table' },
    { label: '/code', apply: '```\n\n```', detail: 'Insert code block' },
    { label: '/task', apply: '- [ ] ', detail: 'Insert task' },
    { label: '/collapse', apply: '{{collapse(Details)\n\n}}', detail: 'Insert Redmine collapse macro' },
    { label: '/toc', apply: '{{toc}}', detail: 'Insert Redmine table of contents' }
  ];
}

export function createCompletionSource(adapter: RedmineAdapter): CompletionSource {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const before = context.state.sliceDoc(Math.max(0, context.pos - 80), context.pos);

    const issueMatch = before.match(/#([A-Za-z0-9 _-]*)$/);
    if (issueMatch) {
      const options = await issueCompletions(issueMatch[1], adapter);
      return { from: context.pos - issueMatch[0].length, options, validFor: /^#[^\n]*$/ };
    }

    const mentionMatch = before.match(/@[A-Za-z0-9_.-]*$/);
    if (mentionMatch) {
      return {
        from: context.pos - mentionMatch[0].length,
        options: memberCompletions(),
        validFor: /^@[A-Za-z0-9_.-]*$/
      };
    }

    const wikiMatch = before.match(/\[\[[^\]\n]*$/);
    if (wikiMatch) {
      return {
        from: context.pos - wikiMatch[0].length,
        options: pageWikiCompletions(),
        validFor: /^\[\[[^\]\n]*$/
      };
    }

    const emojiMatch = before.match(/:[A-Za-z0-9_+-]*$/);
    if (emojiMatch) {
      return {
        from: context.pos - emojiMatch[0].length,
        options: emoji,
        validFor: /^:[A-Za-z0-9_+-]*$/
      };
    }

    const slashMatch = before.match(/(?:^|\n)(\/[A-Za-z]*)$/);
    if (slashMatch) {
      const value = slashMatch[1];
      return {
        from: context.pos - value.length,
        options: slashCommands(),
        validFor: /^\/[A-Za-z]*$/
      };
    }

    return null;
  };
}
