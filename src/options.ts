import { applyExtensionLocale } from './shared/i18n';
import {
  DEFAULT_SETTINGS,
  exportSettings,
  getSettings,
  importSettings,
  saveSettings
} from './shared/storage';
import type { ExtensionSettings, ServerFormat, ThemeMode } from './shared/types';

const form = document.querySelector<HTMLFormElement>('#settings-form')!;
const origins = document.querySelector<HTMLElement>('#origins')!;
const templates = document.querySelector<HTMLTextAreaElement>('#templates')!;
const replies = document.querySelector<HTMLTextAreaElement>('#replies')!;
const message = document.querySelector<HTMLElement>('#message')!;
applyExtensionLocale();

function input<T extends HTMLInputElement | HTMLSelectElement>(name: string): T {
  return form.elements.namedItem(name) as T;
}

function showMessage(value: string): void {
  message.textContent = value;
  window.setTimeout(() => {
    if (message.textContent === value) message.textContent = '';
  }, 2500);
}

function renderOrigins(settings: ExtensionSettings): void {
  origins.replaceChildren();
  if (settings.enabledOrigins.length === 0) {
    origins.textContent = 'No Redmine sites enabled yet. Enable a site from the extension popup.';
    return;
  }

  for (const origin of settings.enabledOrigins) {
    const row = document.createElement('div');
    row.className = 'origin-row';
    const label = document.createElement('span');
    label.textContent = origin;
    const select = document.createElement('select');
    select.dataset.origin = origin;
    for (const value of ['auto', 'textile', 'markdown'] satisfies ServerFormat[]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value[0].toUpperCase() + value.slice(1);
      select.append(option);
    }
    select.value = settings.formatOverrides[origin] ?? 'auto';
    row.append(label, select);
    origins.append(row);
  }
}

function render(settings: ExtensionSettings): void {
  input<HTMLSelectElement>('lineBreakMode').value = settings.lineBreakMode;
  input<HTMLSelectElement>('theme').value = settings.theme;
  input<HTMLSelectElement>('rtl').value = settings.rtl;
  input<HTMLInputElement>('monospace').checked = settings.monospace;
  input<HTMLInputElement>('lineWrap').checked = settings.lineWrap;
  input<HTMLInputElement>('debug').checked = settings.debug;
  input<HTMLInputElement>('branchPattern').value = settings.branchPattern;

  for (const [name, enabled] of Object.entries(settings.features)) {
    const element = input<HTMLInputElement>(`feature.${name}`);
    if (element) element.checked = enabled;
  }

  templates.value = JSON.stringify(settings.templates, null, 2);
  replies.value = JSON.stringify(settings.replies, null, 2);
  renderOrigins(settings);
}

function collect(current: ExtensionSettings): ExtensionSettings {
  const formatOverrides = { ...current.formatOverrides };
  for (const select of origins.querySelectorAll<HTMLSelectElement>('select[data-origin]')) {
    formatOverrides[select.dataset.origin!] = select.value as ServerFormat;
  }

  const features = { ...current.features };
  for (const name of Object.keys(features) as Array<keyof typeof features>) {
    features[name] = input<HTMLInputElement>(`feature.${name}`).checked;
  }

  return {
    ...current,
    formatOverrides,
    lineBreakMode: input<HTMLSelectElement>('lineBreakMode').value as ExtensionSettings['lineBreakMode'],
    theme: input<HTMLSelectElement>('theme').value as ThemeMode,
    rtl: input<HTMLSelectElement>('rtl').value as ExtensionSettings['rtl'],
    monospace: input<HTMLInputElement>('monospace').checked,
    lineWrap: input<HTMLInputElement>('lineWrap').checked,
    debug: input<HTMLInputElement>('debug').checked,
    branchPattern: input<HTMLInputElement>('branchPattern').value.trim() || DEFAULT_SETTINGS.branchPattern,
    features,
    templates: JSON.parse(templates.value),
    replies: JSON.parse(replies.value)
  };
}

let current = await getSettings();
render(current);

form.addEventListener('submit', event => {
  event.preventDefault();
  try {
    current = collect(current);
    void saveSettings(current).then(async () => {
      await chrome.runtime.sendMessage({ type: 'markmine:sync' });
      showMessage('Settings saved. Reload Redmine tabs to apply them.');
    });
  } catch (error) {
    showMessage(`Could not save settings: ${String(error)}`);
  }
});

document.querySelector('#reset')?.addEventListener('click', () => {
  current = structuredClone(DEFAULT_SETTINGS);
  render(current);
  showMessage('Defaults loaded. Save to apply.');
});

document.querySelector('#export')?.addEventListener('click', async () => {
  const blob = new Blob([exportSettings(collect(current))], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'markmine-settings.json';
  anchor.click();
  URL.revokeObjectURL(url);
});

const importFile = document.querySelector<HTMLInputElement>('#import-file')!;
document.querySelector('#import')?.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    current = importSettings(await file.text());
    render(current);
    showMessage('Settings imported. Save to apply.');
  } catch (error) {
    showMessage(`Invalid settings file: ${String(error)}`);
  }
});

const diagnosticsElement = document.querySelector<HTMLElement>('#diagnostics')!;
const diagnosticsData = (await chrome.storage.local.get('markmine.diagnostics'))['markmine.diagnostics'];
if (diagnosticsData) diagnosticsElement.textContent = JSON.stringify(diagnosticsData, null, 2);
document.querySelector('#copy-diagnostics')?.addEventListener('click', async () => {
  await navigator.clipboard.writeText(diagnosticsElement.textContent ?? '');
  showMessage('Diagnostics copied.');
});
