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

const telegramWebhookSecretHeader = 'X-Telegram-Bot-Api-Secret-Token';
const telegramWebhookMaxBodyBytes = 1024 * 1024;

const isJsonContentType = (contentType: string | undefined) => {
  return contentType?.toLowerCase().split(';')[0]?.trim() === 'application/json';
};

export const webhookRoutes = new Hono<WorkerEnv>();

webhookRoutes.post('/telegram', async (c) => {
  const expectedSecret = c.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expectedSecret) {
    return c.json(
      {
        error: 'server_misconfigured',
        message: 'Telegram webhook secret 未配置',
      },
      500,
    );
  }

  const actualSecret = c.req.header(telegramWebhookSecretHeader);

  if (actualSecret !== expectedSecret) {
    return c.json(
      {
        error: 'unauthorized',
        message: 'Telegram webhook secret 校验失败',
      },
      401,
    );
  }

  if (!isJsonContentType(c.req.header('Content-Type'))) {
    return c.json(
      {
        error: 'unsupported_media_type',
        message: 'Telegram webhook 只接受 application/json 请求',
      },
      415,
    );
  }

  const contentLength = c.req.header('Content-Length');
  const declaredBodyBytes = contentLength ? Number(contentLength) : undefined;

  if (declaredBodyBytes !== undefined && !Number.isFinite(declaredBodyBytes)) {
    return c.json(
      {
        error: 'bad_request',
        message: 'Content-Length 请求头格式无效',
      },
      400,
    );
  }

  if (declaredBodyBytes !== undefined && declaredBodyBytes > telegramWebhookMaxBodyBytes) {
    return c.json(
      {
        error: 'payload_too_large',
        message: 'Telegram webhook 请求体过大',
      },
      413,
    );
  }

  const rawBody = await c.req.text();
  const actualBodyBytes = new TextEncoder().encode(rawBody).byteLength;

  if (actualBodyBytes > telegramWebhookMaxBodyBytes) {
    return c.json(
      {
        error: 'payload_too_large',
        message: 'Telegram webhook 请求体过大',
      },
      413,
    );
  }

  try {
    JSON.parse(rawBody);
  } catch {
    return c.json(
      {
        error: 'bad_request',
        message: 'Telegram webhook JSON 格式无效',
      },
      400,
    );
  }

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
