import { describe, expect, it, vi } from 'vitest';

import { TelegramApiError, TelegramPlatformApi } from './api.js';

const okResponse = new Response(JSON.stringify({ ok: true }), {
  status: 200,
  headers: {
    'content-type': 'application/json',
  },
});

describe('TelegramPlatformApi', () => {
  it('调用 approveChatJoinRequest 批准入群申请', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse.clone());
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await api.approveJoinApplication({
      platform: 'telegram',
      communityId: '-100123',
      platformAccountId: '456',
      applicationId: 'telegram:123',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://api.telegram.org/bottest-token/approveChatJoinRequest', {
      method: 'POST',
      signal: expect.any(AbortSignal) as AbortSignal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: -100123,
        user_id: 456,
      }),
    });
  });

  it('调用 declineChatJoinRequest 拒绝入群申请', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse.clone());
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await api.rejectJoinApplication({
      platform: 'telegram',
      communityId: '-100123',
      platformAccountId: '456',
      applicationId: 'telegram:123',
      reason: '测试拒绝',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://api.telegram.org/bottest-token/declineChatJoinRequest', {
      method: 'POST',
      signal: expect.any(AbortSignal) as AbortSignal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: -100123,
        user_id: 456,
      }),
    });
  });

  it('调用 sendMessage 发送 Telegram 消息', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse.clone());
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await api.sendMessage({
      chat_id: -100123,
      text: '当前没有待审核入群申请。',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://api.telegram.org/bottest-token/sendMessage', {
      method: 'POST',
      signal: expect.any(AbortSignal) as AbortSignal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: -100123,
        text: '当前没有待审核入群申请。',
      }),
    });
  });


  it('Telegram API 返回失败时抛出错误', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, description: 'Bad Request' }), {
        status: 400,
        headers: {
          'content-type': 'application/json',
        },
      }),
    );
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await expect(
      api.approveJoinApplication({
        platform: 'telegram',
        communityId: '-100123',
        platformAccountId: '456',
        applicationId: 'telegram:123',
      }),
    ).rejects.toThrow(new TelegramApiError('Bad Request'));
  });

  it('非 telegram 平台动作不会请求 Telegram API', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse.clone());
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await expect(
      api.approveJoinApplication({
        platform: 'discord',
        communityId: 'community-1',
        platformAccountId: '456',
        applicationId: 'discord:123',
      }),
    ).rejects.toThrow(new TelegramApiError('Telegram adapter 只能处理 telegram 平台动作'));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
