import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';
import { LanguageService } from './core/language.service';
import { translocoTesting } from './testing';

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [App, translocoTesting()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('zeigt Kopf- und Fußzeile auf Deutsch', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/auth/me').flush(null, {
      status: 401,
      statusText: 'Unauthorized',
    });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.wordmark')?.textContent).toContain('TBCA');
    expect(el.querySelector('.footer')?.textContent).toContain('Impressum');
  });

  it('wechselt die Sprache und merkt sie sich', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match('/api/auth/me');
    TestBed.inject(LanguageService).init();

    const en = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'EN',
    )!;
    en.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(en.getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('tbca.locale')).toBe('en');
    expect((fixture.nativeElement as HTMLElement).querySelector('.footer')?.textContent).toContain(
      'Privacy',
    );
  });
});
