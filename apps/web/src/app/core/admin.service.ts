import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { AdminAccountView, AdminAuditView, AdminTimeView } from '@tbca/shared';
import { CSRF_HEADER } from '@tbca/shared/constants';
import { firstValueFrom, type Observable } from 'rxjs';

import { toFailure } from './api-failure';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  time() {
    return this.read(this.http.get<AdminTimeView>('/api/admin/time'));
  }
  setTime(body: { factor?: number; advanceMs?: number }) {
    return this.write<AdminTimeView>('PUT', '/api/admin/time', body);
  }
  accounts(q: string) {
    return this.read(this.http.get<AdminAccountView[]>('/api/admin/accounts', { params: { q } }));
  }
  ban(id: string, reason: string | null) {
    return this.write<void>('POST', `/api/admin/accounts/${id}/ban`, { reason });
  }
  xp(id: string, amount: number, reason: string) {
    return this.write<{ xp: number; level: number }>('POST', `/api/admin/accounts/${id}/xp`, {
      amount,
      reason,
    });
  }
  credits(id: string, amount: number, reason: string) {
    return this.write<void>('POST', `/api/admin/accounts/${id}/credits`, { amount, reason });
  }
  audit() {
    return this.read(this.http.get<AdminAuditView[]>('/api/admin/audit'));
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
