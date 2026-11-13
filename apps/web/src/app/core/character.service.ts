import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import type { Attributes, ClassId } from '@tbca/game-core';
import type { CharacterResponse, LoadoutRequest } from '@tbca/shared';
import { CSRF_HEADER } from '@tbca/shared/constants';
import { firstValueFrom, type Observable } from 'rxjs';

import { AuthService } from './auth.service';

/** Fehlercode der API (z. B. name_taken), für die Übersetzung unter errors.<code>. */
export class ApiFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** undefined = wird geladen, null = noch kein Charakter in dieser Season. */
export type CharacterState = CharacterResponse | null | undefined;

@Injectable({ providedIn: 'root' })
export class CharacterService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly state = signal<CharacterState>(undefined);

  async refresh(): Promise<void> {
    try {
      this.state.set(await firstValueFrom(this.http.get<CharacterResponse>('/api/characters/me')));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.state.set(null);
        return;
      }
      throw toFailure(error);
    }
  }

  async nameAvailable(name: string): Promise<{ available: boolean; problem: string | null }> {
    return firstValueFrom(
      this.http.get<{ available: boolean; problem: string | null }>(
        '/api/characters/name-available',
        {
          params: { name },
        },
      ),
    );
  }

  create(name: string, classId: ClassId) {
    return this.write((h) =>
      this.http.post<CharacterResponse>('/api/characters', { name, classId }, h),
    );
  }

  setAttributes(allocated: Attributes) {
    return this.write((h) =>
      this.http.put<CharacterResponse>('/api/characters/me/attributes', allocated, h),
    );
  }

  respec() {
    return this.write((h) =>
      this.http.post<CharacterResponse>('/api/characters/me/respec', null, h),
    );
  }

  switchClass(classId: ClassId) {
    return this.write((h) =>
      this.http.put<CharacterResponse>('/api/characters/me/class', { classId }, h),
    );
  }

  setLoadout(loadout: LoadoutRequest) {
    return this.write((h) =>
      this.http.put<CharacterResponse>('/api/characters/me/loadout', loadout, h),
    );
  }

  /** Schreibende Anfrage mit CSRF-Token; aktualisiert bei Erfolg den Zustand. */
  private async write(
    request: (options: { headers: Record<string, string> }) => Observable<CharacterResponse>,
  ): Promise<CharacterResponse> {
    const csrf = this.auth.user()?.csrfToken ?? '';
    try {
      const result = await firstValueFrom(request({ headers: { [CSRF_HEADER]: csrf } }));
      this.state.set(result);
      return result;
    } catch (error) {
      throw toFailure(error);
    }
  }
}

function toFailure(error: unknown): ApiFailure {
  if (error instanceof HttpErrorResponse) {
    const code = (error.error as { code?: unknown } | null)?.code;
    return new ApiFailure(typeof code === 'string' ? code : `http_${error.status}`);
  }
  return new ApiFailure('unknown');
}
