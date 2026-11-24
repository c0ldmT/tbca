import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Operator {
  name: string;
  street: string;
  city: string;
  email: string;
}

/**
 * Betreiberangaben aus public/legal.json.
 *
 * - mode "public": öffentliche Instanz; Impressum und Datenschutzerklärung mit Betreiberangaben,
 *   fehlende Angaben werden sichtbar angemahnt.
 * - mode "private": Instanz nur für einen privaten Kreis; kein Impressum, kein Hinweis auf fehlende
 *   Angaben. Die Datenschutzerklärung bleibt als Information für die Mitspieler erhalten.
 */
@Injectable({ providedIn: 'root' })
export class LegalService {
  private readonly http = inject(HttpClient);
  private loading: Promise<void> | null = null;

  readonly mode = signal<'public' | 'private'>('public');
  readonly operator = signal<Operator | null>(null);
  readonly isPrivate = computed(() => this.mode() === 'private');
  /** Nur öffentliche Instanzen müssen Name und Kontakt angeben. */
  readonly missing = computed(() => {
    const o = this.operator();
    return !this.isPrivate() && (!o || !o.name || !o.email);
  });

  load(): Promise<void> {
    this.loading ??= firstValueFrom(
      this.http.get<{ mode?: string; operator?: Operator }>('/legal.json'),
    )
      .then((data) => {
        this.mode.set(data.mode === 'private' ? 'private' : 'public');
        this.operator.set(data.operator ?? null);
      })
      .catch(() => undefined);
    return this.loading;
  }
}
