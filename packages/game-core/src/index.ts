export { ENGINE_VERSION } from './version.js';

export { Xoshiro128ss, type PrngState, type Seed } from './random/prng.js';
export {
  clamp,
  fp,
  fpDiv,
  fpMul,
  fpRound,
  fpToNumber,
  FP_ONE,
  FP_SCALE,
  ratio,
  roundDiv,
  type Fixed,
} from './math/fixed.js';
export { fnv1a32, hashHex } from './util/hash.js';

export {
  GameClock,
  ManualTimeSource,
  systemTimeSource,
  TimerQueue,
  type Clock,
  type GameClockOptions,
  type Timer,
  type TimeSource,
} from './clock/clock.js';

export { BattleInputError, DEFAULT_BATTLE_RULES, simulateBattle } from './battle/engine.js';
export type {
  BattleEndReason,
  BattleEvent,
  BattleInput,
  BattleResult,
  BattleRules,
  CombatantSnapshot,
  DamageKind,
} from './battle/types.js';
