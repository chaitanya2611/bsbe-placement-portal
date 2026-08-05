import { parseWebEnvironment } from '@bsbe/config';

export const webEnvironment = parseWebEnvironment(import.meta.env);
