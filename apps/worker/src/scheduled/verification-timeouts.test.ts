import { describe, expect, it, vi } from 'vitest';

import type { WorkerBindings } from '../app/env.js';
import { runVerificationTimeoutSweep } from './verification-timeouts.js';

const createEnv = (overrides: Partial<WorkerBindings> = {}): WorkerBindings =>
  ({
    DB: {},
    PLATFORM_EVENTS: {},
    TELEGRAM_BOT_TOKEN: 'test-token',
    ...overrides,
  }) as WorkerBindings;

const timedOutSession = {
  sessionId: 'session-1',
  communityId: '-100123',
  platform: 'telegram' as const,
  platformAccountId: '456',
  timeoutCount: 1,
};

describe('runVerificationTimeoutSweep', () => {
  it('扫描超时验证并移出未达到拉黑阈值的成员', async () => {
    const handleExpiredVerificationSessions = vi.fn().mockResolvedValue({
      processedCount: 1,
      timedOutSessions: [timedOutSession],
    });
    const removeTimedOutMember = vi.fn().mockResolvedValue(undefined);
    const banTimedOutMember = vi.fn().mockResolvedValue(undefined);

    await expect(
      runVerificationTimeoutSweep(createEnv(), {
        handleExpiredVerificationSessions,
        removeTimedOutMember,
        banTimedOutMember,
      }),
    ).resolves.toEqual({
      processedCount: 1,
      timedOutSessions: [timedOutSession],
    });
    expect(handleExpiredVerificationSessions).toHaveBeenCalledWith({
      platform: 'telegram',
      batchSize: 100,
      maxVerificationTimeouts: 5,
    });
    expect(removeTimedOutMember).toHaveBeenCalledWith({
      ...timedOutSession,
      reason: 'verification_timeout',
    });
    expect(banTimedOutMember).not.toHaveBeenCalled();
  });

  it('达到累计超时阈值时对平台成员执行永久封禁', async () => {
    const bannedSession = {
      ...timedOutSession,
      timeoutCount: 5,
      banId: 'ban-1',
    };
    const handleExpiredVerificationSessions = vi.fn().mockResolvedValue({
      processedCount: 1,
      timedOutSessions: [bannedSession],
    });
    const removeTimedOutMember = vi.fn().mockResolvedValue(undefined);
    const banTimedOutMember = vi.fn().mockResolvedValue(undefined);

    await runVerificationTimeoutSweep(createEnv(), {
      handleExpiredVerificationSessions,
      removeTimedOutMember,
      banTimedOutMember,
    });

    expect(banTimedOutMember).toHaveBeenCalledWith({
      ...bannedSession,
      reason: 'verification_timeout_limit_exceeded',
    });
    expect(removeTimedOutMember).not.toHaveBeenCalled();
  });

  it('允许通过环境变量覆盖批量大小和累计超时阈值', async () => {
    const handleExpiredVerificationSessions = vi.fn().mockResolvedValue({
      processedCount: 0,
      timedOutSessions: [],
    });

    await runVerificationTimeoutSweep(
      createEnv({
        VERIFICATION_TIMEOUT_BATCH_SIZE: '25',
        VERIFICATION_MAX_TIMEOUTS: '7',
      }),
      {
        handleExpiredVerificationSessions,
        removeTimedOutMember: vi.fn().mockResolvedValue(undefined),
        banTimedOutMember: vi.fn().mockResolvedValue(undefined),
      },
    );

    expect(handleExpiredVerificationSessions).toHaveBeenCalledWith({
      platform: 'telegram',
      batchSize: 25,
      maxVerificationTimeouts: 7,
    });
  });

  it('没有超时成员时不调用平台治理动作', async () => {
    const removeTimedOutMember = vi.fn().mockResolvedValue(undefined);
    const banTimedOutMember = vi.fn().mockResolvedValue(undefined);

    await runVerificationTimeoutSweep(createEnv(), {
      handleExpiredVerificationSessions: vi.fn().mockResolvedValue({
        processedCount: 0,
        timedOutSessions: [],
      }),
      removeTimedOutMember,
      banTimedOutMember,
    });

    expect(removeTimedOutMember).not.toHaveBeenCalled();
    expect(banTimedOutMember).not.toHaveBeenCalled();
  });
});
