import { Injectable } from '@angular/core';
import { SpeechRecognitionService } from './speech-recognition.service';
import { SpeechSynthesisService } from './speech-synthesis.service';
import { ConversationService } from './conversation.service';

const JARVIS_TRIGGER = 'jarvis';
const WELCOME_RESPONSE = 'Ingeniero, ¿cómo puedo servirte hoy?';
const MIN_QUESTION_LENGTH = 5;
const QUESTION_DEBOUNCE_MS = 1500;
const WELCOME_COOLDOWN_MS = 2500;

type ListeningState = 'waitingForWakeWord' | 'awaitingQuestion';

@Injectable({ providedIn: 'root' })
export class VoiceService {
  private isSpeaking = false;
  private listeningCallback: ((listening: boolean) => void) | null = null;
  private state: ListeningState = 'waitingForWakeWord';
  private lastFinalInQuestion = '';
  private questionDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastWelcomeAt = 0;

  constructor(
    private readonly recognition: SpeechRecognitionService,
    private readonly synthesis: SpeechSynthesisService,
    private readonly conversation: ConversationService
  ) {
    this.recognition.onResult((transcript, isFinal) => this.onTranscript(transcript, isFinal));
    this.recognition.onStart(() => this.listeningCallback?.(true));
    this.recognition.onEnd(() => this.listeningCallback?.(false));
  }

  onListeningChange(callback: (listening: boolean) => void): void {
    this.listeningCallback = callback;
  }

  private normalizeForMatch(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');
  }

  private includesJarvis(transcript: string): boolean {
    return this.normalizeForMatch(transcript).includes(JARVIS_TRIGGER);
  }

  private looksLikeWelcomeEcho(text: string): boolean {
    const n = this.normalizeForMatch(text);
    return (
      n.includes('ingeniero') ||
      (n.includes('servirte') && n.length < 50) ||
      (n.includes('como puedo ayud') && n.length < 60)
    );
  }

  private extractQuestion(transcript: string): string {
    const n = this.normalizeForMatch(transcript);
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

  private async processQuestion(question: string): Promise<void> {
    this.isSpeaking = true;
    this.recognition.stop();
    try {
      const responseText = await this.conversation.getResponse(question);
      await this.synthesis.speak(responseText);
      this.state = 'awaitingQuestion';
    } catch (err) {
      console.error('VoiceService', err);
      await this.synthesis.speak('Lo siento, no pude procesar. Intenta de nuevo.');
      this.state = 'awaitingQuestion';
    } finally {
      this.isSpeaking = false;
      this.recognition.start();
    }
  }

  private async onTranscript(transcript: string, isFinal: boolean): Promise<void> {
    if (this.isSpeaking) return;

    if (this.state === 'awaitingQuestion') {
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
      this.isSpeaking = true;
      this.recognition.stop();
      try {
        const responseText = await this.conversation.getResponse(question);
        await this.synthesis.speak(responseText);
      } catch (err) {
        console.error('VoiceService', err);
        await this.synthesis.speak('Lo siento, no pude procesar. Intenta de nuevo.');
      } finally {
        this.isSpeaking = false;
        this.recognition.start();
      }
      return;
    }

    await this.speakWelcomeAndAwaitQuestion();
  }

  /**
   * No hacemos stop/start: dejamos el micrófono abierto para no perder el inicio de la pregunta.
   * Pequeña pausa tras hablar para no captar eco de la propia voz como pregunta.
   */
  private async speakWelcomeAndAwaitQuestion(): Promise<void> {
    this.isSpeaking = true;
    try {
      await this.synthesis.speak(WELCOME_RESPONSE);
    } finally {
      this.isSpeaking = false;
      this.lastFinalInQuestion = '';
      this.lastWelcomeAt = Date.now();
      setTimeout(() => {
        this.state = 'awaitingQuestion';
      }, 400);
    }
  }

  startListening(): void {
    this.state = 'waitingForWakeWord';
    this.lastFinalInQuestion = '';
    this.clearQuestionDebounce();
    this.recognition.start();
  }

  stopListening(): void {
    this.clearQuestionDebounce();
    this.recognition.stop();
    this.state = 'waitingForWakeWord';
    this.lastFinalInQuestion = '';
    this.conversation.clearContext();
  }

  isRecognitionSupported(): boolean {
    return this.recognition.isSupported();
  }
}
