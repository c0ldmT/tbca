import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import type { Attributes, ClassId, EquipSlot } from '@tbca/game-core';
import type { CharacterResponse, InventoryView, ItemView, LoadoutRequest } from '@tbca/shared';
import { CSRF_HEADER } from '@tbca/shared/constants';
import { firstValueFrom, type Observable } from 'rxjs';

import { toFailure } from './api-failure';
import { AuthService } from './auth.service';

export { ApiFailure } from './api-failure';

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

  async rename(name: string): Promise<CharacterResponse> {
    const res = await this.read(
      this.http.put<CharacterResponse>('/api/characters/me/name', { name }, this.csrf()),
    );
    this.state.set(res);
    return res;
  }

  inventory(): Promise<InventoryView> {
    return this.read(this.http.get<InventoryView>('/api/inventory'));
  }

  async equip(slot: EquipSlot, itemId: string): Promise<InventoryView> {
    const view = await this.read(
      this.http.put<InventoryView>(`/api/inventory/equipment/${slot}`, { itemId }, this.csrf()),
    );
    await this.refresh();
    return view;
  }

  async unequip(slot: EquipSlot): Promise<InventoryView> {
    const view = await this.read(
      this.http.delete<InventoryView>(`/api/inventory/equipment/${slot}`, this.csrf()),
    );
    await this.refresh();
    return view;
  }

  testLoot(): Promise<ItemView> {
    return this.read(this.http.post<ItemView>('/api/inventory/test-loot', null, this.csrf()));
  }

  private csrf() {
    return { headers: { [CSRF_HEADER]: this.auth.user()?.csrfToken ?? '' } };
  }

  private async read<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw toFailure(error);
    }
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
