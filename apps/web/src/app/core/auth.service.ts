import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { MeResponse } from '@tbca/shared';
import { CSRF_HEADER } from '@tbca/shared/constants';
import { firstValueFrom } from 'rxjs';

/** undefined = wird geladen, null = nicht angemeldet. */
export type AuthState = MeResponse | null | undefined;

export const LOGIN_URL = '/api/auth/discord';

/**
 * Anmeldestatus. Die Session steckt im httpOnly-Cookie; im Browser liegt kein Token.
 * Für schreibende Anfragen wird das CSRF-Token aus /api/auth/me mitgeschickt.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly state = signal<AuthState>(undefined);
  readonly user = computed(() => this.state() ?? null);
  readonly displayName = computed(() => this.user()?.identities[0]?.displayName ?? null);

  async refresh(): Promise<void> {
    try {
      this.state.set(await firstValueFrom(this.http.get<MeResponse>('/api/auth/me')));
    } catch (error) {
      // 401 = nicht angemeldet. Andere Fehler (API nicht erreichbar) zeigen ebenfalls den
      // Login-Knopf, statt die Seite zu blockieren.
      if (!(error instanceof HttpErrorResponse && error.status === 401)) {
        console.warn('Anmeldestatus konnte nicht geladen werden', error);
      }
      this.state.set(null);
    }
  }

  /** Angebotene Anmeldewege; null, solange unbekannt oder die API nicht antwortet. */
  readonly options = signal<{ discord: boolean; devLogin: boolean } | null>(null);

  async loadOptions(): Promise<void> {
    try {
      this.options.set(
        await firstValueFrom(
          this.http.get<{ discord: boolean; devLogin: boolean }>('/api/auth/options'),
        ),
      );
    } catch {
      this.options.set(null);
    }
  }

  /** Test-Anmeldung ohne Discord (nur wenn die API DEV_LOGIN anbietet). */
  async devLogin(name: string): Promise<void> {
    await firstValueFrom(this.http.post<void>('/api/auth/dev-login', { name }));
    await this.refresh();
  }

  /** Vollständige Navigation, da der Login über Discord und zurück läuft. */
  loginUrl(): string {
    return LOGIN_URL;
  }

  async logout(): Promise<void> {
    const csrfToken = this.user()?.csrfToken;
    if (!csrfToken) return;
    await firstValueFrom(
      this.http.post<void>('/api/auth/logout', null, { headers: { [CSRF_HEADER]: csrfToken } }),
    );
    this.state.set(null);
  }
}
