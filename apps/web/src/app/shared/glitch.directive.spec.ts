import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { GlitchDirective } from './glitch.directive';

@Component({
  imports: [GlitchDirective],
  template: `<h1 [tbcaGlitch]="trigger()">Arena</h1>`,
})
class Host {
  readonly trigger = signal(1);
}

function setReducedMotion(reduce: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: reduce && query.includes('reduce'), media: query }),
  });
}

describe('GlitchDirective', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement.querySelector('h1') as HTMLElement };
  }

  it('spielt beim Erscheinen höchstens 300 ms', async () => {
    setReducedMotion(false);
    const { el } = await render();
    expect(el.classList).toContain('tbca-glitch');
    expect(el.classList).toContain('tbca-glitch--active');
    expect(el.getAttribute('data-glitch-text')).toBe('Arena');
    vi.advanceTimersByTime(300);
    expect(el.classList).not.toContain('tbca-glitch--active');
  });

  it('spielt erneut, wenn sich der Auslöser ändert', async () => {
    setReducedMotion(false);
    const { fixture, el } = await render();
    vi.advanceTimersByTime(300);
    fixture.componentInstance.trigger.set(2);
    fixture.detectChanges();
    expect(el.classList).toContain('tbca-glitch--active');
  });

  it('bleibt bei reduzierter Bewegung aus', async () => {
    setReducedMotion(true);
    const { el } = await render();
    expect(el.classList).not.toContain('tbca-glitch--active');
  });
});
