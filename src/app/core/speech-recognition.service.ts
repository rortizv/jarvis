import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export interface SpeechToTextProvider {
  start(): void | Promise<void>;
  stop(): void;
  onResult(callback: (transcript: string, isFinal: boolean) => void): void;
}

@Injectable({ providedIn: 'root' })
export class SpeechRecognitionService implements SpeechToTextProvider {
  private resultCallback: ((transcript: string, isFinal: boolean) => void) | null = null;
  private startCallback: (() => void) | null = null;
  private endCallback: (() => void) | null = null;
  private webRecognition: InstanceType<typeof SpeechRecognition> | null = null;
  private azureRecognizer: unknown = null;
  private azureReady: Promise<void> | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    if (environment.azure?.apiKey && environment.azure?.region) {
      this.azureReady = this.initAzure();
    } else {
      this.initWebSpeech();
    }
  }

  private initWebSpeech(): void {
    const API = window.SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!API) {
      console.warn('Speech Recognition no soportado en este navegador.');
      return;
    }
    this.webRecognition = new API();
    this.webRecognition.continuous = true;
    this.webRecognition.interimResults = true;
    this.webRecognition.lang = 'es-CO';
    this.webRecognition.onstart = () => this.startCallback?.();
    this.webRecognition.onend = () => this.endCallback?.();
    this.webRecognition.onresult = (event: SpeechRecognitionEvent) => {
      if (!this.resultCallback) return;
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      const isFinal = event.results[event.results.length - 1]?.isFinal ?? false;
      const normalized = this.normalizeTranscript(transcript);
      if (normalized.length > 0) this.resultCallback(normalized, isFinal);
    };
  }

  private async initAzure(): Promise<void> {
    try {
      const { loadAzureSpeechSdk } = await import('./azure-speech-loader');
      const sdk = (await loadAzureSpeechSdk()) as {
        SpeechConfig: { fromSubscription: (key: string, region: string) => unknown };
        AudioConfig: { fromDefaultMicrophoneInput: () => unknown };
        SpeechRecognizer: new (config: unknown, audio: unknown) => unknown;
      };
      const speechConfig = sdk.SpeechConfig.fromSubscription(
        environment.azure.apiKey,
        environment.azure.region
      );
      (speechConfig as { speechRecognitionLanguage: string }).speechRecognitionLanguage = 'es-CO';
      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig) as {
        recognizing: ((_: unknown, e: { result: { text: string } }) => void) | null;
        recognized: ((_: unknown, e: { result: { text: string } }) => void) | null;
        sessionStarted: (() => void) | null;
        sessionStopped: (() => void) | null;
        startContinuousRecognitionAsync: (onSuccess?: () => void, onErr?: (e: unknown) => void) => void;
        stopContinuousRecognitionAsync: (onSuccess?: () => void) => void;
      };
      this.azureRecognizer = recognizer;

      recognizer.recognizing = (_: unknown, e: { result: { text: string } }) => {
        const text = e.result?.text?.trim();
        if (text && this.resultCallback) {
          this.resultCallback(this.normalizeTranscript(text), false);
        }
      };
      recognizer.recognized = (_: unknown, e: { result: { text: string } }) => {
        const text = e.result?.text?.trim();
        if (text && this.resultCallback) {
          this.resultCallback(this.normalizeTranscript(text), true);
        }
      };
      recognizer.sessionStarted = () => this.startCallback?.();
      recognizer.sessionStopped = () => this.endCallback?.();
    } catch (err) {
      console.warn('Azure Speech no disponible, usando Web Speech.', err);
      this.initWebSpeech();
    }
  }

  private normalizeTranscript(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim();
  }

  async start(): Promise<void> {
    if (this.webRecognition) {
      try {
        this.webRecognition.start();
      } catch {
        // already started
      }
      return;
    }
    if (this.azureReady) await this.azureReady;
    const r = this.azureRecognizer as { startContinuousRecognitionAsync: (onSuccess?: () => void, onErr?: (e: unknown) => void) => void } | null;
    if (r?.startContinuousRecognitionAsync) {
      r.startContinuousRecognitionAsync(() => this.startCallback?.(), (e: unknown) => console.error(e));
    }
  }

  stop(): void {
    if (this.webRecognition) {
      try {
        this.webRecognition.stop();
      } catch {
        // no-op
      }
      return;
    }
    const r = this.azureRecognizer as { stopContinuousRecognitionAsync: (onSuccess?: () => void) => void } | null;
    if (r?.stopContinuousRecognitionAsync) {
      r.stopContinuousRecognitionAsync(() => this.endCallback?.());
    }
  }

  onResult(callback: (transcript: string, isFinal: boolean) => void): void {
    this.resultCallback = callback;
  }

  onStart(callback: () => void): void {
    this.startCallback = callback;
  }

  onEnd(callback: () => void): void {
    this.endCallback = callback;
  }

  isSupported(): boolean {
    return this.webRecognition != null || this.azureRecognizer != null;
  }
}
