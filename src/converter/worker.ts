import { markdownToTextile } from './markdown-to-textile';

self.addEventListener('message', event => {
  const { id, markdown, options } = event.data as {
    id: number;
    markdown: string;
    options: Parameters<typeof markdownToTextile>[1];
  };

  try {
    const result = markdownToTextile(markdown, options);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
});
