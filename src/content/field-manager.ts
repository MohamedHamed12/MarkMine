import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import { textileToMarkdown } from '../converter';
import { t } from '../shared/i18n';
import type { ExtensionSettings, ServerFormat } from '../shared/types';
import type { RedmineAdapter } from './adapters';
import { createCompletionSource } from './autocomplete';
import { convertMarkdownForTyping, convertMarkdownSync } from './conversion-service';
import { clearDraft, loadDraft, saveDraft } from './drafts';
import { createMarkdownEditor, type MarkdownEditorHandle } from './editor/create-editor';
import { attachFiles } from './uploads';

interface FieldControllerOptions {
  textarea: HTMLTextAreaElement;
  adapter: RedmineAdapter;
  settings: ExtensionSettings;
  format: Exclude<ServerFormat, 'auto'>;
  onDirtyChange(): void;
}

const localPreviewRenderer = new MarkdownIt({ html: true, linkify: true, breaks: true });

function createButton(label: string, title: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'markmine-toolbar-button';
  button.textContent = label;
  button.title = title;
  return button;
}

function normalizeRoundTrip(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fieldId(textarea: HTMLTextAreaElement): string {
  return textarea.id || textarea.name || 'textarea';
}

function resolveVariables(value: string): string {
  const issueId = location.pathname.match(/\/issues\/(\d+)/)?.[1] ?? '';
  const subject = document.querySelector<HTMLElement>('h2, .subject h3')?.textContent?.trim() ?? '';
  const user = document.querySelector<HTMLElement>('#loggedas a, .login')?.textContent?.trim() ?? '';
  const date = new Date().toISOString().slice(0, 10);

  return value
    .replaceAll('{{issue.id}}', issueId)
    .replaceAll('{{issue.subject}}', subject)
    .replaceAll('{{user.name}}', user)
    .replaceAll('{{date}}', date);
}

export class FieldController {
  readonly textarea: HTMLTextAreaElement;
  private readonly adapter: RedmineAdapter;
  private readonly settings: ExtensionSettings;
  private readonly format: Exclude<ServerFormat, 'auto'>;
  private readonly originalSource: string;
  private readonly onDirtyChange: () => void;
  private editor: MarkdownEditorHandle | null = null;
  private dirty = false;
  private enabled = true;
  private internalTextareaWrite = false;
  private currentMarkdown = '';
  private conversionSequence = 0;
  private draftTimer: number | null = null;
  private errorBanner: HTMLElement | null = null;
  private warningDetails: HTMLDetailsElement | null = null;
  private localPreview: HTMLElement | null = null;
  private nativeEditorChrome: HTMLElement[] = [];

  constructor(options: FieldControllerOptions) {
    this.textarea = options.textarea;
    this.adapter = options.adapter;
    this.settings = options.settings;
    this.format = options.format;
    this.originalSource = this.textarea.value;
    this.onDirtyChange = options.onDirtyChange;
  }

  async mount(): Promise<void> {
    let initialMarkdown = this.originalSource;
    let initialConversionSafe = true;
    if (this.format === 'textile') {
      const converted = textileToMarkdown(this.originalSource, {
        lineBreakMode: this.settings.lineBreakMode
      });
      initialMarkdown = converted.text;
      const parseFailed = converted.warnings.some(warning => warning.code === 'textile-parse-failed');
      if (!parseFailed) {
        try {
          const roundTrip = convertMarkdownSync(initialMarkdown, this.settings.lineBreakMode).text;
          initialConversionSafe = normalizeRoundTrip(roundTrip) === normalizeRoundTrip(this.originalSource);
        } catch {
          initialConversionSafe = false;
        }
      } else {
        initialConversionSafe = false;
      }
    }
    this.currentMarkdown = initialMarkdown;

    const completionSource = this.settings.features.autocomplete
      ? createCompletionSource(this.adapter)
      : undefined;

    this.editor = createMarkdownEditor({
      initialValue: initialMarkdown,
      completionSource,
      lineWrap: this.settings.lineWrap,
      monospace: this.settings.monospace,
      onChange: value => this.handleEditorChange(value),
      onBlur: () => this.dispatchChange(),
      onSubmit: () => this.submitForm(),
      onPreview: () => this.preview(),
      onPasteFiles: files => this.pasteFiles(files)
    });

    this.nativeEditorChrome = this.adapter.findNativeEditorChrome(this.textarea);
    this.decorateToolbar();
    this.textarea.insertAdjacentElement('beforebegin', this.editor.root);
    this.textarea.addEventListener('input', this.handleNativeInput);

    if (initialConversionSafe) {
      this.textarea.classList.add('markmine-source-textarea');
      this.setNativeEditorChromeVisible(false);
    } else {
      this.enabled = false;
      this.editor.setVisible(false);
      const fallback = document.createElement('div');
      fallback.className = 'markmine-error-banner markmine-native-fallback';
      const text = document.createElement('span');
      text.textContent = t('nativeFallback', 'MarkMine could not safely convert this existing Textile field. The native editor was kept unchanged.');
      const force = createButton(t('editMarkdownAnyway', 'Edit as Markdown anyway'), 'Open the Markdown editor with the raw source');
      force.addEventListener('click', () => {
        this.enabled = true;
        this.textarea.classList.add('markmine-source-textarea');
        this.setNativeEditorChromeVisible(false);
        this.editor?.setVisible(true);
        this.editor?.view.focus();
        fallback.remove();
      });
      fallback.append(text, force);
      this.textarea.insertAdjacentElement('beforebegin', fallback);
    }

    if (initialConversionSafe && this.settings.features.drafts) await this.offerDraftRestore();
  }

  destroy(): void {
    this.textarea.removeEventListener('input', this.handleNativeInput);
    this.textarea.classList.remove('markmine-source-textarea');
    this.setNativeEditorChromeVisible(true);
    this.editor?.destroy();
    if (this.draftTimer !== null) window.clearTimeout(this.draftTimer);
  }

  isDirty(): boolean {
    return this.dirty;
  }

  getMarkdown(): string {
    return this.editor?.getValue() ?? this.currentMarkdown;
  }

  insert(value: string): void {
    if (!this.enabled) this.toggleMode(true);
    this.editor?.insert(value);
  }

  setMarkdown(value: string): void {
    if (!this.enabled) this.toggleMode(true);
    this.editor?.setValue(value);
  }

  syncForSubmit(): void {
    if (!this.dirty || !this.enabled) return;
    this.syncConvertedValue(this.getMarkdown(), true);
  }

  async clearDraftAfterSubmit(): Promise<void> {
    if (this.settings.features.drafts) await clearDraft(this.textarea);
  }

  private handleNativeInput = (): void => {
    if (this.internalTextareaWrite || this.enabled) return;
    this.markDirty();
  };

  private decorateToolbar(): void {
    if (!this.editor) return;

    const toggle = createButton(t('textile', 'Textile'), 'Toggle native Textile editor');
    toggle.addEventListener('click', () => this.toggleMode(!this.enabled));
    this.editor.actions.append(toggle);

    const localPreview = createButton(t('localPreview', 'Local'), 'Toggle approximate local Markdown preview');
    localPreview.addEventListener('click', () => {
      if (!this.editor || !this.localPreview) return;
      const visible = this.localPreview.hidden;
      this.localPreview.hidden = !visible;
      this.editor.root.classList.toggle('markmine-split-preview', visible);
      if (visible) this.renderLocalPreview(this.editor.getValue());
    });
    this.editor.actions.append(localPreview);

    const zen = createButton(t('zen', 'Zen'), 'Toggle full-screen editor');
    zen.addEventListener('click', () => this.editor?.root.classList.toggle('markmine-zen'));
    this.editor.actions.append(zen);

    this.localPreview = document.createElement('div');
    this.localPreview.className = 'markmine-local-preview wiki';
    this.localPreview.hidden = true;
    this.localPreview.setAttribute('aria-label', 'Approximate local Markdown preview');
    this.editor.root.append(this.localPreview);

    this.warningDetails = document.createElement('details');
    this.warningDetails.className = 'markmine-conversion-warnings';
    this.warningDetails.hidden = true;
    this.editor.root.append(this.warningDetails);

    if (this.settings.templates.length > 0) {
      const select = document.createElement('select');
      select.className = 'markmine-toolbar-select';
      select.setAttribute('aria-label', 'Insert template');
      select.innerHTML = `<option value="">${t('template', 'Template…')}</option>`;
      for (const template of this.settings.templates) {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.name;
        select.append(option);
      }
      select.addEventListener('change', () => {
        const template = this.settings.templates.find(item => item.id === select.value);
        if (template) this.editor?.insert(resolveVariables(template.content));
        select.value = '';
      });
      this.editor.actions.append(select);
    }

    if (this.settings.replies.length > 0) {
      const select = document.createElement('select');
      select.className = 'markmine-toolbar-select';
      select.setAttribute('aria-label', 'Insert saved reply');
      select.innerHTML = `<option value="">${t('reply', 'Reply…')}</option>`;
      for (const reply of this.settings.replies) {
        const option = document.createElement('option');
        option.value = reply.id;
        option.textContent = reply.name;
        select.append(option);
      }
      select.addEventListener('change', () => {
        const reply = this.settings.replies.find(item => item.id === select.value);
        if (reply) this.editor?.insert(resolveVariables(reply.content));
        select.value = '';
      });
      this.editor.actions.append(select);
    }
  }

  private handleEditorChange(value: string): void {
    this.currentMarkdown = value;
    this.renderLocalPreview(value);
    this.markDirty();
    this.scheduleDraft(value);

    if (this.format === 'markdown') {
      this.updateWarnings([]);
      this.writeTextarea(value);
      return;
    }

    const sequence = ++this.conversionSequence;
    void convertMarkdownForTyping(value, this.settings.lineBreakMode)
      .then(result => {
        if (sequence !== this.conversionSequence) return;
        this.hideError();
        this.updateWarnings(result.warnings);
        this.writeTextarea(result.text);
      })
      .catch(error => {
        if (sequence !== this.conversionSequence) return;
        this.showError(`Conversion failed. Your Markdown is preserved and will be submitted as raw text if necessary. ${String(error)}`);
      });
  }

  private syncConvertedValue(markdown: string, dispatchChange: boolean): void {
    try {
      const result = this.format === 'textile'
        ? convertMarkdownSync(markdown, this.settings.lineBreakMode)
        : { text: markdown, warnings: [] };
      this.hideError();
      this.updateWarnings(result.warnings);
      this.writeTextarea(result.text, dispatchChange);
    } catch (error) {
      this.writeTextarea(markdown, dispatchChange);
      this.showError(`Conversion failed. Raw editor text was kept so saving is never blocked. ${String(error)}`);
    }
  }

  private writeTextarea(value: string, dispatchChange = false): void {
    this.internalTextareaWrite = true;
    this.textarea.value = value;
    this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    if (dispatchChange) this.textarea.dispatchEvent(new Event('change', { bubbles: true }));
    this.internalTextareaWrite = false;
  }

  private dispatchChange(): void {
    if (!this.dirty || !this.enabled) return;
    this.syncConvertedValue(this.getMarkdown(), true);
  }

  private markDirty(): void {
    if (this.dirty) return;
    this.dirty = true;
    this.onDirtyChange();
  }

  private scheduleDraft(markdown: string): void {
    if (!this.settings.features.drafts) return;
    if (this.draftTimer !== null) window.clearTimeout(this.draftTimer);
    this.draftTimer = window.setTimeout(() => {
      void saveDraft(this.textarea, this.originalSource, markdown);
    }, 1200);
  }

  private async offerDraftRestore(): Promise<void> {
    const draft = await loadDraft(this.textarea, this.originalSource);
    if (!draft || draft.markdown === this.currentMarkdown || !this.editor) return;

    const banner = document.createElement('div');
    banner.className = 'markmine-draft-banner';
    banner.innerHTML = `<span>${t('draftAvailable', 'A newer local draft is available.')}</span>`;

    const restore = createButton(t('restore', 'Restore'), 'Restore local draft');
    restore.addEventListener('click', () => {
      this.editor?.setValue(draft.markdown);
      banner.remove();
    });

    const discard = createButton(t('discard', 'Discard'), 'Discard local draft');
    discard.addEventListener('click', () => {
      void clearDraft(this.textarea);
      banner.remove();
    });

    banner.append(restore, discard);
    this.editor.root.prepend(banner);
  }

  private setNativeEditorChromeVisible(visible: boolean): void {
    for (const element of this.nativeEditorChrome) {
      element.classList.toggle('markmine-native-chrome-hidden', !visible);
    }
  }

  private toggleMode(enableMarkdown: boolean): void {
    if (!this.editor || enableMarkdown === this.enabled) return;

    if (!enableMarkdown) {
      this.syncConvertedValue(this.editor.getValue(), true);
      this.editor.setVisible(false);
      this.textarea.classList.remove('markmine-source-textarea');
      this.setNativeEditorChromeVisible(true);
      this.textarea.focus();
      this.enabled = false;
      return;
    }

    const markdown = this.format === 'textile'
      ? textileToMarkdown(this.textarea.value, { lineBreakMode: this.settings.lineBreakMode }).text
      : this.textarea.value;
    this.currentMarkdown = markdown;
    this.editor.setValue(markdown);
    this.textarea.classList.add('markmine-source-textarea');
    this.setNativeEditorChromeVisible(false);
    this.editor.setVisible(true);
    this.editor.view.focus();
    this.enabled = true;
  }

  private submitForm(): void {
    this.syncForSubmit();
    const form = this.textarea.closest('form');
    if (form) {
      form.requestSubmit();
      return;
    }
    this.adapter.findSubmitButton(this.textarea)?.click();
  }

  private preview(): void {
    this.syncForSubmit();
    const trigger = this.adapter.findPreviewTrigger(this.textarea);
    if (trigger) {
      trigger.click();
      return;
    }
    this.showError('Redmine preview control was not found for this field. The converted Textile remains visible through the native editor toggle.');
  }

  private pasteFiles(files: File[]): void {
    const snippets = attachFiles(this.textarea, this.adapter, files);
    if (snippets.length === 0) {
      this.showError('No Redmine attachment input was found. Use the native attachment control for this field.');
      return;
    }
    this.editor?.insert(snippets.join('\n'));
  }

  private renderLocalPreview(markdown: string): void {
    if (!this.localPreview || this.localPreview.hidden) return;
    this.localPreview.innerHTML = DOMPurify.sanitize(localPreviewRenderer.render(markdown));
    for (const element of this.localPreview.querySelectorAll<HTMLElement>('p,li,blockquote,td,th')) element.dir = 'auto';
  }

  private updateWarnings(warnings: Array<{ code: string; message: string }>): void {
    if (!this.warningDetails) return;
    this.warningDetails.replaceChildren();
    if (warnings.length === 0) {
      this.warningDetails.hidden = true;
      return;
    }
    this.warningDetails.hidden = false;
    const summary = document.createElement('summary');
    summary.textContent = `${t('conversionWarnings', 'Conversion warnings')} (${warnings.length})`;
    const list = document.createElement('ul');
    for (const warning of warnings) {
      const item = document.createElement('li');
      item.textContent = warning.message;
      list.append(item);
    }
    this.warningDetails.append(summary, list);
  }

  private showError(message: string): void {
    if (!this.editor) return;
    if (!this.errorBanner) {
      this.errorBanner = document.createElement('div');
      this.errorBanner.className = 'markmine-error-banner';
      const dismiss = createButton('×', 'Dismiss');
      dismiss.addEventListener('click', () => this.hideError());
      this.errorBanner.append(dismiss);
      this.editor.root.prepend(this.errorBanner);
    }
    const text = this.errorBanner.querySelector('span') ?? document.createElement('span');
    text.textContent = message;
    if (!text.parentElement) this.errorBanner.prepend(text);
  }

  private hideError(): void {
    this.errorBanner?.remove();
    this.errorBanner = null;
  }
}

export class FieldManager {
  private readonly controllers = new Map<HTMLTextAreaElement, FieldController>();
  private readonly adapter: RedmineAdapter;
  private readonly settings: ExtensionSettings;
  private readonly format: Exclude<ServerFormat, 'auto'>;
  private observer: MutationObserver | null = null;
  private beforeUnloadBound = false;
  private submitting = false;

  constructor(adapter: RedmineAdapter, settings: ExtensionSettings, format: Exclude<ServerFormat, 'auto'>) {
    this.adapter = adapter;
    this.settings = settings;
    this.format = format;
  }

  async start(): Promise<void> {
    await this.enhance(document);
    this.observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement) void this.enhance(node);
        }
      }
    });
    this.observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('submit', this.handleSubmit, true);
    this.bindTemplateByTracker();
  }

  stop(): void {
    this.observer?.disconnect();
    document.removeEventListener('submit', this.handleSubmit, true);
    for (const controller of this.controllers.values()) controller.destroy();
    this.controllers.clear();
  }

  insertIntoNotes(value: string): boolean {
    const target = Array.from(this.controllers.values()).find(controller => {
      const id = fieldId(controller.textarea);
      return id === 'issue_notes' || /journal-\d+-notes/.test(id);
    });
    if (!target) return false;
    target.insert(value);
    return true;
  }

  private async enhance(root: ParentNode): Promise<void> {
    const textareas = this.adapter.findEditableTextareas(root);
    for (const textarea of textareas) {
      if (this.controllers.has(textarea)) continue;
      const controller = new FieldController({
        textarea,
        adapter: this.adapter,
        settings: this.settings,
        format: this.format,
        onDirtyChange: () => this.bindBeforeUnload()
      });
      this.controllers.set(textarea, controller);
      await controller.mount();
    }
  }

  private bindBeforeUnload(): void {
    if (this.beforeUnloadBound) return;
    this.beforeUnloadBound = true;
    window.addEventListener('beforeunload', event => {
      if (this.submitting || ![...this.controllers.values()].some(controller => controller.isDirty())) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  private handleSubmit = (): void => {
    this.submitting = true;
    for (const controller of this.controllers.values()) controller.syncForSubmit();
    window.setTimeout(() => {
      this.submitting = false;
    }, 0);
  };

  private bindTemplateByTracker(): void {
    const description = this.controllers.get(document.querySelector<HTMLTextAreaElement>('#issue_description') as HTMLTextAreaElement);
    const tracker = document.querySelector<HTMLSelectElement>('#issue_tracker_id');
    if (!description || !tracker || this.settings.templates.length === 0) return;

    tracker.addEventListener('change', () => {
      const trackerName = tracker.selectedOptions[0]?.textContent?.trim() ?? '';
      const template = this.settings.templates.find(item => item.tracker === trackerName || item.tracker === '*');
      if (!template) return;
      const current = description.getMarkdown();
      if (current.trim() && !confirm(`Replace the current description with the ${template.name} template?`)) return;
      description.setMarkdown(template.content);
    });
  }
}
