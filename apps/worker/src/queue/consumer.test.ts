import type { PlatformEventEnvelope } from '@ac-bot/platform-contracts/core';
import { describe, expect, it, vi } from 'vitest';

import type { WorkerBindings } from '../app/env.js';
import { processPlatformEventEnvelope } from './consumer.js';

const createEnv = (): WorkerBindings =>
  ({
    DB: {},
    PLATFORM_EVENTS: {},
    TELEGRAM_BOT_TOKEN: 'test-token',
    VERIFICATION_PROMPT_TEXT: '请完成验证',
    VERIFICATION_PROMPT_GROUP_FALLBACK_TEXT: '请点击机器人完成验证',
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

const createPrivateAnswerEnvelope = (): PlatformEventEnvelope => ({
  platform: 'telegram',
  eventType: 'telegram.update.received',
  rawEventId: '200',
  receivedAt: '2026-07-03T12:01:00.000Z',
  payload: {
    update_id: 200,
    message: {
      message_id: 20,
      date: 1780000060,
      chat: { id: 456, type: 'private' },
      from: { id: 456 },
      text: 'configured-answer',
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
      handleVerificationAnswer: vi.fn().mockResolvedValue(undefined),
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
      handleVerificationAnswer: vi.fn().mockResolvedValue(undefined),
    });

    expect(handleMemberJoined).toHaveBeenCalledTimes(1);
  });

  it('处理 Telegram 私聊文本并触发验证答案服务', async () => {
    const handleVerificationAnswer = vi.fn().mockResolvedValue(undefined);

    await processPlatformEventEnvelope(createEnv(), createPrivateAnswerEnvelope(), {
      persistPlatformEvent: vi.fn().mockResolvedValue({ status: 'created' }),
      persistJoinApplicationCreatedEvent: vi.fn().mockResolvedValue({ status: 'created' }),
      handleMemberJoined: vi.fn().mockResolvedValue(undefined),
      handleVerificationAnswer,
    });

    expect(handleVerificationAnswer).toHaveBeenCalledWith({
      eventId: 'telegram:200:verification.answer_received:456',
      eventType: 'verification.answer_received',
      occurredAt: '2026-05-28T20:27:40.000Z',
      payload: {
        platform: 'telegram',
        platformAccountId: '456',
        answerText: 'configured-answer',
        answeredAt: '2026-05-28T20:27:40.000Z',
      },
    });
  });

  it('重复私聊答案事件不重复处理，避免错误次数被重复累加', async () => {
    const handleVerificationAnswer = vi.fn().mockResolvedValue(undefined);

    await processPlatformEventEnvelope(createEnv(), createPrivateAnswerEnvelope(), {
      persistPlatformEvent: vi.fn().mockResolvedValue({ status: 'duplicate' }),
      persistJoinApplicationCreatedEvent: vi.fn().mockResolvedValue({ status: 'duplicate' }),
      handleMemberJoined: vi.fn().mockResolvedValue(undefined),
      handleVerificationAnswer,
    });

    expect(handleVerificationAnswer).not.toHaveBeenCalled();
  });

  it('新成员处理应先限制发言再发送验证引导', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })),
    );

    globalThis.fetch = fetchMock;

    try {
      await processPlatformEventEnvelope(createEnv(), createNewMemberEnvelope(), {
        persistPlatformEvent: vi.fn().mockResolvedValue({ status: 'created' }),
        persistJoinApplicationCreatedEvent: vi.fn().mockResolvedValue({ status: 'created' }),
        async handleMemberJoined(coreEvent) {
          const { TelegramPlatformApi } = await import('../adapters/telegram/api.js');
          const telegramApi = new TelegramPlatformApi('test-token');

          await telegramApi.restrictMember({
            platform: coreEvent.payload.platform,
            communityId: coreEvent.payload.communityId,
            platformAccountId: coreEvent.payload.platformAccountId,
            mode: 'verification_locked',
          });
          await telegramApi.sendVerificationPrompt({
            platform: coreEvent.payload.platform,
            communityId: coreEvent.payload.communityId,
            platformAccountId: coreEvent.payload.platformAccountId,
            directMessageText: '请完成验证',
            groupFallbackText: '请点击机器人完成验证',
          });
        },
        handleVerificationAnswer: vi.fn().mockResolvedValue(undefined),
      });

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://api.telegram.org/bottest-token/restrictChatMember',
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://api.telegram.org/bottest-token/sendMessage',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            chat_id: 456,
            text: '请完成验证',
          }),
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
