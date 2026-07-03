import { describe, expect, it, vi } from 'vitest';

import { handleTelegramAdminCommand } from './admin.js';

const okResponse = new Response(JSON.stringify({ ok: true }), {
  status: 200,
  headers: {
    'content-type': 'application/json',
  },
});

describe('handleTelegramAdminCommand', () => {
  it('非 /pending 消息不处理', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse.clone());
    vi.stubGlobal('fetch', fetchMock);

    const handled = await handleTelegramAdminCommand({
      db: {} as D1Database,
      botToken: 'test-token',
      adminUserIds: '456',
      message: {
        message_id: 1,
        chat: { id: -100123 },
        from: { id: 456 },
        text: '/start',
      },
    });

    expect(handled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('非管理员请求 /pending 时发送无权限提示', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse.clone());
    vi.stubGlobal('fetch', fetchMock);

    const handled = await handleTelegramAdminCommand({
      db: {} as D1Database,
      botToken: 'test-token',
      adminUserIds: '456',
      message: {
        message_id: 1,
        chat: { id: -100123 },
        from: { id: 789 },
        text: '/pending',
      },
    });

    expect(handled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://api.telegram.org/bottest-token/sendMessage', {
      method: 'POST',
      signal: expect.any(AbortSignal) as AbortSignal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: -100123,
        text: '你没有权限查看待审核入群申请。',
      }),
    });

    vi.unstubAllGlobals();
  });
});
