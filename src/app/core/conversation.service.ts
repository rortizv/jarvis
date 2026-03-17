import { Injectable } from '@angular/core';
import { MediawikiService } from './mediawiki.service';
import { WebSearchService } from './web-search.service';
import { LlmService } from './llm.service';
import { needsWikipedia, needsRecentInfo, getSearchQuery } from './heuristic';

export type ConversationMessage = { role: 'user' | 'assistant'; content: string };

@Injectable({ providedIn: 'root' })
export class ConversationService {
  private history: ConversationMessage[] = [];

  constructor(
    private readonly mediawiki: MediawikiService,
    private readonly webSearch: WebSearchService,
    private readonly llm: LlmService
  ) {}

  /**
   * Responde usando historial y, si aplica, Wikipedia (conceptos) o búsqueda web (hechos recientes).
   */
  async getResponse(userQuestion: string): Promise<string> {
    const question = userQuestion.trim();
    if (!question) return 'No escuché tu pregunta.';

    let wikiContext: string | null = null;
    let webContext: string | null = null;

    if (needsRecentInfo(question)) {
      webContext = await this.webSearch.getContextForQuestion(question);
      if (!webContext) {
        console.warn('Jarvis: se intentó búsqueda web pero no hubo resultados. ¿SearXNG está en marcha? (docker compose up -d)');
        webContext = '[No se pudo obtener búsqueda web. Responde brevemente que no tienes información actualizada para esta pregunta y que puede buscar en internet.]';
      }
    } else if (needsWikipedia(question)) {
      const searchQuery = getSearchQuery(question);
      wikiContext = await this.mediawiki.searchAndGetFirstSummary(searchQuery);
    }

    const response = await this.llm.chat(question, wikiContext, this.history, webContext);
    this.history.push({ role: 'user', content: question });
    this.history.push({ role: 'assistant', content: response });
    return response;
  }

  /** Borra el contexto al apagar el micrófono. */
  clearContext(): void {
    this.history = [];
  }
}
