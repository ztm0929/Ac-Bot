import { afterEach, describe, expect, it, vi } from 'vitest';

import { TelegramApiError, TelegramPlatformApi } from './api.js';

const okResponse = new Response(JSON.stringify({ ok: true }), {
  status: 200,
  headers: {
    'content-type': 'application/json',
  },
});

const getRequestBody = (fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, callIndex = 0) => {
  const call = fetchMock.mock.calls[callIndex];

  if (!call) {
    throw new Error('fetch 未被调用');
  }

  const requestInit = call[1];

  if (!requestInit || typeof requestInit.body !== 'string') {
    throw new Error('fetch 请求体不是 JSON 字符串');
  }

  return JSON.parse(requestInit.body) as Record<string, unknown>;
};

describe('TelegramPlatformApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('默认 fetch 不会以 TelegramPlatformApi 实例作为 this 调用', async () => {
    let observedThis: unknown;
    const observeThis = (value: unknown) => {
      observedThis = value;
    };
    const fetchMock = vi.fn<typeof fetch>(function (this: unknown) {
      observeThis(this);
      return Promise.resolve(okResponse.clone());
    });
    vi.stubGlobal('fetch', fetchMock);

    const api = new TelegramPlatformApi('test-token');

    await api.restrictMember({
      platform: 'telegram',
      communityId: '-100123',
      platformAccountId: '456',
      mode: 'verification_locked',
    });

    // Cloudflare Workers 的 fetch 对 this 绑定更敏感；默认实现必须作为普通函数调用。
    expect(observedThis).not.toBe(api);
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

  it('调用 sendMessage 发送私聊消息', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse.clone());
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await api.sendDirectMessage({
      platform: 'telegram',
      platformAccountId: '456',
      text: '请完成验证',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://api.telegram.org/bottest-token/sendMessage', {
      method: 'POST',
      signal: expect.any(AbortSignal) as AbortSignal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: 456,
        text: '请完成验证',
      }),
    });
  });

  it('通过 sendRichMessage 渲染 Markdown 私聊消息', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse.clone());
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await api.sendDirectMessage({
      platform: 'telegram',
      platformAccountId: '456',
      text: '# 验证说明\n\n- 阅读规则\n- 回答问题',
      format: 'markdown',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://api.telegram.org/bottest-token/sendRichMessage', {
      method: 'POST',
      signal: expect.any(AbortSignal) as AbortSignal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: 456,
        rich_message: {
          markdown: '# 验证说明\n\n- 阅读规则\n- 回答问题',
        },
      }),
    });
  });

  it('通过 sendRichMessage 渲染 HTML 私聊消息', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse.clone());
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await api.sendDirectMessage({
      platform: 'telegram',
      platformAccountId: '456',
      text: '<h2>验证说明</h2><p><strong>请完成验证</strong></p>',
      format: 'html',
    });

    expect(getRequestBody(fetchMock)).toEqual({
      chat_id: 456,
      rich_message: {
        html: '<h2>验证说明</h2><p><strong>请完成验证</strong></p>',
      },
    });
  });

  it('通过 sendRichMessage 渲染行内 LaTeX 公式', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse.clone());
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await api.sendDirectMessage({
      platform: 'telegram',
      platformAccountId: '456',
      text: String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
      format: 'latex_inline',
    });

    expect(getRequestBody(fetchMock)).toEqual({
      chat_id: 456,
      rich_message: {
        html: String.raw`<tg-math>x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}</tg-math>`,
      },
    });
  });

  it('通过 sendRichMessage 渲染块级 LaTeX 并转义 HTML 特殊字符', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse.clone());
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await api.sendDirectMessage({
      platform: 'telegram',
      platformAccountId: '456',
      text: String.raw`\begin{aligned} a &< b \\ b &> c \end{aligned}`,
      format: 'latex_block',
    });

    expect(getRequestBody(fetchMock)).toEqual({
      chat_id: 456,
      rich_message: {
        html: String.raw`<tg-math-block>\begin{aligned} a &amp;&lt; b \\ b &amp;&gt; c \end{aligned}</tg-math-block>`,
      },
    });
  });

  it('优先通过私聊发送验证引导', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse.clone());
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await expect(
      api.sendVerificationPrompt({
        platform: 'telegram',
        communityId: '-100123',
        platformAccountId: '456',
        directMessageText: '请完成验证',
        groupFallbackText: '请点击机器人完成验证',
      }),
    ).resolves.toBe('direct_message');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://api.telegram.org/bottest-token/sendMessage', {
      method: 'POST',
      signal: expect.any(AbortSignal) as AbortSignal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: 456,
        text: '请完成验证',
      }),
    });
  });

  it('私聊验证引导失败时回退到群内短提示', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, description: 'Forbidden: bot was blocked by the user' }), {
          status: 403,
          headers: {
            'content-type': 'application/json',
          },
        }),
      )
      .mockResolvedValueOnce(okResponse.clone());
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await expect(
      api.sendVerificationPrompt({
        platform: 'telegram',
        communityId: '-100123',
        platformAccountId: '456',
        directMessageText: '请完成验证',
        groupFallbackText: '请点击机器人完成验证',
      }),
    ).resolves.toBe('group_fallback');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://api.telegram.org/bottest-token/sendMessage', {
      method: 'POST',
      signal: expect.any(AbortSignal) as AbortSignal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: -100123,
        text: '请点击机器人完成验证',
      }),
    });
  });

  it('验证引导可分别配置私聊 Markdown 与群内 HTML 格式', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, description: 'Forbidden: bot was blocked by the user' }), {
          status: 403,
          headers: {
            'content-type': 'application/json',
          },
        }),
      )
      .mockResolvedValueOnce(okResponse.clone());
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await expect(
      api.sendVerificationPrompt({
        platform: 'telegram',
        communityId: '-100123',
        platformAccountId: '456',
        directMessageText: '# 请完成验证',
        directMessageFormat: 'markdown',
        groupFallbackText: '<strong>请点击机器人完成验证</strong>',
        groupFallbackFormat: 'html',
      }),
    ).resolves.toBe('group_fallback');

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.telegram.org/bottest-token/sendRichMessage', {
      method: 'POST',
      signal: expect.any(AbortSignal) as AbortSignal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: 456,
        rich_message: {
          markdown: '# 请完成验证',
        },
      }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://api.telegram.org/bottest-token/sendRichMessage', {
      method: 'POST',
      signal: expect.any(AbortSignal) as AbortSignal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: -100123,
        rich_message: {
          html: '<strong>请点击机器人完成验证</strong>',
        },
      }),
    });
  });

  it('调用 restrictChatMember 完全限制未验证成员发言', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse.clone());
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await api.restrictMember({
      platform: 'telegram',
      communityId: '-100123',
      platformAccountId: '456',
      mode: 'verification_locked',
    });

    const body = getRequestBody(fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/restrictChatMember',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(body).toMatchObject({
      chat_id: -100123,
      user_id: 456,
      use_independent_chat_permissions: true,
      permissions: {
        can_send_messages: false,
        can_send_photos: false,
        can_send_videos: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
        can_react_to_messages: false,
      },
    });
  });

  it('调用 restrictChatMember 恢复观察期文本权限', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse.clone());
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await api.restoreMember({
      platform: 'telegram',
      communityId: '-100123',
      platformAccountId: '456',
      mode: 'probation_text_only',
    });

    const body = getRequestBody(fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/restrictChatMember',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(body).toMatchObject({
      chat_id: -100123,
      user_id: 456,
      use_independent_chat_permissions: true,
      permissions: {
        can_send_messages: true,
        can_send_photos: false,
        can_send_videos: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
        can_react_to_messages: false,
      },
    });
  });

  it('调用 banChatMember 后 unbanChatMember 移出成员但允许重新加入', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(okResponse.clone())
      .mockResolvedValueOnce(okResponse.clone());
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await api.removeMember({
      platform: 'telegram',
      communityId: '-100123',
      platformAccountId: '456',
      reason: '验证超时',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.telegram.org/bottest-token/banChatMember', {
      method: 'POST',
      signal: expect.any(AbortSignal) as AbortSignal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: -100123,
        user_id: 456,
        revoke_messages: false,
      }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://api.telegram.org/bottest-token/unbanChatMember', {
      method: 'POST',
      signal: expect.any(AbortSignal) as AbortSignal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: -100123,
        user_id: 456,
        only_if_banned: true,
      }),
    });
  });

  it('调用 banChatMember 永久拉黑成员', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse.clone());
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await api.banMember({
      platform: 'telegram',
      communityId: '-100123',
      platformAccountId: '456',
      reason: '高风险账号',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://api.telegram.org/bottest-token/banChatMember', {
      method: 'POST',
      signal: expect.any(AbortSignal) as AbortSignal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: -100123,
        user_id: 456,
        revoke_messages: false,
      }),
    });
  });

  it('调用 unbanChatMember 解除成员拉黑', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse.clone());
    const api = new TelegramPlatformApi('test-token', fetchMock);

    await api.unbanMember({
      platform: 'telegram',
      communityId: '-100123',
      platformAccountId: '456',
      reason: '管理员解除误判',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://api.telegram.org/bottest-token/unbanChatMember', {
      method: 'POST',
      signal: expect.any(AbortSignal) as AbortSignal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: -100123,
        user_id: 456,
        only_if_banned: true,
      }),
    });
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
