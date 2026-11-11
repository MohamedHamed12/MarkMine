import { getSettings } from '../shared/storage';
import { createLogger } from '../shared/log';
import { defaultAdapter } from './adapters';
import { detectRedmine } from './detect';
import { FieldManager } from './field-manager';
import { installPageEnhancements } from './page-enhancements';

async function main(): Promise<void> {
  const settings = await getSettings();
  const logger = createLogger(settings.debug);
  const detection = detectRedmine();

  if (!detection.isRedmine) {
    logger.debug('Page does not look like Redmine; no changes applied.');
    return;
  }

  const override = settings.formatOverrides[location.origin] ?? 'auto';
  const detected = detection.format === 'unknown' ? 'textile' : detection.format;
  const format = override === 'auto' ? detected : override;

  const diagnostics = {
    capturedAt: new Date().toISOString(),
    origin: location.origin,
    path: location.pathname,
    version: detection.version,
    detectedFormat: detection.format,
    effectiveFormat: format,
    editorCount: defaultAdapter.findEditableTextareas(document).length,
    userAgent: navigator.userAgent
  };
  await chrome.storage.local.set({ 'markmine.diagnostics': diagnostics });
  logger.debug('Activated', diagnostics);

  const manager = new FieldManager(defaultAdapter, settings, format);
  await manager.start();
  installPageEnhancements(settings, defaultAdapter, value => manager.insertIntoNotes(value));
}

void main();
