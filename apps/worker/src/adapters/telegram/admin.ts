import type { TelegramMessage } from '@ac-bot/platform-contracts/telegram';

import { listAppliedJoinApplications } from '../../platform/db/join-applications.js';
import { TelegramPlatformApi } from './api.js';

const pendingCommand = '/pending';

type TelegramAdminCommandInput = {
  db: D1Database;
  botToken: string;
  adminUserIds: string;
  message: TelegramMessage;
};

const parseAdminUserIds = (adminUserIds: string) => {
  return new Set(
    adminUserIds
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
};

const isPendingCommand = (text: string | undefined) => {
  return text?.trim().split(/\s+/)[0] === pendingCommand;
};

const formatPendingApplications = (applications: Awaited<ReturnType<typeof listAppliedJoinApplications>>) => {
  if (applications.length === 0) {
    return '当前没有待审核入群申请。';
  }

  return [
    `当前待审核入群申请：${applications.length} 条`,
    '',
    ...applications.map((application, index) =>
      [
        `${index + 1}. ${application.applicationId}`,
        `用户：${application.platformAccountId}`,
        `社群：${application.communityId}`,
        `状态：${application.status}`,
      ].join('\n'),
    ),
  ].join('\n\n');
};

export const handleTelegramAdminCommand = async (input: TelegramAdminCommandInput): Promise<boolean> => {
  if (!isPendingCommand(input.message.text)) {
    return false;
  }

  const adminUserId = input.message.from?.id;
  const adminUserIds = parseAdminUserIds(input.adminUserIds);
  const telegramApi = new TelegramPlatformApi(input.botToken);

  // 这是 staging 早期体验入口；正式版本会改为数据库管理员名单和完整审计。
  if (!adminUserId || !adminUserIds.has(String(adminUserId))) {
    await telegramApi.sendMessage({
      chat_id: input.message.chat.id,
      text: '你没有权限查看待审核入群申请。',
    });
    return true;
  }

  const applications = await listAppliedJoinApplications(input.db);

  await telegramApi.sendMessage({
    chat_id: input.message.chat.id,
    text: formatPendingApplications(applications),
  });

  return true;
};
