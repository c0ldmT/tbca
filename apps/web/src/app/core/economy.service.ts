import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ItemStat } from '@tbca/game-core';
import type { CraftingResult, ShopView } from '@tbca/shared';
import { CSRF_HEADER } from '@tbca/shared/constants';
import { firstValueFrom, type Observable } from 'rxjs';

import { toFailure } from './api-failure';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class EconomyService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  salvage(itemId: string) {
    return this.post<CraftingResult>('/api/crafting/salvage', { itemId });
  }

  upgrade(itemId: string) {
    return this.post<CraftingResult>('/api/crafting/upgrade', { itemId });
  }

  reroll(itemId: string, stat: ItemStat) {
    return this.post<CraftingResult>('/api/crafting/reroll', { itemId, stat });
  }

  transfer(targetId: string, donorId: string, stat: ItemStat) {
    return this.post<CraftingResult>('/api/crafting/transfer', { targetId, donorId, stat });
  }

  shop(): Promise<ShopView> {
    return this.read(this.http.get<ShopView>('/api/shop'));
  }

  buy(offerId: string) {
    return this.post<ShopView>('/api/shop/buy', { offerId });
  }

  sell(itemId: string) {
    return this.post<ShopView>('/api/shop/sell', { itemId });
  }

  private post<T>(url: string, body: unknown): Promise<T> {
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
