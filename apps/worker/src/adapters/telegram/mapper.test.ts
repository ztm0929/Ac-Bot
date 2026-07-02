import { describe, expect, it } from 'vitest';

import {
  createJoinApplicationCreatedEventFromTelegramUpdate,
  isTelegramChatJoinRequestUpdate,
  isTelegramWebhookUpdate,
} from './mapper.js';

describe('Telegram mapper', () => {
  it('识别最小 Telegram webhook update', () => {
    expect(isTelegramWebhookUpdate({ update_id: 123 })).toBe(true);
    expect(isTelegramWebhookUpdate({ update_id: -1 })).toBe(false);
    expect(isTelegramWebhookUpdate({ update_id: '123' })).toBe(false);
  });

  it('识别 chat_join_request update', () => {
    const update = {
      update_id: 123,
      chat_join_request: {
        chat: { id: -100123 },
        from: { id: 456 },
        date: 1780000000,
      },
    };

    expect(isTelegramWebhookUpdate(update)).toBe(true);
    expect(isTelegramChatJoinRequestUpdate(update)).toBe(true);
  });

  it('将 chat_join_request 映射为 join_application.created 核心事件', () => {
    const event = createJoinApplicationCreatedEventFromTelegramUpdate(
      {
        update_id: 123,
        chat_join_request: {
          chat: { id: -100123 },
          from: { id: 456 },
          date: 1780000000,
          invite_link: {
            invite_link: 'https://t.me/+invite',
          },
        },
      },
      '2026-07-02T00:00:00.000Z',
    );

    expect(event).toEqual({
      eventId: 'telegram:123:join_application.created',
      eventType: 'join_application.created',
      occurredAt: '2026-07-02T00:00:00.000Z',
      payload: {
        platform: 'telegram',
        platformAccountId: '456',
        communityId: '-100123',
        applicationId: 'telegram:123',
        sourceId: 'https://t.me/+invite',
      },
    });
  });

  it('非 chat_join_request update 不生成入群申请事件', () => {
    expect(
      createJoinApplicationCreatedEventFromTelegramUpdate(
        {
          update_id: 123,
        },
        '2026-07-02T00:00:00.000Z',
      ),
    ).toBeUndefined();
  });
});
