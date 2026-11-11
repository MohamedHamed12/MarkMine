import { markdownToTextile } from '../converter';
import type { ConversionResult, LineBreakMode } from '../shared/types';

interface PendingRequest {
  resolve(result: ConversionResult): void;
  reject(error: Error): void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, PendingRequest>();

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(chrome.runtime.getURL('converter-worker.js'));
  worker.addEventListener('message', event => {
    const { id, result, error } = event.data as {
      id: number;
      result?: { text: string; warnings: ConversionResult['warnings'] };
      error?: string;
    };
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    if (error) request.reject(new Error(error));
    else if (result) request.resolve(result);
  });

  worker.addEventListener('error', event => {
    for (const request of pending.values()) request.reject(new Error(event.message));
    pending.clear();
    worker?.terminate();
    worker = null;
  });

  return worker;
}

export function convertMarkdownSync(markdown: string, lineBreakMode: LineBreakMode): ConversionResult {
  return markdownToTextile(markdown, { lineBreakMode });
}

export async function convertMarkdownForTyping(
  markdown: string,
  lineBreakMode: LineBreakMode
): Promise<ConversionResult> {
  if (markdown.length < 20_000) return convertMarkdownSync(markdown, lineBreakMode);

  const id = nextId++;
  const currentWorker = getWorker();
  return new Promise<ConversionResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    currentWorker.postMessage({ id, markdown, options: { lineBreakMode } });
  });
}
