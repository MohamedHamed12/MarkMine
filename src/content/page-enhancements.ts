import DOMPurify from 'dompurify';
import type { ExtensionSettings } from '../shared/types';
import type { RedmineAdapter } from './adapters';

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function applyTheme(settings: ExtensionSettings): void {
  if (!settings.features.darkMode) return;
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('markmine-dark', dark);
}

function applyDirection(settings: ExtensionSettings): void {
  if (settings.rtl === 'auto') {
    for (const element of document.querySelectorAll<HTMLElement>('.wiki p, .wiki li, .wiki blockquote, .wiki td, .wiki th')) {
      element.dir = 'auto';
    }
    return;
  }
  document.documentElement.dataset.markmineDirection = settings.rtl;
}

function enhanceBadges(settings: ExtensionSettings): void {
  if (!settings.features.badges) return;
  const selectors = ['.status', '.priority', '.tracker', '.issue .attributes .value'];
  for (const element of document.querySelectorAll<HTMLElement>(selectors.join(','))) {
    const text = element.textContent?.trim() ?? '';
    const color = settings.badgeColors[text];
    if (!color || element.dataset.markmineBadge) continue;
    element.dataset.markmineBadge = 'true';
    element.style.setProperty('--markmine-badge-color', color);
    element.classList.add('markmine-badge');
  }
}

function relativeTime(date: Date): string {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const ranges: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60]
  ];
  for (const [unit, size] of ranges) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(seconds, 'second');
}

function enhanceRelativeTimes(settings: ExtensionSettings): void {
  if (!settings.features.relativeTimes) return;
  const candidates = document.querySelectorAll<HTMLElement>('time[datetime], .journal .wiki + p.author time, .author time');
  for (const element of candidates) {
    if (element.dataset.markmineRelative) continue;
    const raw = element.getAttribute('datetime') ?? element.getAttribute('title') ?? element.textContent ?? '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) continue;
    element.dataset.markmineRelative = 'true';
    element.title = date.toLocaleString();
    element.textContent = relativeTime(date);
  }
}

