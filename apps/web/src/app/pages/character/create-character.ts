import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { CLASS_IDS, type ClassId, type GameConfig } from '@tbca/game-core';
import { checkName } from '@tbca/shared/names';

import { ApiFailure, CharacterService } from '../../core/character.service';

/** Name und Startklasse wählen; die Klasse lässt sich später jederzeit wechseln. */
@Component({
  selector: 'tbca-create-character',
  imports: [TranslocoDirective],
  template: `
    <form class="tbca-panel" *transloco="let t" (submit)="$event.preventDefault(); submit()">
      <h2>{{ t('character.create.title') }}</h2>
      <p class="tbca-hint">{{ t('character.create.intro') }}</p>

      <label class="tbca-label">
        {{ t('character.create.name') }}
        <input
          class="tbca-input"
          name="name"
          autocomplete="off"
          maxlength="20"
          [value]="name()"
          (input)="setName($any($event.target).value)"
          [attr.aria-invalid]="problem() !== null"
          aria-describedby="name-hint"
        />
      </label>
      <p id="name-hint" [class]="problem() ? 'tbca-error' : 'tbca-hint'" aria-live="polite">
        {{ problem() ? t('errors.name_' + problem()) : t('character.create.nameRules') }}
      </p>

      <fieldset class="classes">
        <legend class="tbca-label">{{ t('character.create.class') }}</legend>
        @for (id of classIds; track id) {
          <label class="class" [class.class--active]="classId() === id">
            <input
              type="radio"
              name="class"
              [value]="id"
              [checked]="classId() === id"
              (change)="classId.set(id)"
            />
            <span class="class__name">{{ t('classes.' + id) }}</span>
            <span class="tbca-hint">{{ t('classRole.' + config().classes[id].role) }}</span>
            <span class="class__text">{{ t('classInfo.' + id) }}</span>
          </label>
        }
      </fieldset>

      @if (error()) {
        <p class="tbca-error" role="alert">{{ t('errors.' + error()) }}</p>
      }
      <button class="tbca-button" type="submit" [disabled]="busy() || problem() !== null">
        {{ t('character.create.submit') }}
      </button>
    </form>
  `,
  styles: `
    .classes {
      display: grid;
      gap: var(--tbca-space-3);
      grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
      border: 0;
      margin: 0;
      padding: 0;
    }
    legend {
      margin-bottom: var(--tbca-space-2);
    }
    .class {
      display: grid;
      gap: var(--tbca-space-1);
      padding: var(--tbca-space-4);
      border: 1px solid var(--tbca-line);
      background: var(--tbca-surface-2);
      cursor: pointer;
    }
    .class--active {
      border-color: var(--tbca-neon-cyan);
    }
    .class:focus-within {
      outline: 2px solid var(--tbca-neon-cyan);
      outline-offset: 2px;
    }
    .class input {
      position: absolute;
      opacity: 0;
    }
    .class__name {
      font: 700 var(--tbca-text-lg) / 1.2 var(--tbca-font-display);
    }
    .class__text {
      font-size: var(--tbca-text-sm);
    }
    .tbca-button {
      justify-self: start;
    }
  `,
})
export class CreateCharacter {
  private readonly characters = inject(CharacterService);

  readonly config = input.required<GameConfig>();
  readonly created = output<void>();

  protected readonly classIds = CLASS_IDS;
  protected readonly name = signal('');
  protected readonly classId = signal<ClassId>('bruiser');
  protected readonly touched = signal(false);
  protected readonly taken = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly problem = computed(() => {
    if (!this.touched()) return null;
    if (this.taken()) return 'taken';
    return checkName(this.name());
  });

  private check: ReturnType<typeof setTimeout> | undefined;

  protected setName(value: string): void {
    this.name.set(value);
    this.touched.set(true);
    this.taken.set(false);
    clearTimeout(this.check);
    if (checkName(value) === null) {
      this.check = setTimeout(async () => {
        const result = await this.characters.nameAvailable(value).catch(() => null);
        if (result && this.name() === value) this.taken.set(!result.available);
      }, 300);
    }
  }

  protected async submit(): Promise<void> {
    this.touched.set(true);
    if (this.problem()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.characters.create(this.name().trim(), this.classId());
      this.created.emit();
    } catch (error) {
      const code = error instanceof ApiFailure ? error.code : 'unknown';
      if (code === 'name_taken') this.taken.set(true);
      else this.error.set(code);
    } finally {
      this.busy.set(false);
    }
  }
}
