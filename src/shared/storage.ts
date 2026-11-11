import type { ExtensionSettings } from './types';

const SETTINGS_KEY = 'markmine.settings';

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabledOrigins: [],
  formatOverrides: {},
  lineBreakMode: 'preserve',
  theme: 'system',
  rtl: 'auto',
  monospace: true,
  lineWrap: true,
  debug: false,
  branchPattern: 'feature/{id}-{slug}',
  badgeColors: {
    New: '#1f6feb',
    Open: '#1f6feb',
    Closed: '#8250df',
    Rejected: '#cf222e',
    Resolved: '#1a7f37'
  },
  features: {
    autocomplete: true,
    drafts: true,
    badges: true,
    shortcuts: true,
    darkMode: true,
    quoteReply: true,
    copyHelpers: true,
    relativeTimes: true,
    collapseComments: true,
    taskLists: true,
    hoverCards: true
  },
  templates: [
    {
      id: 'bug-report',
      name: 'Bug report',
      tracker: 'Bug',
      content: '## Summary\n\n\n## Steps to reproduce\n\n1. \n\n## Expected behavior\n\n\n## Actual behavior\n\n'
    },
    {
      id: 'feature-request',
      name: 'Feature request',
      tracker: 'Feature',
      content: '## Problem\n\n\n## Proposed change\n\n\n## Acceptance criteria\n\n- [ ] \n'
    }
  ],
  replies: [
    {
      id: 'need-more-info',
      name: 'Need more info',
      content: 'Thanks. Please add the exact reproduction steps, expected result, actual result, and any relevant screenshots or logs.'
    },
    {
      id: 'review-checklist',
      name: 'Code-review checklist',
      content: '- [ ] Behavior verified\n- [ ] Edge cases covered\n- [ ] Tests added or updated\n- [ ] No unrelated changes\n'
    }
  ]
};

function mergeSettings(value: Partial<ExtensionSettings> | undefined): ExtensionSettings {
  if (!value) return structuredClone(DEFAULT_SETTINGS);

  return {
    ...DEFAULT_SETTINGS,
    ...value,
    formatOverrides: { ...DEFAULT_SETTINGS.formatOverrides, ...value.formatOverrides },
    badgeColors: { ...DEFAULT_SETTINGS.badgeColors, ...value.badgeColors },
    features: { ...DEFAULT_SETTINGS.features, ...value.features },
    templates: value.templates ?? DEFAULT_SETTINGS.templates,
    replies: value.replies ?? DEFAULT_SETTINGS.replies
  };
}

export async function getSettings(): Promise<ExtensionSettings> {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return mergeSettings(data[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined);
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function patchSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await getSettings();
  const next = mergeSettings({ ...current, ...patch });
  await saveSettings(next);
  return next;
}

export function exportSettings(settings: ExtensionSettings): string {
  return JSON.stringify(settings, null, 2);
}

export function importSettings(raw: string): ExtensionSettings {
  const parsed = JSON.parse(raw) as Partial<ExtensionSettings>;
  return mergeSettings(parsed);
}
