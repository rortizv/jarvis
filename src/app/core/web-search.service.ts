import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import type { SearXNGResponse } from './models';

const MAX_SNIPPETS = 6;

@Injectable({ providedIn: 'root' })
export class WebSearchService {
  constructor(private readonly http: HttpClient) {}

  private get searxngBaseUrl(): string {
    const url = 'searxngBaseUrl' in environment ? String(environment.searxngBaseUrl ?? '').replace(/\/$/, '') : '';
    return url;
  }

  /**
   * Busca en la web (SearXNG) y devuelve fragmentos para el LLM. Si no hay searxngBaseUrl, devuelve null.
   */
  async getContextForQuestion(question: string): Promise<string | null> {
    const query = (question ?? '').trim().replace(/\?+$/g, '');
    if (!query || !this.searxngBaseUrl) return null;
    return this.searchWithSearXNG(query);
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
}
