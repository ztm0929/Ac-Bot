import { Hono } from 'hono';
import type { Context } from 'hono';

import { TelegramPlatformApi } from '../../adapters/telegram/api.js';
import type { WorkerEnv } from '../../app/env.js';
import {
  findJoinApplicationByApplicationId,
  updateJoinApplicationStatus,
} from '../../platform/db/join-applications.js';

const internalSecretHeader = 'X-Ac-Bot-Internal-Secret';

type ApprovalAction = 'approve' | 'reject';

type ApprovalRequestBody = {
  applicationId: string;
};

const isApprovalRequestBody = (input: unknown): input is ApprovalRequestBody => {
  return (
    typeof input === 'object' &&
    input !== null &&
    'applicationId' in input &&
    typeof input.applicationId === 'string' &&
    input.applicationId.length > 0
  );
};

export const internalRoutes = new Hono<WorkerEnv>();

const handleApprovalAction = async (c: Context<WorkerEnv>, action: ApprovalAction) => {
  const expectedSecret = c.env.INTERNAL_ADMIN_SECRET;

  if (!expectedSecret) {
    return c.json(
      {
        error: 'server_misconfigured',
        message: '内部审批 secret 未配置',
      },
      500,
    );
  }

  if (c.req.header(internalSecretHeader) !== expectedSecret) {
    return c.json(
      {
        error: 'unauthorized',
        message: '内部审批 secret 校验失败',
      },
      401,
    );
  }

  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: 'bad_request',
        message: '请求体必须是 JSON',
      },
      400,
    );
  }

  if (!isApprovalRequestBody(body)) {
    return c.json(
      {
        error: 'bad_request',
        message: '请求体必须包含 applicationId',
      },
      400,
    );
  }

  const application = await findJoinApplicationByApplicationId(c.env.DB, body.applicationId);

  if (!application) {
    return c.json(
      {
        error: 'not_found',
        message: '入群申请不存在',
      },
      404,
    );
  }

  if (application.platform !== 'telegram') {
    return c.json(
      {
        error: 'unsupported_platform',
        message: '当前内部审批入口只支持 Telegram 入群申请',
      },
      409,
    );
  }

  if (application.status === 'approved' || application.status === 'rejected') {
    return c.json(
      {
        error: 'conflict',
        message: '入群申请已经处理过',
        status: application.status,
      },
      409,
    );
  }

  const botToken = c.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return c.json(
      {
        error: 'server_misconfigured',
        message: 'Telegram bot token 未配置',
      },
      500,
    );
  }

  const telegramApi = new TelegramPlatformApi(botToken);
  const actionInput = {
    platform: application.platform,
    communityId: application.communityId,
    platformAccountId: application.platformAccountId,
    applicationId: application.applicationId,
  };

  // 这是 staging 早期实测入口；正式管理员权限、审计日志和二次确认会在后续模块中替换这里。
  if (action === 'approve') {
    await telegramApi.approveJoinApplication(actionInput);
    await updateJoinApplicationStatus(c.env.DB, application.applicationId, 'approved');
  } else {
    await telegramApi.rejectJoinApplication(actionInput);
    await updateJoinApplicationStatus(c.env.DB, application.applicationId, 'rejected');
  }

  return c.json({
    ok: true,
    action,
    applicationId: application.applicationId,
  });
};

internalRoutes.post('/join-applications/approve', (c) => {
  return handleApprovalAction(c, 'approve');
});

internalRoutes.post('/join-applications/reject', (c) => {
  return handleApprovalAction(c, 'reject');
});
