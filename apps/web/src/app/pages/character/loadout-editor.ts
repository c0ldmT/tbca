import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  BASIC_ATTACK,
  STATUS_KINDS,
  type AbilityDef,
  type GameConfig,
  type StatusKind,
  type TacticCondition,
  type TacticRule,
  type TargetSelector,
} from '@tbca/game-core';
import type { CharacterResponse } from '@tbca/shared';

import { ApiFailure, CharacterService } from '../../core/character.service';
import { describeEffects } from './ability-summary';

type ConditionType = TacticCondition['type'];

const CONDITIONS: readonly ConditionType[] = [
  'always',
  'self_hp_below',
  'ally_hp_below',
  'energy_at_least',
  'target_has_status',
  'target_lacks_status',
  'round_at_least',
  'enemies_at_least',
];

const ENEMY_TARGETS: readonly TargetSelector[] = [
  'threat',
  'lowest_hp',
  'highest_hp',
  'healer',
  'random',
];
const ALLY_TARGETS: readonly TargetSelector[] = ['lowest_hp_ally', 'self'];

/** Standardparameter je Bedingung; Prozentwerte werden als Promille gespeichert. */
function defaultCondition(type: ConditionType): TacticCondition {
  switch (type) {
    case 'always':
      return { type };
    case 'self_hp_below':
    case 'ally_hp_below':
      return { type, permille: 500 };
    case 'energy_at_least':
      return { type, value: 50 };
    case 'target_has_status':
    case 'target_lacks_status':
      return { type, status: 'stun' };
    case 'round_at_least':
      return { type, round: 3 };
    case 'enemies_at_least':
      return { type, count: 2 };
  }
}

/** Aktive Fähigkeiten und Taktikregeln (Bedingung → Aktion → Ziel) der aktuellen Klasse. */
@Component({
  selector: 'tbca-loadout-editor',
  imports: [TranslocoDirective],
  templateUrl: './loadout-editor.html',
  styleUrl: './loadout-editor.css',
})
export class LoadoutEditor {
  private readonly characters = inject(CharacterService);

  readonly character = input.required<CharacterResponse>();
  readonly config = input.required<GameConfig>();

  protected readonly conditions = CONDITIONS;
  protected readonly statuses = STATUS_KINDS;
  protected readonly basicAttack = BASIC_ATTACK;
  protected readonly describe = describeEffects;

