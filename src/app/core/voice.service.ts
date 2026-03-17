import { Injectable, signal, computed } from '@angular/core';
import { SpeechRecognitionService } from './speech-recognition.service';
import { SpeechSynthesisService } from './speech-synthesis.service';
import { ConversationService } from './conversation.service';
import { normalizeText } from './utils/text.util';
import { delay } from './utils/async.util';

const JARVIS_TRIGGER = 'jarvis';
const MIN_QUESTION_LENGTH = 5;
const QUESTION_DEBOUNCE_MS = 1500;
const WELCOME_COOLDOWN_MS = 2500;
const WELCOME_TO_QUESTION_DELAY_MS = 400;
/** Duración aproximada de reproducción (ms por carácter) para mantener "Hablando" visible; Azure resuelve speakTextAsync al acabar la síntesis, no la reproducción. */
const MS_PER_CHAR_SPEECH = 70;
const MIN_SPEAKING_MS = 1500;
const MAX_SPEAKING_MS = 35000;

export type ListeningState = 'waitingForWakeWord' | 'awaitingQuestion';

@Injectable({ providedIn: 'root' })
export class VoiceService {
  readonly isSpeaking = signal(false);
  private readonly stateSignal = signal<ListeningState>('waitingForWakeWord');
  readonly listeningState = this.stateSignal.asReadonly();
  readonly isAwaitingQuestion = computed(() => this.stateSignal() === 'awaitingQuestion');

  private listeningCallback: ((listening: boolean) => void) | null = null;
  private lastFinalInQuestion = '';
  private questionDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastWelcomeAt = 0;

  constructor(
    private readonly recognition: SpeechRecognitionService,
    private readonly synthesis: SpeechSynthesisService,
    private readonly conversation: ConversationService
  ) {
    this.recognition.onResult((transcript, isFinal) => void this.onTranscript(transcript, isFinal));
    this.recognition.onStart(() => this.listeningCallback?.(true));
    this.recognition.onEnd(() => this.listeningCallback?.(false));
  }

  onListeningChange(callback: (listening: boolean) => void): void {
    this.listeningCallback = callback;
  }

  private includesJarvis(transcript: string): boolean {
    return normalizeText(transcript).includes(JARVIS_TRIGGER);
  }

  private looksLikeWelcomeEcho(text: string): boolean {
    const n = normalizeText(text);
    return (
      n.includes('ingeniero') ||
      (n.includes('servirte') && n.length < 50) ||
      (n.includes('como puedo ayud') && n.length < 60)
    );
  }

  private extractQuestion(transcript: string): string {
    const n = normalizeText(transcript);
    const withoutTrigger = n
      .replace(new RegExp(`\\b${JARVIS_TRIGGER}\\b`, 'gi'), '')
      .replace(/^\s*(hola\s+)?/, '')
      .trim();
    return withoutTrigger;
  }

  private clearQuestionDebounce(): void {
    if (this.questionDebounceTimer != null) {
      clearTimeout(this.questionDebounceTimer);
      this.questionDebounceTimer = null;
    }
  }

  private sendQuestionAndRespond(question: string): void {
    this.clearQuestionDebounce();
    this.lastFinalInQuestion = '';
    const q = question.trim();
    if (q.length < 2) return;
    if (this.looksLikeWelcomeEcho(q)) return;
    this.processQuestion(q);
  }

  /**
   * Reproduce el texto y mantiene isSpeaking=true hasta que termine la reproducción estimada.
   * Azure speakTextAsync resuelve al acabar la síntesis, no la reproducción, por eso prolongamos el estado.
   */
  private async speakAndHoldState(text: string): Promise<void> {
    const estimatedMs = Math.min(MAX_SPEAKING_MS, Math.max(MIN_SPEAKING_MS, text.length * MS_PER_CHAR_SPEECH));
    this.isSpeaking.set(true);
    const start = Date.now();
    try {
      await this.synthesis.speak(text);
    } finally {
      const elapsed = Date.now() - start;
      if (elapsed < estimatedMs) {
        await delay(estimatedMs - elapsed);
      }
      this.isSpeaking.set(false);
    }
  }

  private async processQuestion(question: string): Promise<void> {
    await this.recognition.stop();
    try {
      const responseText = await this.conversation.getResponse(question);
      this.stateSignal.set('awaitingQuestion');
      await this.speakAndHoldState(responseText);
    } catch (err) {
      console.error('VoiceService', err);
      await this.speakAndHoldState('Lo siento, no pude procesar. Intenta de nuevo.');
      this.stateSignal.set('awaitingQuestion');
    } finally {
      await this.recognition.start();
    }
  }

  private async onTranscript(transcript: string, isFinal: boolean): Promise<void> {
    if (this.isSpeaking()) return;

    if (this.stateSignal() === 'awaitingQuestion') {
      const t = transcript.trim();
      if (t.length === 0) return;
      if (Date.now() - this.lastWelcomeAt < WELCOME_COOLDOWN_MS) return;
      if (this.looksLikeWelcomeEcho(t)) return;

      if (isFinal) {
        this.lastFinalInQuestion = t;
        if (t.length >= MIN_QUESTION_LENGTH) {
          this.sendQuestionAndRespond(t);
          return;
        }
        this.clearQuestionDebounce();
        this.questionDebounceTimer = setTimeout(() => {
          const toSend = this.lastFinalInQuestion || t;
          this.sendQuestionAndRespond(toSend);
        }, QUESTION_DEBOUNCE_MS);
      } else {
        this.clearQuestionDebounce();
        this.questionDebounceTimer = setTimeout(() => {
          this.sendQuestionAndRespond(this.lastFinalInQuestion || t);
        }, QUESTION_DEBOUNCE_MS);
      }
      return;
    }

    if (!this.includesJarvis(transcript)) return;

    const question = this.extractQuestion(transcript);
    if (question.trim()) {
      await this.recognition.stop();
      try {
        const responseText = await this.conversation.getResponse(question);
        await this.speakAndHoldState(responseText);
      } catch (err) {
        console.error('VoiceService', err);
        await this.speakAndHoldState('Lo siento, no pude procesar. Intenta de nuevo.');
      } finally {
        await this.recognition.start();
      }
      return;
    }

    await this.speakWelcomeAndAwaitQuestion();
  }

  /**
   * Saludo natural desde el LLM; no hacemos stop/start para no perder el inicio de la pregunta.
   */
  private async speakWelcomeAndAwaitQuestion(): Promise<void> {
    try {
      const greeting = await this.conversation.getGreeting();
      await this.speakAndHoldState(greeting);
    } catch (err) {
      console.error('VoiceService greeting', err);
      await this.speakAndHoldState('¿En qué puedo ayudarte?');
    }
    this.lastFinalInQuestion = '';
    this.lastWelcomeAt = Date.now();
    await delay(WELCOME_TO_QUESTION_DELAY_MS);
    this.stateSignal.set('awaitingQuestion');
  }

  async startListening(): Promise<void> {
    this.stateSignal.set('waitingForWakeWord');
    this.lastFinalInQuestion = '';
    this.clearQuestionDebounce();
    await this.recognition.start();
  }

  async stopListening(): Promise<void> {
    this.clearQuestionDebounce();
    await this.recognition.stop();
    this.stateSignal.set('waitingForWakeWord');
    this.lastFinalInQuestion = '';
    this.conversation.clearContext();
  }

  isRecognitionSupported(): boolean {
    return this.recognition.isSupported();
  }
}
