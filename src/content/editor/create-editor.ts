import { autocompletion, closeBrackets, closeBracketsKeymap, type CompletionSource } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownKeymap } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, type KeyBinding, type ViewUpdate } from '@codemirror/view';
import TurndownService from 'turndown';
import { t } from '../../shared/i18n';
import { createToolbar } from './toolbar';

export interface MarkdownEditorOptions {
  initialValue: string;
  completionSource?: CompletionSource;
  lineWrap: boolean;
  monospace: boolean;
  onChange(value: string): void;
  onBlur?(): void;
  onSubmit(): void;
  onPreview(): void;
  onPasteFiles?(files: File[]): void;
}

export interface MarkdownEditorHandle {
  root: HTMLElement;
  toolbar: HTMLElement;
  actions: HTMLElement;
  view: EditorView;
  getValue(): string;
  setValue(value: string): void;
  insert(value: string): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

function continueTaskList(view: EditorView): boolean {
  const range = view.state.selection.main;
  if (!range.empty) return false;
  const line = view.state.doc.lineAt(range.head);
  const before = view.state.sliceDoc(line.from, range.head);
  const match = before.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/);
  if (!match) return false;

  if (match[3].trim() === '') {
    view.dispatch({
      changes: { from: line.from, to: range.head, insert: '' }
    });
    return true;
  }

  const insert = `\n${match[1]}- [ ] `;
  view.dispatch({
    changes: { from: range.head, insert },
    selection: { anchor: range.head + insert.length }
  });
  return true;
}

function shortcutKeymap(options: MarkdownEditorOptions): KeyBinding[] {
  return [
    { key: 'Enter', run: (view: EditorView) => continueTaskList(view) },
    { key: 'Mod-b', run: (view: EditorView) => wrap(view, '**') },
    { key: 'Mod-i', run: (view: EditorView) => wrap(view, '*') },
    { key: 'Mod-e', run: (view: EditorView) => wrap(view, '`') },
    { key: 'Mod-k', run: (view: EditorView) => wrap(view, '[', '](https://)') },
    { key: 'Mod-Shift-7', run: (view: EditorView) => prefixLines(view, '1. ') },
    { key: 'Mod-Shift-8', run: (view: EditorView) => prefixLines(view, '- ') },
    { key: 'Mod-Shift-.', run: (view: EditorView) => prefixLines(view, '> ') },
    {
      key: 'Mod-Enter',
      run: () => {
        options.onSubmit();
        return true;
      }
    },
    {
      key: 'Escape',
      run: (view: EditorView) => {
        (view.contentDOM as HTMLElement).blur();
        return true;
      }
    }
  ];
}

function wrap(view: EditorView, before: string, after = before): boolean {
  const range = view.state.selection.main;
  const selected = view.state.sliceDoc(range.from, range.to);
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: `${before}${selected}${after}` },
    selection: selected
      ? { anchor: range.from + before.length, head: range.from + before.length + selected.length }
      : { anchor: range.from + before.length }
  });
  return true;
}

function prefixLines(view: EditorView, prefix: string): boolean {
  const range = view.state.selection.main;
  const start = view.state.doc.lineAt(range.from).number;
  const end = view.state.doc.lineAt(range.to).number;
  const changes = [];
  for (let lineNo = start; lineNo <= end; lineNo++) {
    changes.push({ from: view.state.doc.line(lineNo).from, insert: prefix });
  }
  view.dispatch({ changes });
  return true;
}

export function createMarkdownEditor(options: MarkdownEditorOptions): MarkdownEditorHandle {
  const host = document.createElement('div');
  host.className = 'markmine-editor';

  const editorHost = document.createElement('div');
  editorHost.className = 'markmine-editor-surface';
  editorHost.setAttribute('dir', 'auto');

  const extensions = [
    markdown(),
    history(),
    closeBrackets(),
    EditorView.perLineTextDirection.of(true),
    keymap.of([
      ...shortcutKeymap(options),
      indentWithTab,
      ...closeBracketsKeymap,
      ...markdownKeymap,
      ...defaultKeymap,
      ...historyKeymap
    ]),
    EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) options.onChange(update.state.doc.toString());
      if (update.focusChanged && !update.view.hasFocus) options.onBlur?.();
    }),
    EditorView.domEventHandlers({
      paste(event: ClipboardEvent, view: EditorView) {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length > 0 && options.onPasteFiles) {
          event.preventDefault();
          options.onPasteFiles(files);
          return true;
        }

        const plain = event.clipboardData?.getData('text/plain') ?? '';
        const html = event.clipboardData?.getData('text/html') ?? '';
        const selection = view.state.selection.main;
        const selected = view.state.sliceDoc(selection.from, selection.to);

        if (selected && /^https?:\/\/\S+$/.test(plain.trim())) {
          event.preventDefault();
          const value = `[${selected}](${plain.trim()})`;
          view.dispatch({
            changes: { from: selection.from, to: selection.to, insert: value },
            selection: { anchor: selection.from + value.length }
          });
          return true;
        }

        if (html && /<(table|strong|em|ul|ol|blockquote|pre|code|a)\b/i.test(html)) {
          event.preventDefault();
          const markdownValue = new TurndownService({
            headingStyle: 'atx',
            bulletListMarker: '-',
            codeBlockStyle: 'fenced'
          }).turndown(html);
          view.dispatch({
            changes: { from: selection.from, to: selection.to, insert: markdownValue },
            selection: { anchor: selection.from + markdownValue.length }
          });
          return true;
        }

        return false;
      },
      drop(event: DragEvent) {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length === 0 || !options.onPasteFiles) return false;
        event.preventDefault();
        options.onPasteFiles(files);
        return true;
      }
    }),
    EditorView.theme({
      '&': {
        fontSize: '14px',
        minHeight: '160px'
      },
      '.cm-content': {
        fontFamily: options.monospace ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : 'inherit',
        minHeight: '160px'
      },
      '.cm-scroller': {
        overflow: 'auto'
      }
    })
  ];

  if (options.lineWrap) extensions.push(EditorView.lineWrapping);
  if (options.completionSource) {
    extensions.push(autocompletion({ override: [options.completionSource], activateOnTyping: true }));
  }

  const state = EditorState.create({ doc: options.initialValue, extensions });
  const view = new EditorView({ state, parent: editorHost });
  const toolbar = createToolbar(view);
  const actions = document.createElement('div');
  actions.className = 'markmine-toolbar-actions';

  const preview = document.createElement('button');
  preview.type = 'button';
  preview.className = 'markmine-toolbar-button markmine-preview-button';
  preview.textContent = t('preview', 'Preview');
  preview.addEventListener('click', options.onPreview);
  actions.append(preview);
  toolbar.append(actions);

  host.append(toolbar, editorHost);

  return {
    root: host,
    toolbar,
    actions,
    view,
    getValue: () => view.state.doc.toString(),
    setValue(value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    },
    insert(value) {
      const range = view.state.selection.main;
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: value },
        selection: { anchor: range.from + value.length }
      });
      view.focus();
    },
    setVisible(visible) {
      host.hidden = !visible;
    },
    destroy() {
      view.destroy();
      host.remove();
    }
  };
}
