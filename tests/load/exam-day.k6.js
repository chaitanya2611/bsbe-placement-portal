/* global __ENV */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const failureRate = new Rate('portal_failures');
const readinessDuration = new Trend('readiness_duration', true);
const baseUrl = __ENV.PORTAL_API_URL || 'http://127.0.0.1:3000/api/v1';

export const options = {
  scenarios: {
    ramp_to_exam_day: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '60s', target: 500 },
        { duration: '2m', target: 500 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<750', 'p(99)<1500'],
    portal_failures: ['rate<0.01'],
  },
};

export default function () {
  const readiness = http.get(`${baseUrl}/health/ready`, {
    tags: { operation: 'readiness' },
  });
  readinessDuration.add(readiness.timings.duration);
  const ready = check(readiness, {
    'readiness returns 200': (response) => response.status === 200,
    'readiness reports ready': (response) => response.json('status') === 'ready',
  });
  failureRate.add(!ready);

  const csrf = http.get(`${baseUrl}/auth/csrf`, { tags: { operation: 'csrf' } });
  const csrfReady = check(csrf, {
    'CSRF endpoint returns 200': (response) => response.status === 200,
    'CSRF token is present': (response) => Boolean(response.json('csrfToken')),
  });
  failureRate.add(!csrfReady);
  sleep(1);
}
