interface DraftVersion {
  markdown: string;
  savedAt: number;
}

interface DraftRecord {
  sourceFingerprint: string;
  originalSource: string;
  versions: DraftVersion[];
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function key(textarea: HTMLTextAreaElement): string {
  const identity = textarea.id || textarea.name || 'textarea';
  return `markmine.draft:${location.origin}:${location.pathname}:${identity}`;
}

export async function loadDraft(textarea: HTMLTextAreaElement, originalSource: string): Promise<DraftVersion | null> {
  const data = await chrome.storage.local.get(key(textarea));
  const storageKey = key(textarea);
  const record = data[storageKey] as DraftRecord | undefined;
  if (!record) return null;
  if (record.sourceFingerprint !== hash(originalSource)) {
    await chrome.storage.local.remove(storageKey);
    return null;
  }
  return record.versions.at(-1) ?? null;
}

export async function saveDraft(
  textarea: HTMLTextAreaElement,
  originalSource: string,
  markdown: string
): Promise<void> {
  const storageKey = key(textarea);
  const data = await chrome.storage.local.get(storageKey);
  const existing = data[storageKey] as DraftRecord | undefined;
  const fingerprint = hash(originalSource);
  const versions = existing?.sourceFingerprint === fingerprint ? [...existing.versions] : [];
  const last = versions.at(-1);

  if (last?.markdown === markdown) return;

  versions.push({ markdown, savedAt: Date.now() });
  await chrome.storage.local.set({
    [storageKey]: {
      sourceFingerprint: fingerprint,
      originalSource,
      versions: versions.slice(-10)
    } satisfies DraftRecord
  });
}

export async function clearDraft(textarea: HTMLTextAreaElement): Promise<void> {
  await chrome.storage.local.remove(key(textarea));
}
