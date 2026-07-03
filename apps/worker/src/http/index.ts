import { Hono } from 'hono';

import type { WorkerEnv } from '../app/env.js';
import { healthRoutes } from './routes/health.js';
import { internalRoutes } from './routes/internal.js';
import { webhookRoutes } from './routes/webhooks.js';

export const createHttpApp = () => {
  const app = new Hono<WorkerEnv>();

  app.route('/', healthRoutes);
  app.route('/internal', internalRoutes);
  app.route('/webhooks', webhookRoutes);

  return app;
};
