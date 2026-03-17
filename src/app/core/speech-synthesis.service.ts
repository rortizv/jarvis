import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { TextToSpeechProvider } from './models';

@Injectable({ providedIn: 'root' })
export class SpeechSynthesisService implements TextToSpeechProvider {
  private synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  private cachedVoice: SpeechSynthesisVoice | null = null;
  private azureSynthesizer: unknown = null;
  private azureReady: Promise<void> | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    if (environment.azure?.apiKey && environment.azure?.region) {
      this.azureReady = this.initAzure();
    } else if (this.synth) {
      const pick = () => {
        this.cachedVoice = this.selectSpanishVoiceFrom(this.synth!.getVoices());
      };
      pick();
      this.synth.onvoiceschanged = pick;
    }
  }

  private async initAzure(): Promise<void> {
    try {
      const { loadAzureSpeechSdk } = await import('./azure-speech-loader');
      const sdk = (await loadAzureSpeechSdk()) as {
        SpeechConfig: { fromSubscription: (key: string, region: string) => unknown };
        AudioConfig: { fromDefaultSpeakerOutput: () => unknown };
        SpeechSynthesizer: new (config: unknown, audio: unknown) => unknown;
      };
      const speechConfig = sdk.SpeechConfig.fromSubscription(
        environment.azure.apiKey,
        environment.azure.region
      );
      const voiceName = environment.azure?.speechVoiceName ?? 'es-CO-GonzaloNeural';
      const lang = voiceName.slice(0, 5);
      (speechConfig as { speechSynthesisLanguage: string }).speechSynthesisLanguage = lang;
      (speechConfig as { speechSynthesisVoiceName: string }).speechSynthesisVoiceName = voiceName;
      const audioConfig = sdk.AudioConfig.fromDefaultSpeakerOutput();
      this.azureSynthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);
    } catch (err) {
      this.azureSynthesizer = null;
      if (this.synth) {
        const pick = () => {
          this.cachedVoice = this.selectSpanishVoiceFrom(this.synth!.getVoices());
        };
        pick();
        this.synth.onvoiceschanged = pick;
      }
    }
  }

  async speak(text: string): Promise<void> {
    if (this.azureReady) await this.azureReady;
    const azure = this.azureSynthesizer as {
      speakTextAsync: (text: string) => Promise<{ reason: number }>;
    } | null;
    if (azure?.speakTextAsync) {
      await azure.speakTextAsync(text);
      return;
    }
    if (!this.synth) return;
    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-CO';
    utterance.rate = 0.95;
    const voice = this.cachedVoice ?? this.selectSpanishVoiceFrom(this.synth.getVoices());
    if (voice) utterance.voice = voice;
    return new Promise((resolve, reject) => {
      utterance.onend = () => resolve();
      utterance.onerror = (e) => reject(e);
      this.synth!.speak(utterance);
    });
  }

  private selectSpanishVoiceFrom(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    const esVoices = voices.filter(
      (v) => v.lang.startsWith('es') || v.lang === 'es-CO' || v.lang === 'es-ES'
    );
    if (esVoices.length === 0) return null;
    const preferred = esVoices.find(
      (v) => v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('diego')
    );
    return preferred ?? esVoices[0];
  }
}
