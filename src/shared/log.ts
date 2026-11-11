export function createLogger(enabled: boolean) {
  return {
    debug: (...args: unknown[]) => {
      if (enabled) console.debug('[MarkMine]', ...args);
    },
    warn: (...args: unknown[]) => console.warn('[MarkMine]', ...args),
    error: (...args: unknown[]) => console.error('[MarkMine]', ...args)
  };
}
