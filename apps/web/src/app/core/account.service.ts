import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CommunityMemberView } from '@tbca/shared';
import { CSRF_HEADER } from '@tbca/shared/constants';
import { firstValueFrom, type Observable } from 'rxjs';

import { toFailure } from './api-failure';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /** Datenexport als Datei herunterladen. */
  async downloadExport(): Promise<void> {
    const blob = await this.read(this.http.get('/api/account/export', { responseType: 'blob' }));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tbca-daten.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  setLocale(locale: 'de' | 'en' | null) {
    return this.write<void>('PUT', '/api/account/settings', { locale });
  }

  async delete(confirmation: string): Promise<void> {
    await this.write<void>('POST', '/api/account/delete', { confirmation });
    await this.auth.refresh();
  }

  members(communityId: string) {
    return this.read(
      this.http.get<CommunityMemberView[]>(`/api/communities/${communityId}/members`),
    );
  }

  setRole(communityId: string, accountId: string, role: string) {
    return this.write<CommunityMemberView[]>(
      'PUT',
      `/api/communities/${communityId}/members/${accountId}/role`,
      { role },
    );
  }

  correctXp(communityId: string, accountId: string, amount: number, reason: string) {
    return this.write<CommunityMemberView[]>(
      'POST',
      `/api/communities/${communityId}/members/${accountId}/xp`,
      {
        amount,
        reason,
      },
    );
  }

  private write<T>(method: 'POST' | 'PUT', url: string, body: unknown): Promise<T> {
    const headers = { [CSRF_HEADER]: this.auth.user()?.csrfToken ?? '' };
    return this.read(this.http.request<T>(method, url, { body, headers }));
  }

  private async read<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw toFailure(error);
    }
  }
}
