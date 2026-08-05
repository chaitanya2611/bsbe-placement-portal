import { webEnvironment } from './environment';

export interface ApiHealth {
  status: 'ok' | 'degraded' | 'down';
  checkedAt: string;
  service: string;
  version: string;
  checks: Record<string, { status: 'ok' | 'degraded' | 'down'; detail?: string }>;
}

export async function fetchApiLiveness(signal?: AbortSignal): Promise<ApiHealth> {
  const response = await fetch(`${webEnvironment.VITE_API_BASE_URL}/health/live`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    throw new Error(`API liveness request failed with status ${response.status}`);
  }

  return (await response.json()) as ApiHealth;
}
