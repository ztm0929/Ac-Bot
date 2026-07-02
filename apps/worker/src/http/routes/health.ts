import { Hono } from 'hono';

import type { WorkerEnv } from '../../app/env.js';

export const healthRoutes = new Hono<WorkerEnv>();

healthRoutes.get('/health', (c) => {
  return c.json({
    ok: true,
    service: 'ac-bot-worker',
    environment: c.env.APP_ENV ?? 'local',
  });
});
