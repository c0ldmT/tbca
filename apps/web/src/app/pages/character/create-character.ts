import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { silhouetteFor } from '@tbca/assets';
import { CLASS_IDS, type ClassId, type GameConfig } from '@tbca/game-core';
import { checkName } from '@tbca/shared/names';

import { ApiFailure, CharacterService } from '../../core/character.service';
import { SoundService } from '../../core/sound.service';
import { ClassBadge } from '../../shared/ui/class-badge';
import { SilhouetteFigure } from '../../shared/ui/silhouette';

/** Name und Startklasse wählen; die Klasse lässt sich später jederzeit wechseln. */
@Component({
  selector: 'tbca-create-character',
  imports: [TranslocoDirective, SilhouetteFigure, ClassBadge],
  templateUrl: './create-character.html',
  styleUrl: './create-character.css',
})
export class CreateCharacter {
  private readonly characters = inject(CharacterService);
  private readonly sound = inject(SoundService);

  readonly config = input.required<GameConfig>();
  readonly created = output<void>();

  protected readonly classIds = CLASS_IDS;
  protected readonly name = signal('');
  protected readonly classId = signal<ClassId>('bruiser');
  protected readonly touched = signal(false);
  protected readonly taken = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  /** Akzentfarbe der gewählten Klasse für Bühne und Kicker. */
  protected readonly accent = computed(() => silhouetteFor(this.classId()).accent);

  protected pick(id: ClassId): void {
    if (id === this.classId()) return;
    this.classId.set(id);
    this.sound.play('click');
  }

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
      this.sound.play('success');
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
