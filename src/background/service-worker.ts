import { getSettings, patchSettings } from '../shared/storage';

function registrationId(origin: string): string {
  let hash = 0;
  for (const character of origin) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return `markmine-${Math.abs(hash)}`;
}

function matchPattern(origin: string): string {
  return `${origin.replace(/\/$/, '')}/*`;
}

async function registerOrigin(origin: string): Promise<void> {
  const id = registrationId(origin);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length > 0) await chrome.scripting.unregisterContentScripts({ ids: [id] });

  await chrome.scripting.registerContentScripts([{
    id,
    matches: [matchPattern(origin)],
    js: ['content.js'],
    css: ['styles/content.css'],
    runAt: 'document_idle',
    allFrames: false,
    persistAcrossSessions: true
  }]);
}

async function unregisterOrigin(origin: string): Promise<void> {
  const id = registrationId(origin);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length > 0) await chrome.scripting.unregisterContentScripts({ ids: [id] });
}

async function syncRegistrations(): Promise<void> {
  const settings = await getSettings();
  const expectedIds = new Set(settings.enabledOrigins.map(registrationId));
  const registered = await chrome.scripting.getRegisteredContentScripts();

  for (const script of registered) {
    if (script.id.startsWith('markmine-') && !expectedIds.has(script.id)) {
      await chrome.scripting.unregisterContentScripts({ ids: [script.id] });
    }
  }

  for (const origin of settings.enabledOrigins) {
    const granted = await chrome.permissions.contains({ origins: [matchPattern(origin)] });
    if (granted) await registerOrigin(origin);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void syncRegistrations();
});

chrome.runtime.onStartup.addListener(() => {
  void syncRegistrations();
});

chrome.runtime.onMessage.addListener((message: any, _sender: unknown, sendResponse: (response: unknown) => void) => {
  if (message?.type === 'markmine:enable-origin' && typeof message.origin === 'string') {
    void (async () => {
      const settings = await getSettings();
      if (!settings.enabledOrigins.includes(message.origin)) {
        await patchSettings({ enabledOrigins: [...settings.enabledOrigins, message.origin].sort() });
      }
      await registerOrigin(message.origin);
      sendResponse({ ok: true });
    })().catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === 'markmine:disable-origin' && typeof message.origin === 'string') {
    void (async () => {
      const settings = await getSettings();
      await patchSettings({ enabledOrigins: settings.enabledOrigins.filter(origin => origin !== message.origin) });
      await unregisterOrigin(message.origin);
      sendResponse({ ok: true });
    })().catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === 'markmine:sync') {
    void syncRegistrations()
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});
