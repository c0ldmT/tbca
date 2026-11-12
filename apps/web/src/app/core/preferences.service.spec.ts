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

  it('nimmt bei reduzierter Bewegung nur im Auto-Modus die ruhige Stufe', () => {
    const prefs = TestBed.inject(PreferencesService);
    prefs.reducedMotion.set(true);
    prefs.setQuality('auto');
    expect(prefs.effectiveQuality()).toBe('niedrig');
    // Ausdrückliche Wahl gilt trotzdem
    prefs.setQuality('hoch');
    expect(prefs.effectiveQuality()).toBe('hoch');
  });

  it('startet Auto auf Hoch und senkt nur nach gemessener Langsamkeit ab, nie bis zum Standbild', () => {
    const prefs = TestBed.inject(PreferencesService);
    prefs.reducedMotion.set(false);
    prefs.setQuality('auto');
    expect(prefs.effectiveQuality()).toBe('hoch');
    prefs.reportSlow();
    expect(prefs.effectiveQuality()).toBe('mittel');
    prefs.reportSlow();
    prefs.reportSlow();
    // Auto wird nie zum Standbild
    expect(prefs.effectiveQuality()).toBe('sparsam');
    // Eine feste Wahl wird nie automatisch geändert
    prefs.setQuality('hoch');
    prefs.reportSlow();
    expect(prefs.effectiveQuality()).toBe('hoch');
  });

  it('schreibt die wirksame Stufe an das Wurzelelement', () => {
    const prefs = TestBed.inject(PreferencesService);
    prefs.setQuality('niedrig');
    TestBed.tick();
    expect(document.documentElement.dataset['quality']).toBe('niedrig');
  });
});