  protected readonly abilities = signal<string[]>([]);
  protected readonly tactics = signal<TacticRule[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  constructor() {
    effect(() => {
      const { loadout } = this.character();
      this.abilities.set([...loadout.abilities]);
      this.tactics.set(loadout.tactics.map((r) => ({ ...r })));
    });
  }

  protected readonly classAbilities = computed(() =>
    this.config().abilities.filter((a) => a.classId === this.character().classId),
  );
  protected readonly maxAbilities = computed(() => this.config().maxActiveAbilities);
  protected readonly maxRules = computed(() => this.config().maxTacticRules);
  protected readonly dirty = computed(() => {
    const { loadout } = this.character();
    return (
      JSON.stringify(loadout.abilities) !== JSON.stringify(this.abilities()) ||
      JSON.stringify(loadout.tactics) !== JSON.stringify(this.tactics())
    );
  });

  protected isLocked(a: AbilityDef): boolean {
    return a.unlockLevel > this.character().level;
  }

  protected toggleAbility(id: string): void {
    this.saved.set(false);
    if (this.abilities().includes(id)) {
      this.abilities.update((list) => list.filter((x) => x !== id));
      // Regeln mit dieser Fähigkeit entfallen, sonst wäre das Loadout ungültig.
      this.tactics.update((rules) => rules.filter((r) => r.use !== id));
    } else if (this.abilities().length < this.maxAbilities()) {
      this.abilities.update((list) => [...list, id]);
    }
  }

  protected abilityTarget(use: string): AbilityDef['target'] {
    return use === BASIC_ATTACK
      ? 'enemy'
      : (this.config().abilities.find((a) => a.id === use)?.target ?? 'enemy');
  }

  protected targetOptions(use: string): readonly TargetSelector[] {
    const target = this.abilityTarget(use);
    return target === 'enemy' ? ENEMY_TARGETS : target === 'ally' ? ALLY_TARGETS : [];
  }

  protected addRule(): void {
    const use = this.abilities()[0] ?? BASIC_ATTACK;
    this.updateRules((rules) => [...rules, { when: { type: 'always' }, use }]);
  }

  protected removeRule(index: number): void {
    this.updateRules((rules) => rules.filter((_, i) => i !== index));
  }

  protected moveRule(index: number, delta: -1 | 1): void {
    this.updateRules((rules) => {
      const next = [...rules];
      const [rule] = next.splice(index, 1);
      next.splice(index + delta, 0, rule!);
      return next;
    });
  }

  protected setConditionType(index: number, type: string): void {
    this.patchRule(index, { when: defaultCondition(type as ConditionType) });
  }

  /** Zahlenwert der Bedingung; HP-Schwellen werden in Prozent eingegeben. */
  protected conditionNumber(when: TacticCondition): number | null {
    switch (when.type) {
      case 'self_hp_below':
      case 'ally_hp_below':
        return when.permille / 10;
      case 'energy_at_least':
        return when.value;
      case 'round_at_least':
        return when.round;
      case 'enemies_at_least':
        return when.count;
      default:
        return null;
    }
  }

  protected setConditionNumber(index: number, raw: string): void {
    const value = Math.max(0, Math.round(Number(raw) || 0));
    const when = this.tactics()[index]!.when;
    switch (when.type) {
      case 'self_hp_below':
      case 'ally_hp_below':
        return this.patchRule(index, { when: { ...when, permille: Math.min(1000, value * 10) } });
      case 'energy_at_least':
        return this.patchRule(index, { when: { ...when, value: Math.min(1000, value) } });
      case 'round_at_least':
        return this.patchRule(index, { when: { ...when, round: Math.max(1, value) } });
      case 'enemies_at_least':
        return this.patchRule(index, { when: { ...when, count: Math.max(1, value) } });
      default:
        return;
    }
  }

  protected conditionStatus(when: TacticCondition): StatusKind | null {
    return when.type === 'target_has_status' || when.type === 'target_lacks_status'
      ? when.status
      : null;
  }

  protected setConditionStatus(index: number, status: string): void {
    const when = this.tactics()[index]!.when;
    if (when.type === 'target_has_status' || when.type === 'target_lacks_status') {
      this.patchRule(index, { when: { ...when, status: status as StatusKind } });
    }
  }

  protected setUse(index: number, use: string): void {
    const options = this.targetOptions(use);
    const current = this.tactics()[index]!.target;
    const rule: TacticRule = { when: this.tactics()[index]!.when, use };
    this.replaceRule(
      index,
      current && options.includes(current) ? { ...rule, target: current } : rule,
    );
  }

  protected setTarget(index: number, target: string): void {
    const { when, use } = this.tactics()[index]!;
    // Standardziel nicht speichern, damit Regeln kurz bleiben.
    const isDefault = target === '' || target === this.targetOptions(use)[0];
    this.replaceRule(
      index,
      isDefault ? { when, use } : { when, use, target: target as TargetSelector },
    );
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.characters.setLoadout({ abilities: this.abilities(), tactics: this.tactics() });
      this.saved.set(true);
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.busy.set(false);
    }
  }

  private patchRule(index: number, patch: Partial<TacticRule>): void {
    this.replaceRule(index, { ...this.tactics()[index]!, ...patch });
  }

  private replaceRule(index: number, rule: TacticRule): void {
    this.updateRules((rules) => rules.map((r, i) => (i === index ? rule : r)));
  }

  private updateRules(fn: (rules: TacticRule[]) => TacticRule[]): void {
    this.saved.set(false);
    this.tactics.update(fn);
  }
}
