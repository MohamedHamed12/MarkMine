import type { RedmineAdapter } from './adapters';

function normaliseFilename(name: string): string {
  const extensionIndex = name.lastIndexOf('.');
  const extension = extensionIndex >= 0 ? name.slice(extensionIndex).toLowerCase() : '';
  const base = extensionIndex >= 0 ? name.slice(0, extensionIndex) : name;
  return `${base
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'attachment'}${extension}`;
}

function cloneWithName(file: File, name: string): File {
  if (file.name === name) return file;
  return new File([file], name, { type: file.type, lastModified: file.lastModified });
}

export function attachFiles(
  textarea: HTMLTextAreaElement,
  adapter: RedmineAdapter,
  files: File[]
): string[] {
  const input = adapter.findAttachmentInput(textarea);
  if (!input || files.length === 0) return [];

  const normalized = files.map(file => cloneWithName(file, normaliseFilename(file.name)));
  const transfer = new DataTransfer();

  for (const file of Array.from(input.files ?? [])) transfer.items.add(file);
  for (const file of normalized) transfer.items.add(file);

  try {
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } catch {
    return [];
  }

  return normalized.map(file => {
    if (file.type.startsWith('image/')) return `![](${file.name})`;
    return `[${file.name}](attachment:${file.name})`;
  });
}
