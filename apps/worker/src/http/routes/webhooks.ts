import { Hono } from 'hono';

import type { WorkerEnv } from '../../app/env.js';

type WebhookPlaceholder = {
  platform: 'telegram' | 'discord' | 'matrix' | 'qq';
};

const platformNames: Record<WebhookPlaceholder['platform'], string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  matrix: 'Matrix',
  qq: 'QQ',
};

const notImplemented = (input: WebhookPlaceholder) => ({
  error: 'not_implemented',
  platform: input.platform,
  message: `${platformNames[input.platform]} webhook 尚未实现`,
});

export const webhookRoutes = new Hono<WorkerEnv>();

webhookRoutes.post('/telegram', (c) => {
  return c.json(notImplemented({ platform: 'telegram' }), 501);
});

webhookRoutes.post('/discord', (c) => {
  return c.json(notImplemented({ platform: 'discord' }), 501);
});

webhookRoutes.post('/matrix', (c) => {
  return c.json(notImplemented({ platform: 'matrix' }), 501);
});

webhookRoutes.post('/qq', (c) => {
  return c.json(notImplemented({ platform: 'qq' }), 501);
});
