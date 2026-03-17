import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { SpeechToTextProvider } from './models';
import { normalizeText } from './utils/text.util';

@Injectable({ providedIn: 'root' })
export class SpeechRecognitionService implements SpeechToTextProvider {
  readonly isActive = signal(false);

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

  private fireStart(): void {
    this.isActive.set(true);
    this.startCallback?.();
  }

  private fireEnd(): void {
    this.isActive.set(false);
    this.endCallback?.();
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
    this.webRecognition.onstart = () => this.fireStart();
    this.webRecognition.onend = () => this.fireEnd();
    this.webRecognition.onresult = (event: SpeechRecognitionEvent) => {
      if (!this.resultCallback) return;
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      const isFinal = event.results[event.results.length - 1]?.isFinal ?? false;
      const normalized = normalizeText(transcript, true);
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
          this.resultCallback(normalizeText(text, true), false);
        }
      };
      recognizer.recognized = (_: unknown, e: { result: { text: string } }) => {
        const text = e.result?.text?.trim();
        if (text && this.resultCallback) {
          this.resultCallback(normalizeText(text, true), true);
        }
      };
      recognizer.sessionStarted = () => this.fireStart();
      recognizer.sessionStopped = () => this.fireEnd();
    } catch (err) {
      console.warn('Azure Speech no disponible, usando Web Speech.', err);
      this.initWebSpeech();
    }
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
      await new Promise<void>((resolve, reject) => {
        r.startContinuousRecognitionAsync(() => {
          this.fireStart();
          resolve();
        }, (e: unknown) => {
          console.error(e);
          reject(e);
        });
      });
    }
  }

  async stop(): Promise<void> {
    if (this.webRecognition) {
      try {
        this.webRecognition.stop();
      } catch {
        // no-op
      }
      this.fireEnd();
      return;
    }
    const r = this.azureRecognizer as { stopContinuousRecognitionAsync: (onSuccess?: () => void) => void } | null;
    if (r?.stopContinuousRecognitionAsync) {
      await new Promise<void>((resolve) => {
        r.stopContinuousRecognitionAsync(() => {
          this.fireEnd();
          resolve();
        });
      });
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
