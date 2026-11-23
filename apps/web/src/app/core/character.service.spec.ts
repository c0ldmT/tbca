import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';
import { CharacterService } from './character.service';

describe('CharacterService', () => {
  let service: CharacterService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CharacterService);
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).state.set({
      account: { id: '01933b5e-6f1a-7c2b-9d3e-4f5a6b7c8d9e', globalRole: 'player', locale: null },
      identities: [],
      csrfToken: 'csrf-token-0123456789',
    });
  });

  afterEach(() => http.verify());

  it('wertet 404 als „noch kein Charakter“', async () => {
    const done = service.refresh();
    http
      .expectOne('/api/characters/me')
      .flush({ code: 'no_character' }, { status: 404, statusText: 'Not Found' });
    await done;
    expect(service.state()).toBeNull();
  });

  it('schickt das CSRF-Token und liefert den Fehlercode der API', async () => {
    const done = service.create('Kira', 'gunner');
    const req = http.expectOne('/api/characters');
    expect(req.request.headers.get('x-csrf-token')).toBe('csrf-token-0123456789');
    expect(req.request.body).toEqual({ name: 'Kira', classId: 'gunner' });
    req.flush({ code: 'name_taken' }, { status: 409, statusText: 'Conflict' });
    await expect(done).rejects.toMatchObject({ code: 'name_taken' });
  });
});
