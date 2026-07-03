import { describe, expect, it } from 'vitest';

import type { TelegramWebhookUpdate } from '@ac-bot/platform-contracts/telegram';

import {
  createJoinApplicationCreatedEventFromTelegramUpdate,
  createMemberJoinedEventsFromTelegramUpdate,
  isTelegramChatMemberUpdatedUpdate,
  isTelegramChatJoinRequestUpdate,
  isTelegramNewChatMembersUpdate,
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

  it('识别 message.new_chat_members update', () => {
    const update = {
      update_id: 124,
      message: {
        message_id: 10,
        date: 1780000000,
        chat: { id: -100123 },
        new_chat_members: [{ id: 456 }],
      },
    };

    expect(isTelegramWebhookUpdate(update)).toBe(true);
    expect(isTelegramNewChatMembersUpdate(update)).toBe(true);
  });

  it('将 message.new_chat_members 映射为 member.joined 核心事件', () => {
    const events = createMemberJoinedEventsFromTelegramUpdate({
      update_id: 124,
      message: {
        message_id: 10,
        date: 1780000000,
        chat: { id: -100123 },
        new_chat_members: [{ id: 456 }, { id: 789 }],
      },
    });

    expect(events).toEqual([
      {
        eventId: 'telegram:124:member.joined:456',
        eventType: 'member.joined',
        occurredAt: '2026-05-28T20:26:40.000Z',
        payload: {
          platform: 'telegram',
          platformAccountId: '456',
          communityId: '-100123',
          joinedAt: '2026-05-28T20:26:40.000Z',
        },
      },
      {
        eventId: 'telegram:124:member.joined:789',
        eventType: 'member.joined',
        occurredAt: '2026-05-28T20:26:40.000Z',
        payload: {
          platform: 'telegram',
          platformAccountId: '789',
          communityId: '-100123',
          joinedAt: '2026-05-28T20:26:40.000Z',
        },
      },
    ]);
  });

  it('识别 chat_member update', () => {
    const update = {
      update_id: 125,
      chat_member: {
        chat: { id: -100123 },
        from: { id: 1 },
        date: 1780000000,
        old_chat_member: {
          status: 'left',
          user: { id: 456 },
        },
        new_chat_member: {
          status: 'member',
          user: { id: 456 },
        },
      },
    } satisfies TelegramWebhookUpdate;

    expect(isTelegramWebhookUpdate(update)).toBe(true);
    expect(isTelegramChatMemberUpdatedUpdate(update)).toBe(true);
  });

  it('将 chat_member 加入状态变化映射为 member.joined 核心事件', () => {
    const events = createMemberJoinedEventsFromTelegramUpdate({
      update_id: 125,
      chat_member: {
        chat: { id: -100123 },
        from: { id: 1 },
        date: 1780000000,
        old_chat_member: {
          status: 'left',
          user: { id: 456 },
        },
        new_chat_member: {
          status: 'restricted',
          user: { id: 456 },
          is_member: true,
        },
      },
    });

    expect(events).toEqual([
      {
        eventId: 'telegram:125:member.joined:456',
        eventType: 'member.joined',
        occurredAt: '2026-05-28T20:26:40.000Z',
        payload: {
          platform: 'telegram',
          platformAccountId: '456',
          communityId: '-100123',
          joinedAt: '2026-05-28T20:26:40.000Z',
        },
      },
    ]);
  });

  it('非加入状态变化不生成 member.joined 事件', () => {
    expect(
      createMemberJoinedEventsFromTelegramUpdate({
        update_id: 126,
        chat_member: {
          chat: { id: -100123 },
          from: { id: 1 },
          date: 1780000000,
          old_chat_member: {
            status: 'member',
            user: { id: 456 },
          },
          new_chat_member: {
            status: 'restricted',
            user: { id: 456 },
            is_member: true,
          },
        },
      }),
    ).toEqual([]);
  });
});
