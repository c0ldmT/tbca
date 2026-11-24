import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { LegalService } from './legal.service';

describe('LegalService', () => {
  function setup(body: object) {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(LegalService);
    const done = service.load();
    TestBed.inject(HttpTestingController).expectOne('/legal.json').flush(body);
    return { service, done };
  }

  it('mahnt fehlende Angaben nur bei öffentlichen Instanzen an', async () => {
    const { service, done } = setup({
      mode: 'public',
      operator: { name: '', street: '', city: '', email: '' },
    });
    await done;
    expect(service.isPrivate()).toBe(false);
    expect(service.missing()).toBe(true);
  });

  it('kennt private Instanzen ohne Impressum', async () => {
    const { service, done } = setup({
      mode: 'private',
      operator: { name: '', street: '', city: '', email: '' },
    });
    await done;
    expect(service.isPrivate()).toBe(true);
    expect(service.missing()).toBe(false);
  });
});
