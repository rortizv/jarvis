import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

const SYSTEM_PROMPT = `Eres Jarvis, un asistente de voz amable y conciso. Respondes en español.
Reglas:
- Responde en 1 a 4 frases cortas, pensadas para ser leídas en voz alta.
- No uses listas ni markdown. Lenguaje natural y directo.
- Si te dan contexto de Wikipedia o de búsqueda web (resultados recientes), úsalo para enriquecer la respuesta sin repetirlo todo.
- Si hay mensajes anteriores en la conversación, usa ese contexto: no repitas lo que ya dijiste y responde a preguntas de seguimiento (ej. "y cuántos?", "y dónde?") usando lo ya hablado.`;

interface AzureChatRequest {
  messages: { role: string; content: string }[];
  max_tokens: number;
  temperature: number;
}

interface AzureChatResponse {
  choices?: { message?: { content?: string } }[];
}

interface AzureErrorBody {
  error?: { code?: string };
}

const AZURE_OPENAI_API_VERSION = '2024-04-01-preview';

@Injectable({ providedIn: 'root' })
export class LlmService {
  private get chatCompletionsUrl(): string {
    const e = environment.azureOpenAI.endpoint?.replace(/\/$/, '');
    const d = environment.azureOpenAI.deployment;
    return `${e}/openai/deployments/${d}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`;
  }

  private get apiKey(): string {
    return environment.azureOpenAI.apiKey ?? '';
  }

  constructor(private readonly http: HttpClient) { }

  private static readonly MAX_HISTORY_MESSAGES = 20;

  async chat(
    userMessage: string,
    wikiContext: string | null = null,
    history: { role: 'user' | 'assistant'; content: string }[] = [],
    webContext: string | null = null
  ): Promise<string> {
    if (!this.apiKey || !environment.azureOpenAI.endpoint) {
      return 'No está configurado Azure OpenAI. Revisa environment (azureOpenAI.endpoint y apiKey).';
    }

    let content: string;
    if (webContext) {
      content = `Contexto de búsqueda web (resultados recientes). Responde basándote en este contexto; no inventes fechas, nombres ni resultados que no aparezcan aquí:\n${webContext}\n\nPregunta del usuario: ${userMessage}`;
    } else if (wikiContext) {
      content = `Contexto de Wikipedia:\n${wikiContext}\n\nPregunta del usuario: ${userMessage}`;
    } else {
      content = userMessage;
    }

    const historySlice = history.slice(-LlmService.MAX_HISTORY_MESSAGES);
    const messages: { role: string; content: string }[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...historySlice.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content },
    ];

    const body: AzureChatRequest = {
      messages,
      max_tokens: 300,
      temperature: 0.7,
    };

    try {
      const data = await firstValueFrom(
        this.http.post<AzureChatResponse>(this.chatCompletionsUrl, body, {
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.apiKey,
          },
        })
      );
      const text = data.choices?.[0]?.message?.content?.trim();
      return text ?? 'No pude generar una respuesta.';
    } catch (err) {
      const res = err as HttpErrorResponse;
      console.error('Azure OpenAI error', res.status, res.error);
      if (res.status === 404) {
        const bodyErr = res.error as AzureErrorBody | undefined;
        if (bodyErr?.error?.code === 'DeploymentNotFound') {
          return 'Error: el deployment de Azure OpenAI no existe. En environment.azureOpenAI.deployment usa el nombre exacto que ves en Azure Portal (Modelos > Implementaciones).';
        }
      }
      return 'Lo siento, no pude procesar tu pregunta. Intenta de nuevo.';
    }
  }
}
