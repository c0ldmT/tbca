import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ChallengeRequest,
  ChallengeResponse,
  FightSummary,
  FightView,
  OpponentView,
  PvpStatus,
  TrainingRequest,
} from '@tbca/shared';
import { CSRF_HEADER } from '@tbca/shared/constants';
import { firstValueFrom, type Observable } from 'rxjs';

import { toFailure } from './api-failure';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class PvpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  status(): Promise<PvpStatus> {
    return this.read(this.http.get<PvpStatus>('/api/pvp/status'));
  }

  /** Die Tagesgegner – eine kleine, täglich neue Auswahl. */
  opponents(): Promise<OpponentView[]> {
    return this.read(this.http.get<OpponentView[]>('/api/pvp/opponents'));
  }

  challenge(req: ChallengeRequest): Promise<ChallengeResponse> {
    const headers = { [CSRF_HEADER]: this.auth.user()?.csrfToken ?? '' };
    return this.read(this.http.post<ChallengeResponse>('/api/pvp/challenges', req, { headers }));
  }

  training(req: TrainingRequest): Promise<ChallengeResponse> {
    const headers = { [CSRF_HEADER]: this.auth.user()?.csrfToken ?? '' };
    return this.read(this.http.post<ChallengeResponse>('/api/pvp/training', req, { headers }));
  }

  recent(): Promise<FightSummary[]> {
    return this.read(this.http.get<FightSummary[]>('/api/fights'));
  }

  fight(id: string): Promise<FightView> {
    return this.read(this.http.get<FightView>(`/api/fights/${encodeURIComponent(id)}`));
  }

  private async read<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw toFailure(error);
    }
  }
}
