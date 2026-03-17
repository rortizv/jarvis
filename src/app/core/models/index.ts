/** Speech (TTS/STT) */
export interface TextToSpeechProvider {
  speak(text: string): Promise<void>;
}

export interface SpeechToTextProvider {
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
  onResult(callback: (transcript: string, isFinal: boolean) => void): void;
}

/** Conversación / LLM */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface AzureChatRequest {
  messages: ChatMessage[];
  max_tokens: number;
  temperature: number;
}

export interface AzureChatResponse {
  choices?: { message?: { content?: string } }[];
}

export interface AzureErrorBody {
  error?: { code?: string };
}

/** MediaWiki / Wikipedia */
export interface WikiSearchPage {
  title?: string;
  key?: string;
  excerpt?: string;
}

export interface WikiSearchResponse {
  pages?: WikiSearchPage[];
}

export interface WikiQueryPages {
  [key: string]: { extract?: string };
}

export interface WikiExtractResponse {
  query?: { pages?: WikiQueryPages };
}

/** Búsqueda web - SearXNG */
export interface SearXNGResult {
  title?: string;
  content?: string;
  url?: string;
}

export interface SearXNGResponse {
  results?: SearXNGResult[];
}
