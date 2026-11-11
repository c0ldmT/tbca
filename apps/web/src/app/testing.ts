import { TranslocoTestingModule, type TranslocoTestingOptions } from '@jsverse/transloco';

import de from '../../public/i18n/de.json';
import en from '../../public/i18n/en.json';

/** Transloco mit den echten Übersetzungen, synchron geladen. */
export function translocoTesting(options: TranslocoTestingOptions = {}) {
  return TranslocoTestingModule.forRoot({
    langs: { de, en },
    translocoConfig: {
      availableLangs: ['de', 'en'],
      defaultLang: 'de',
      fallbackLang: 'en',
      reRenderOnLangChange: true,
    },
    preloadLangs: true,
    ...options,
  });
}
