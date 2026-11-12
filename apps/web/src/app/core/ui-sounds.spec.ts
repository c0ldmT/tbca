import { pathOnly, soundForClick } from './ui-sounds';

function el(html: string): Element {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host.querySelector('[data-hit]') ?? host.firstElementChild!;
}

describe('soundForClick', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('klickt bei Schaltflächen, auch auf deren Inhalt', () => {
    expect(soundForClick(el('<button><span data-hit>OK</span></button>'))).toBe('press');
  });

  it('bleibt bei deaktivierten Elementen und internen Links stumm', () => {
    expect(soundForClick(el('<button disabled>OK</button>'))).toBeNull();
    expect(soundForClick(el('<a href="/fight/arena">Arena</a>'))).toBeNull();
    expect(soundForClick(el('<a href="https://discord.com">Login</a>'))).toBe('press');
  });

  it('unterscheidet Umschalter und Auswahl', () => {
    expect(soundForClick(el('<button aria-pressed="true">An</button>'))).toBe('toggle');
    expect(soundForClick(el('<button role="radio">Bruiser</button>'))).toBe('select');
    expect(soundForClick(el('<label><input type="radio" />Gunner</label>'))).toBe('select');
    expect(soundForClick(el('<label><input type="checkbox" />Nyx</label>'))).toBe('toggle');
  });

  it('folgt data-sfx', () => {
    expect(soundForClick(el('<button data-sfx="off">Menü</button>'))).toBeNull();
    expect(soundForClick(el('<button data-sfx="open">Menü</button>'))).toBe('open');
  });

  it('ignoriert Klicks ins Leere', () => {
    expect(soundForClick(el('<p>Text</p>'))).toBeNull();
    expect(soundForClick(null)).toBeNull();
  });
});

describe('pathOnly', () => {
  it('schneidet Query und Fragment ab', () => {
    expect(pathOnly('/character/workshop?item=abc#x')).toBe('/character/workshop');
    expect(pathOnly('')).toBe('/');
  });
});
