import type { PlatformEventEnvelope } from '@ac-bot/platform-contracts/core';
import { describe, expect, it, vi } from 'vitest';

import type { WorkerBindings } from '../app/env.js';
import { processPlatformEventEnvelope } from './consumer.js';

const createEnv = (): WorkerBindings =>
  ({
    DB: {},
    PLATFORM_EVENTS: {},
    TELEGRAM_BOT_TOKEN: 'test-token',
  }) as WorkerBindings;

const createNewMemberEnvelope = (): PlatformEventEnvelope => ({
  platform: 'telegram',
  eventType: 'telegram.update.received',
  rawEventId: '100',
  receivedAt: '2026-07-03T12:00:00.000Z',
  payload: {
    update_id: 100,
    message: {
      message_id: 10,
      date: 1780000000,
      chat: { id: -100123 },
      new_chat_members: [{ id: 456 }],
    },
  },
});

describe('processPlatformEventEnvelope', () => {
  it('处理 Telegram 新成员事件并触发 onboarding', async () => {
    const handleMemberJoined = vi.fn().mockResolvedValue(undefined);

    await processPlatformEventEnvelope(createEnv(), createNewMemberEnvelope(), {
      persistPlatformEvent: vi.fn().mockResolvedValue({ status: 'created' }),
      persistJoinApplicationCreatedEvent: vi.fn().mockResolvedValue({ status: 'created' }),
      handleMemberJoined,
    });

    expect(handleMemberJoined).toHaveBeenCalledWith({
      eventId: 'telegram:100:member.joined:456',
      eventType: 'member.joined',
      occurredAt: '2026-05-28T20:26:40.000Z',
      payload: {
        platform: 'telegram',
        platformAccountId: '456',
        communityId: '-100123',
        joinedAt: '2026-05-28T20:26:40.000Z',
      },
    });
  });

  it('重复平台事件仍继续处理新成员，避免外部 API 失败后重试被去重挡住', async () => {
    const handleMemberJoined = vi.fn().mockResolvedValue(undefined);

    await processPlatformEventEnvelope(createEnv(), createNewMemberEnvelope(), {
      persistPlatformEvent: vi.fn().mockResolvedValue({ status: 'duplicate' }),
      persistJoinApplicationCreatedEvent: vi.fn().mockResolvedValue({ status: 'duplicate' }),
      handleMemberJoined,
    });

    expect(handleMemberJoined).toHaveBeenCalledTimes(1);
  });
});
