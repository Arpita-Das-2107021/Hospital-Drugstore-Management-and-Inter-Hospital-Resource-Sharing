import { Language } from '@/types/language';

import enTranslations from '@/locales/en.json';
import bnTranslations from '@/locales/bn.json';

export const translations: Record<Language, Record<string, any>> = {
  en: enTranslations,
  bn: bnTranslations,
};


export function getNestedTranslation(
  translations: Record<string, any>, 
  key: string, 
  defaultValue?: string
): string {
  const keys = key.split('.');
  let value = translations;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return defaultValue || key;
    }
  }
  
  return typeof value === 'string' ? value : defaultValue || key;
}