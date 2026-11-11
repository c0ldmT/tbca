import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { MeResponse } from '@tbca/shared';

import { AuthService } from './auth.service';

const me: MeResponse = {
  account: { id: '01933b5e-6f1a-7c2b-9d3e-4f5a6b7c8d9e', globalRole: 'player', locale: null },
  identities: [{ provider: 'discord', displayName: 'Neo', avatarUrl: null }],
  csrfToken: 'csrf-token-0123456789',
};

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lädt den angemeldeten Account', async () => {
    expect(auth.state()).toBeUndefined();
    const done = auth.refresh();
    http.expectOne('/api/auth/me').flush(me);
    await done;
    expect(auth.displayName()).toBe('Neo');
  });

  it('wertet 401 als abgemeldet', async () => {
    const done = auth.refresh();
    http.expectOne('/api/auth/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    await done;
    expect(auth.state()).toBeNull();
  });

  it('meldet mit CSRF-Token ab', async () => {
    const loaded = auth.refresh();
    http.expectOne('/api/auth/me').flush(me);
    await loaded;

    const done = auth.logout();
    const req = http.expectOne('/api/auth/logout');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('x-csrf-token')).toBe(me.csrfToken);
    req.flush(null, { status: 204, statusText: 'No Content' });
    await done;
    expect(auth.state()).toBeNull();
  });
});
