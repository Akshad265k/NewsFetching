// ═══════════════════════════════════════════════════════════════════════════════
// THE CHRONICLE VAULT - TypeScript Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface DecryptedEntry {
  type: 'image' | 'pdf' | 'pdfl' | 'pdfc' | 'dfl' | '';
  prefix: string;
  pages: string[];
  pages_count: number;
  raw_decoded?: string;
}

export interface NewspaperData {
  [language: string]: {
    [newspaper: string]: {
      [edition: string]: string; // Obfuscated string
    };
  };
}

export interface DecodedNewspaperData {
  [language: string]: {
    [newspaper: string]: {
      [edition: string]: DecryptedEntry;
    };
  };
}

export interface Language {
  id: string;
  name: string;
  nativeName: string;
}

export interface Newspaper {
  id: string;
  name: string;
}

export interface Edition {
  id: string;
  name: string;
  pagesCount?: number;
}

export interface DateDataResponse {
  success: boolean;
  date: string;
  languages: Language[];
  languageCount: number;
  source: 'live';
  error?: string;
}

export interface NewspapersResponse {
  success: boolean;
  newspapers: Newspaper[];
  source: 'live';
  error?: string;
}

export interface EditionsResponse {
  success: boolean;
  editions: Edition[];
  source: 'live';
  error?: string;
}

export interface PdfResponse {
  success: boolean;
  pdfUrl?: string;
  source: 'live';
  error?: string;
}

export interface SelectionState {
  date: Date | null;
  language: string | null;
  newspaper: string | null;
  edition: string | null;
}

export interface LoadingState {
  languages: boolean;
  newspapers: boolean;
  editions: boolean;
  pdf: boolean;
}

export interface AppState {
  selection: SelectionState;
  loading: LoadingState;
  languages: Language[];
  newspapers: Newspaper[];
  editions: Edition[];
  pdfUrl: string | null;
  error: string | null;
  progress: ProgressState | null;
}

export interface ProgressState {
  status: 'running' | 'complete' | 'error';
  stage: 'validating' | 'fetching' | 'downloading' | 'decrypting' | 'merging' | 'complete' | 'error';
  message: string;
  current?: number;
  total?: number;
  logs: string[];
  startedAt?: string;
  updatedAt?: string;
}
