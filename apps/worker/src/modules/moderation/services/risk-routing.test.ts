import { describe, expect, it } from 'vitest';

import { VerificationRiskRouter } from './risk-routing.js';

describe('VerificationRiskRouter', () => {
  it('没有配置风险等级时默认判定为低风险', () => {
    const router = new VerificationRiskRouter();

    expect(router.decide({})).toEqual({
      level: 'low',
      score: 10,
      reasons: ['configured_risk_level:low'],
    });
  });

  it('允许通过配置强制进入中风险或高风险路径', () => {
    const router = new VerificationRiskRouter();

    expect(router.decide({ configuredRiskLevel: 'medium' })).toEqual({
      level: 'medium',
      score: 50,
      reasons: ['configured_risk_level:medium'],
    });
    expect(router.decide({ configuredRiskLevel: 'high' })).toEqual({
      level: 'high',
      score: 90,
      reasons: ['configured_risk_level:high'],
    });
  });

  it('无法识别的配置会回退到低风险，避免误把真人送入封禁路径', () => {
    const router = new VerificationRiskRouter();

    expect(router.decide({ configuredRiskLevel: 'unexpected' })).toEqual({
      level: 'low',
      score: 10,
      reasons: ['configured_risk_level:unexpected'],
    });
  });
});
