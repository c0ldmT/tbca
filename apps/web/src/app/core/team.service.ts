import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { TargetSelector } from '@tbca/game-core';
import type {
  CommunityView,
  TeamChallengeResponse,
  TeamOpponentView,
  TeamView,
} from '@tbca/shared';
import { CSRF_HEADER } from '@tbca/shared/constants';
import { firstValueFrom, type Observable } from 'rxjs';

import { toFailure } from './api-failure';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class TeamService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  communities() {
    return this.read(this.http.get<CommunityView[]>('/api/communities'));
  }
  joinCommunity(id: string) {
    return this.write<CommunityView[]>('POST', `/api/communities/${id}/join`, null);
  }
  mine() {
    return this.read(this.http.get<TeamView[]>('/api/teams/mine'));
  }
  /** Gegnerische Tages-Teams; nur diese lassen sich auf der Website herausfordern. */
  opponents(id: string) {
    return this.read(this.http.get<TeamOpponentView[]>(`/api/teams/${id}/opponents`));
  }
  create(body: { communityId: string; name: string; tag: string; logo: string }) {
    return this.write<TeamView[]>('POST', '/api/teams', body);
  }
  join(code: string) {
    return this.write<TeamView[]>('POST', '/api/teams/join', { code });
  }
  leave(id: string) {
    return this.write<TeamView[]>('POST', `/api/teams/${id}/leave`, null);
  }
  kick(id: string, accountId: string) {
    return this.write<TeamView[]>('POST', `/api/teams/${id}/kick`, { accountId });
  }
  settings(id: string, body: { focus: TargetSelector; lineup2: string[]; lineup3: string[] }) {
    return this.write<TeamView[]>('PUT', `/api/teams/${id}/settings`, body);
  }
  challenge(
    id: string,
    body: { opponentTeamId: string; size: 2 | 3; lineup: string[]; mode: 'rated' | 'friendly' },
  ) {
    return this.write<TeamChallengeResponse>('POST', `/api/teams/${id}/challenge`, body);
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
