import { TestBed } from '@angular/core/testing';

import { PreferencesService } from './preferences.service';

describe('PreferencesService', () => {
  beforeEach(() => localStorage.clear());

  it('merkt sich Grafikstufe und Sound im Browser', () => {
    const prefs = TestBed.inject(PreferencesService);
    prefs.reducedMotion.set(false);
    prefs.setQuality('mittel');
    prefs.setSound(false);
    expect(localStorage.getItem('tbca.quality')).toBe('mittel');
    expect(localStorage.getItem('tbca.sound')).toBe('aus');
    expect(prefs.effectiveQuality()).toBe('mittel');
  });

  it('liest gespeicherte Werte und ignoriert ungültige', () => {
    localStorage.setItem('tbca.quality', 'ultra');
    localStorage.setItem('tbca.sound', 'aus');
    const prefs = TestBed.inject(PreferencesService);
    expect(prefs.quality()).toBe('auto');
    expect(prefs.sound()).toBe(false);
  });

  it('schaltet bei reduzierter Bewegung auf die niedrige Stufe', () => {
    const prefs = TestBed.inject(PreferencesService);
    prefs.setQuality('hoch');
    prefs.reducedMotion.set(true);
    expect(prefs.effectiveQuality()).toBe('niedrig');
  });

  it('schreibt die wirksame Stufe an das Wurzelelement', () => {
    const prefs = TestBed.inject(PreferencesService);
    prefs.setQuality('niedrig');
    TestBed.tick();
    expect(document.documentElement.dataset['quality']).toBe('niedrig');
  });
});
