import type { EditorView } from '@codemirror/view';

export interface ToolbarCommand {
  label: string;
  title: string;
  run(view: EditorView): void;
}

function replaceSelection(view: EditorView, value: string, cursorOffset?: number): void {
  const range = view.state.selection.main;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: value },
    selection: { anchor: range.from + (cursorOffset ?? value.length) }
  });
  view.focus();
}

function wrap(view: EditorView, before: string, after = before): void {
  const range = view.state.selection.main;
  const selected = view.state.sliceDoc(range.from, range.to);
  const value = `${before}${selected}${after}`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: value },
    selection: selected
      ? { anchor: range.from + before.length, head: range.from + before.length + selected.length }
      : { anchor: range.from + before.length }
  });
  view.focus();
}

function linePrefix(view: EditorView, prefix: string): void {
  const range = view.state.selection.main;
  const doc = view.state.doc;
  const startLine = doc.lineAt(range.from);
  const endLine = doc.lineAt(range.to);
  const changes = [];

  for (let number = startLine.number; number <= endLine.number; number++) {
    const line = doc.line(number);
    changes.push({ from: line.from, insert: prefix });
  }

  view.dispatch({ changes });
  view.focus();
}

export const toolbarCommands: ToolbarCommand[] = [
  { label: 'H', title: 'Heading', run: view => linePrefix(view, '## ') },
  { label: 'B', title: 'Bold', run: view => wrap(view, '**') },
  { label: 'I', title: 'Italic', run: view => wrap(view, '*') },
  { label: 'S', title: 'Strikethrough', run: view => wrap(view, '~~') },
  { label: '❝', title: 'Quote', run: view => linePrefix(view, '> ') },
  { label: '<>', title: 'Inline code', run: view => wrap(view, '`') },
  { label: '```', title: 'Code block', run: view => wrap(view, '```\n', '\n```') },
  { label: '🔗', title: 'Link', run: view => wrap(view, '[', '](https://)') },
  { label: '•', title: 'Bulleted list', run: view => linePrefix(view, '- ') },
  { label: '1.', title: 'Numbered list', run: view => linePrefix(view, '1. ') },
  { label: '☑', title: 'Task list', run: view => linePrefix(view, '- [ ] ') },
  { label: '▦', title: 'Table', run: view => replaceSelection(view, '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |') },
  { label: '—', title: 'Horizontal rule', run: view => replaceSelection(view, '\n---\n') },
  { label: '@', title: 'Mention', run: view => replaceSelection(view, '@') },
  { label: '#', title: 'Issue reference', run: view => replaceSelection(view, '#') },
  { label: '😊', title: 'Emoji', run: view => replaceSelection(view, ':') }
];

export function createToolbar(view: EditorView): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'markmine-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Markdown formatting');

  const formatting = document.createElement('div');
  formatting.className = 'markmine-toolbar-formatting';
  toolbar.append(formatting);

  for (const command of toolbarCommands) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'markmine-toolbar-button';
    button.textContent = command.label;
    button.title = command.title;
    button.setAttribute('aria-label', command.title);
    button.addEventListener('click', () => command.run(view));
    formatting.append(button);
  }

  return toolbar;
}
