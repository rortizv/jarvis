import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, map, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import type { WikiSearchPage, WikiSearchResponse, WikiExtractResponse } from './models';

const LANG = environment.wikipediaLang || 'es';

@Injectable({ providedIn: 'root' })
export class MediawikiService {
  constructor(private readonly http: HttpClient) {}

  private searchUrl(query: string, limit = 5): string {
    const base = `https://${LANG}.wikipedia.org/w/rest.php/v1/search/page`;
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return `${base}?${params}`;
  }

  private extractUrl(title: string): string {
    const base = `https://${LANG}.wikipedia.org/w/api.php`;
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      prop: 'extracts',
      exintro: 'true',
      explaintext: 'true',
      exsentences: '5',
      exchars: '800',
      titles: title,
    });
    return `${base}?${params}`;
  }

  /** Busca páginas en Wikipedia. */
  async search(query: string): Promise<WikiSearchPage[]> {
    if (!query?.trim()) return [];
    const url = this.searchUrl(query.trim());
    const data = await firstValueFrom(
      this.http.get<WikiSearchResponse>(url).pipe(
        catchError(() => of({ pages: [] })),
        map((r) => r.pages ?? [])
      )
    );
    return data;
  }

  /** Obtiene el extracto en texto plano de una página. */
  async getSummary(title: string): Promise<string | null> {
    if (!title?.trim()) return null;
    const url = this.extractUrl(title.trim());
    const data = await firstValueFrom(
      this.http.get<WikiExtractResponse>(url).pipe(catchError(() => of({ query: { pages: {} } })))
    );
    const pages = data.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0] as { extract?: string } | undefined;
    return page?.extract?.trim() ?? null;
  }

  /** Busca y devuelve el resumen del primer resultado (para el LLM). */
  async searchAndGetFirstSummary(query: string): Promise<string | null> {
    const pages = await this.search(query);
    if (pages.length === 0) return null;
    const first = pages[0];
    const title = first.title ?? first.key ?? '';
    return this.getSummary(title);
  }
}
