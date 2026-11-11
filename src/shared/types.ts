export type ServerFormat = 'auto' | 'textile' | 'markdown';
export type LineBreakMode = 'preserve' | 'markdown';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface MarkMineTemplate {
  id: string;
  name: string;
  tracker: string;
  content: string;
}

export interface SavedReply {
  id: string;
  name: string;
  content: string;
}

export interface FeatureFlags {
  autocomplete: boolean;
  drafts: boolean;
  badges: boolean;
  shortcuts: boolean;
  darkMode: boolean;
  quoteReply: boolean;
  copyHelpers: boolean;
  relativeTimes: boolean;
  collapseComments: boolean;
  taskLists: boolean;
  hoverCards: boolean;
}

export interface ExtensionSettings {
  enabledOrigins: string[];
  formatOverrides: Record<string, ServerFormat>;
  lineBreakMode: LineBreakMode;
  theme: ThemeMode;
  rtl: 'auto' | 'ltr' | 'rtl';
  monospace: boolean;
  lineWrap: boolean;
  debug: boolean;
  branchPattern: string;
  badgeColors: Record<string, string>;
  features: FeatureFlags;
  templates: MarkMineTemplate[];
  replies: SavedReply[];
}

export interface ConversionWarning {
  code: string;
  message: string;
}

export interface ConversionResult {
  text: string;
  warnings: ConversionWarning[];
}
