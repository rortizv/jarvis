import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

const MAX_SNIPPETS = 6;

/** Bing */
const BING_SEARCH_URL = 'https://api.bing.microsoft.com/v7.0/search';

interface BingWebPage {
  name?: string;
  snippet?: string;
}

interface BingSearchResponse {
  webPages?: { value?: BingWebPage[] };
}

/** SearXNG (open source, sin API key). Respuesta típica: { results: [ { title, content, url } ] } */
interface SearXNGResult {
  title?: string;
  content?: string;
  url?: string;
}

interface SearXNGResponse {
  results?: SearXNGResult[];
}

@Injectable({ providedIn: 'root' })
export class WebSearchService {
  constructor(private readonly http: HttpClient) {}

  private get bingSearchKey(): string {
    return 'bingSearchKey' in environment ? String(environment.bingSearchKey ?? '') : '';
  }

  private get searxngBaseUrl(): string {
    const url = 'searxngBaseUrl' in environment ? String(environment.searxngBaseUrl ?? '').replace(/\/$/, '') : '';
    return url;
  }

  /**
   * Busca en la web y devuelve fragmentos para el LLM.
   * Prioridad: 1) SearXNG (si baseUrl configurado), 2) Bing (si apiKey). Si ninguno, null.
   */
  async getContextForQuestion(question: string): Promise<string | null> {
    const query = (question ?? '').trim().replace(/\?+$/g, '');
    if (!query) return null;

    if (this.searxngBaseUrl) {
      const ctx = await this.searchWithSearXNG(query);
      if (ctx) return ctx;
    }
    if (this.bingSearchKey) {
      const ctx = await this.searchWithBing(query);
      if (ctx) return ctx;
    }
    return null;
  }

  private async searchWithSearXNG(query: string): Promise<string | null> {
    try {
      const url = `${this.searxngBaseUrl}/search?q=${encodeURIComponent(query)}&format=json`;
      const res = await firstValueFrom(
        this.http.get<SearXNGResponse>(url, { responseType: 'json' })
      );
      const results = res.results ?? [];
      const parts = results
        .filter((r) => (r.title ?? r.content)?.trim())
        .slice(0, MAX_SNIPPETS)
        .map((r) => (r.title && r.content ? `[${r.title}] ${r.content}` : (r.content || r.title || '').trim()));
      return parts.length > 0 ? parts.join('\n\n').trim() : null;
    } catch (err) {
      const e = err as HttpErrorResponse;
      console.warn('SearXNG búsqueda falló:', e?.status ?? e?.message ?? err, e?.error ? '(revisa que JSON esté habilitado en searxng/config/settings.yml)' : '');
      return null;
    }
  }

  private async searchWithBing(query: string): Promise<string | null> {
    try {
      const url = `${BING_SEARCH_URL}?q=${encodeURIComponent(query)}&count=${MAX_SNIPPETS}&mkt=es-CO`;
      const res = await firstValueFrom(
        this.http.get<BingSearchResponse>(url, {
          headers: { 'Ocp-Apim-Subscription-Key': this.bingSearchKey },
        })
      );
      const pages = res.webPages?.value ?? [];
      const parts = pages
        .filter((p) => p.snippet?.trim())
        .slice(0, MAX_SNIPPETS)
        .map((p) => (p.name ? `[${p.name}] ${p.snippet}` : p.snippet));
      return parts.length > 0 ? parts.join('\n\n').trim() : null;
    } catch {
      return null;
    }
  }
}
