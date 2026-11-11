import { z } from 'zod';

import { GLOBAL_ROLES, IDENTITY_PROVIDERS, LOCALES } from './constants.js';

export const localeSchema = z.enum(LOCALES);
export const identityProviderSchema = z.enum(IDENTITY_PROVIDERS);
export const globalRoleSchema = z.enum(GLOBAL_ROLES);
