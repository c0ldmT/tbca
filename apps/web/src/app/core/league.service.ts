import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ChallengeResponse,
  LeaderboardEntry,
  LeagueDivisionView,
  LeagueView,
  TeamLeaderboardEntry,
  TeamLeagueView,
} from '@tbca/shared';
import { CSRF_HEADER } from '@tbca/shared/constants';
import { firstValueFrom, type Observable } from 'rxjs';

import { toFailure } from './api-failure';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class LeagueService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  view(): Promise<LeagueView> {
    return this.read(this.http.get<LeagueView>('/api/league'));
  }

  division(index: number): Promise<LeagueDivisionView> {
    return this.read(this.http.get<LeagueDivisionView>(`/api/league/divisions/${index}`));
  }

  join(joined: boolean): Promise<LeagueView> {
    return this.write<LeagueView>(joined ? '/api/league/join' : '/api/league/leave');
  }

  placement(): Promise<ChallengeResponse> {
    return this.write<ChallengeResponse>('/api/league/placement');
  }

  leaderboard(scope: 'global' | 'community', limit = 20): Promise<LeaderboardEntry[]> {
    return this.read(
      this.http.get<LeaderboardEntry[]>('/api/league/leaderboard', {
        params: { scope, limit },
      }),
    );
  }

  teamView(teamId: string, size: 2 | 3): Promise<TeamLeagueView> {
    return this.read(
      this.http.get<TeamLeagueView>(`/api/teams/${encodeURIComponent(teamId)}/league`, {
        params: { size },
      }),
    );
  }

  teamJoin(teamId: string, size: 2 | 3, joined: boolean): Promise<TeamLeagueView> {
    return this.write<TeamLeagueView>(`/api/teams/${encodeURIComponent(teamId)}/league`, {
      size,
      joined,
    });
  }

  teamLeaderboard(size: 2 | 3, limit = 20): Promise<TeamLeaderboardEntry[]> {
    return this.read(
      this.http.get<TeamLeaderboardEntry[]>('/api/league/teams/leaderboard', {
        params: { size, limit },
      }),
    );
  }

  private write<T>(url: string, body: unknown = null): Promise<T> {
    const headers = { [CSRF_HEADER]: this.auth.user()?.csrfToken ?? '' };
    return this.read(this.http.post<T>(url, body, { headers }));
  }

  private async read<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw toFailure(error);
    }
  }
}
