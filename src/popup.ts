import { applyExtensionLocale, t } from './shared/i18n';
import { getSettings } from './shared/storage';

const site = document.querySelector<HTMLElement>('#site')!;
const status = document.querySelector<HTMLElement>('#status')!;
const toggle = document.querySelector<HTMLButtonElement>('#toggle')!;
const options = document.querySelector<HTMLButtonElement>('#options')!;
applyExtensionLocale();

function pattern(origin: string): string {
  return `${origin.replace(/\/$/, '')}/*`;
}

async function activeOrigin(): Promise<{ origin: string; tabId: number } | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || tab.id === undefined) return null;
  try {
    const url = new URL(tab.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return { origin: url.origin, tabId: tab.id };
  } catch {
    return null;
  }
}

async function refresh(): Promise<void> {
  const current = await activeOrigin();
  if (!current) {
    site.textContent = t('openRedmine', 'Open a Redmine page to enable MarkMine.');
    status.textContent = '';
    toggle.disabled = true;
    return;
  }

  const settings = await getSettings();
  const enabled = settings.enabledOrigins.includes(current.origin)
    && await chrome.permissions.contains({ origins: [pattern(current.origin)] });

  site.textContent = current.origin;
  status.textContent = enabled ? t('enabledForSite', 'Enabled for this site') : t('disabledForSite', 'Disabled for this site');
  toggle.textContent = enabled ? t('disableSite', 'Disable MarkMine') : t('enableSite', 'Enable on this Redmine');
  toggle.dataset.enabled = String(enabled);
  toggle.disabled = false;
}

toggle.addEventListener('click', async () => {
  const current = await activeOrigin();
  if (!current) return;
  const enabled = toggle.dataset.enabled === 'true';

  if (enabled) {
    await chrome.runtime.sendMessage({ type: 'markmine:disable-origin', origin: current.origin });
    await chrome.permissions.remove({ origins: [pattern(current.origin)] });
  } else {
    const granted = await chrome.permissions.request({ origins: [pattern(current.origin)] });
    if (!granted) {
      status.textContent = t('permissionDenied', 'Permission was not granted.');
      return;
    }
    await chrome.runtime.sendMessage({ type: 'markmine:enable-origin', origin: current.origin });
    await chrome.tabs.reload(current.tabId);
  }

  await refresh();
});

options.addEventListener('click', () => chrome.runtime.openOptionsPage());
void refresh();