function enhanceCopyHelpers(settings: ExtensionSettings, adapter: RedmineAdapter): void {
  if (!settings.features.copyHelpers) return;
  const issueId = adapter.issueId();
  if (!issueId || document.querySelector('.markmine-copy-helpers')) return;

  const heading = document.querySelector<HTMLElement>('#content > h2, #content h2');
  if (!heading) return;
  const subject = document.querySelector<HTMLElement>('.issue .subject h3, #content h2')?.textContent?.trim() ?? `issue-${issueId}`;
  const branch = settings.branchPattern
    .replaceAll('{id}', issueId)
    .replaceAll('{slug}', slugify(subject.replace(/^#?\d+\s*/, '')));

  const group = document.createElement('span');
  group.className = 'markmine-copy-helpers';
  const actions: Array<[string, string]> = [
    ['Copy #', `#${issueId}`],
    ['Copy link', location.href],
    ['Copy branch', branch],
    ['Copy commit', `refs #${issueId}`]
  ];

  for (const [label, value] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(value);
      const original = button.textContent;
      button.textContent = 'Copied';
      window.setTimeout(() => button.textContent = original, 900);
    });
    group.append(button);
  }

  heading.append(group);
}

function enhanceLongComments(settings: ExtensionSettings): void {
  if (!settings.features.collapseComments) return;
  for (const wiki of document.querySelectorAll<HTMLElement>('.journal .wiki')) {
    if (wiki.dataset.markmineCollapse || wiki.scrollHeight < 560) continue;
    wiki.dataset.markmineCollapse = 'true';
    wiki.classList.add('markmine-collapsed-comment');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'markmine-show-more';
    button.textContent = 'Show more';
    button.addEventListener('click', () => {
      const collapsed = wiki.classList.toggle('markmine-collapsed-comment');
      button.textContent = collapsed ? 'Show more' : 'Show less';
    });
    wiki.after(button);
  }
}

function enhanceTaskLists(settings: ExtensionSettings): void {
  if (!settings.features.taskLists) return;
  for (const list of document.querySelectorAll<HTMLUListElement>('.wiki ul')) {
    let total = 0;
    let checked = 0;
    for (const item of list.querySelectorAll<HTMLLIElement>(':scope > li')) {
      if (item.dataset.markmineTask) continue;
      const textNode = Array.from(item.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
      const text = textNode?.textContent ?? '';
      const match = text.match(/^\s*\[([ xX])\]\s*/);
      if (!match || !textNode) continue;
      total += 1;
      const done = match[1].toLowerCase() === 'x';
      if (done) checked += 1;
      textNode.textContent = text.replace(match[0], '');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = done;
      checkbox.disabled = true;
      checkbox.setAttribute('aria-label', done ? 'Completed task' : 'Open task');
      item.prepend(checkbox, document.createTextNode(' '));
      item.dataset.markmineTask = 'true';
    }
    if (total > 0 && !list.previousElementSibling?.classList.contains('markmine-task-progress')) {
      const progress = document.createElement('div');
      progress.className = 'markmine-task-progress';
      progress.textContent = `${checked} of ${total} tasks complete`;
      list.before(progress);
    }
  }
}

function bindHoverCards(settings: ExtensionSettings): void {
  if (!settings.features.hoverCards) return;
  const cache = new Map<string, { expires: number; title: string }>();

  document.addEventListener('mouseover', event => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a.issue, a[href*="/issues/"]');
    if (!link || link.dataset.markmineHoverBound) return;
    const issueId = link.href.match(/\/issues\/(\d+)/)?.[1];
    if (!issueId) return;
    link.dataset.markmineHoverBound = 'true';

    void (async () => {
      const cached = cache.get(issueId);
      if (cached && cached.expires > Date.now()) {
        link.title = cached.title;
        return;
      }
      try {
        const response = await fetch(`/issues/${issueId}.json`, { headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        const data = await response.json() as {
          issue?: { subject?: string; status?: { name?: string }; assigned_to?: { name?: string } };
        };
        const issue = data.issue;
        if (!issue) return;
        const title = DOMPurify.sanitize(
          `${issue.subject ?? ''}\nStatus: ${issue.status?.name ?? '-'}\nAssignee: ${issue.assigned_to?.name ?? '-'}`,
          { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }
        );
        cache.set(issueId, { expires: Date.now() + 300_000, title });
        link.title = title;
      } catch {
        // REST API may be disabled. Native link behavior remains unchanged.
      }
    })();
  }, { passive: true });
}

export function installPageEnhancements(
  settings: ExtensionSettings,
  adapter: RedmineAdapter,
  insertIntoNotes: (value: string) => boolean
): void {
  applyTheme(settings);
  applyDirection(settings);
  enhanceBadges(settings);
  enhanceRelativeTimes(settings);
  enhanceCopyHelpers(settings, adapter);
  enhanceLongComments(settings);
  enhanceTaskLists(settings);
  bindHoverCards(settings);

  if (settings.features.quoteReply) {
    document.addEventListener('keydown', event => {
      if (event.key.toLowerCase() !== 'r' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input,textarea,[contenteditable="true"],.cm-editor')) return;
      const selection = getSelection()?.toString().trim();
      if (!selection) return;
      const quote = selection.split('\n').map(line => `> ${line}`).join('\n') + '\n\n';
      if (insertIntoNotes(quote)) event.preventDefault();
    });
  }

  if (settings.features.shortcuts) {
    let pendingG = false;
    let gTimer = 0;
    document.addEventListener('keydown', event => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input,textarea,select,[contenteditable="true"],.cm-editor')) return;
      const key = event.key.toLowerCase();

      if (pendingG && key === 'i') {
        event.preventDefault();
        pendingG = false;
        const issues = document.querySelector<HTMLAnchorElement>('#main-menu a.issues, a[href$="/issues"]');
        issues?.click();
        return;
      }

      if (key === 'g') {
        pendingG = true;
        window.clearTimeout(gTimer);
        gTimer = window.setTimeout(() => pendingG = false, 900);
        return;
      }

      if (event.key === '/' && document.querySelector<HTMLInputElement>('#q')) {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('#q')?.focus();
      } else if (key === 'e') {
        const edit = Array.from(document.querySelectorAll<HTMLAnchorElement>('a')).find(link => /^edit$/i.test(link.textContent?.trim() ?? ''));
        edit?.click();
      } else if (key === 'c') {
        const create = document.querySelector<HTMLAnchorElement>('a.new-issue, a[href$="/issues/new"]');
        create?.click();
      } else if (event.key === '?') {
        alert('MarkMine shortcuts\n\nc: create issue\ne: edit\n/: focus search\ng then i: issues\nr: quote selected text\nCtrl/Cmd+Enter: submit editor');
      }
    });
  }

  const observer = new MutationObserver(() => {
    enhanceBadges(settings);
    enhanceRelativeTimes(settings);
    enhanceLongComments(settings);
    enhanceTaskLists(settings);
    applyDirection(settings);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
