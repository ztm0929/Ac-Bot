import { describe, expect, it } from 'vitest';

import type { WorkerBindings } from '../../app/env.js';
import { createHttpApp } from '../index.js';

const createTestEnv = (bindings: Partial<WorkerBindings>): WorkerBindings => {
  return bindings as WorkerBindings;
};

describe('internalRoutes', () => {
  it('内部审批 secret 未配置时拒绝请求', async () => {
    const app = createHttpApp();

    const response = await app.request(
      '/internal/join-applications/approve',
      {
        method: 'POST',
        body: JSON.stringify({ applicationId: 'telegram:123' }),
      },
      createTestEnv({}),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'server_misconfigured',
    });
  });

  it('内部审批 secret 校验失败时拒绝请求', async () => {
    const app = createHttpApp();

    const response = await app.request(
      '/internal/join-applications/approve',
      {
        method: 'POST',
        headers: {
          'X-Ac-Bot-Internal-Secret': 'wrong-secret',
        },
        body: JSON.stringify({ applicationId: 'telegram:123' }),
      },
      createTestEnv({
        INTERNAL_ADMIN_SECRET: 'expected-secret',
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: 'unauthorized',
    });
  });
});
