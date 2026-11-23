import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { GameConfigService } from './game-config.service';

describe('GameConfigService', () => {
  let service: GameConfigService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GameConfigService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('meldet „keine Season aktiv“ mit dem Code der API und versucht es danach erneut', async () => {
    const first = service.load();
    http
      .expectOne('/api/game/config')
      .flush({ code: 'no_active_season' }, { status: 503, statusText: 'Service Unavailable' });
    await expect(first).rejects.toMatchObject({ code: 'no_active_season' });

    const second = service.load();
    http
      .expectOne('/api/game/config')
      .flush({ season: { id: 's', name: 'Dev' }, configVersion: 1, game: {} });
    await expect(second).resolves.toMatchObject({ configVersion: 1 });
  });

  it('meldet einen fehlenden Server als http_<status>', async () => {
    const done = service.load();
    http
      .expectOne('/api/game/config')
      .flush('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });
    await expect(done).rejects.toMatchObject({ code: 'http_502' });
  });
});
