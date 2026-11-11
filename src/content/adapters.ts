export interface RedmineAdapter {
  findEditableTextareas(root?: ParentNode): HTMLTextAreaElement[];
  findPreviewTrigger(textarea: HTMLTextAreaElement): HTMLElement | null;
  findAttachmentInput(textarea: HTMLTextAreaElement): HTMLInputElement | null;
  findSubmitButton(textarea: HTMLTextAreaElement): HTMLElement | null;
  projectIdentifier(): string | null;
  issueId(): string | null;
}

const KNOWN_TEXTAREA_IDS = new Set([
  'issue_description',
  'issue_notes',
  'content_text',
  'news_description',
  'message_content',
  'project_description'
]);

function isCandidate(textarea: HTMLTextAreaElement): boolean {
  if (textarea.dataset.markmineIgnore === 'true') return false;
  if (KNOWN_TEXTAREA_IDS.has(textarea.id)) return true;
  if (/^journal-\d+-notes$/.test(textarea.id)) return true;
  if (textarea.closest('.jstEditor')) return true;
  return false;
}

function findNearbyToolbar(textarea: HTMLTextAreaElement): HTMLElement | null {
  return textarea.closest('.jstEditor') ?? textarea.parentElement;
}

export const defaultAdapter: RedmineAdapter = {
  findEditableTextareas(root: ParentNode = document) {
    return Array.from(root.querySelectorAll<HTMLTextAreaElement>('textarea')).filter(isCandidate);
  },

  findPreviewTrigger(textarea) {
    const toolbar = findNearbyToolbar(textarea);
    const local = toolbar?.querySelector<HTMLElement>('.jstTabs a, a.tab-preview, [data-tab="preview"]');
    if (local && /preview/i.test(local.textContent ?? local.getAttribute('href') ?? '')) return local;

    const form = textarea.closest('form');
    return Array.from(form?.querySelectorAll<HTMLElement>('a,button') ?? [])
      .find(element => /preview/i.test(element.textContent ?? '')) ?? null;
  },

  findAttachmentInput(textarea) {
    const form = textarea.closest('form');
    return form?.querySelector<HTMLInputElement>(
      '.attachments_form input[type="file"], #attachments_fields input[type="file"], input[type="file"][multiple]'
    ) ?? null;
  },

  findSubmitButton(textarea) {
    const form = textarea.closest('form');
    return form?.querySelector<HTMLElement>('button[type="submit"], input[type="submit"]') ?? null;
  },

  projectIdentifier() {
    const match = location.pathname.match(/\/projects\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  },

  issueId() {
    const match = location.pathname.match(/\/issues\/(\d+)/);
    return match?.[1] ?? null;
  }
};
