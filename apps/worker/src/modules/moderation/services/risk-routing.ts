export type VerificationRiskLevel = 'low' | 'medium' | 'high';

export type VerificationRiskDecision = {
  level: VerificationRiskLevel;
  score: number;
  reasons: string[];
};

export type VerificationRiskRoutingInput = {
  configuredRiskLevel?: string | undefined;
};

const riskScores: Record<VerificationRiskLevel, number> = {
  low: 10,
  medium: 50,
  high: 90,
};

const isVerificationRiskLevel = (input: string): input is VerificationRiskLevel => {
  return input === 'low' || input === 'medium' || input === 'high';
};

export class VerificationRiskRouter {
  decide(input: VerificationRiskRoutingInput): VerificationRiskDecision {
    const configuredRiskLevel = input.configuredRiskLevel?.trim().toLowerCase();
    const level =
      configuredRiskLevel && isVerificationRiskLevel(configuredRiskLevel)
        ? configuredRiskLevel
        : 'low';

    return {
      level,
      score: riskScores[level],
      reasons: [
        configuredRiskLevel
          ? `configured_risk_level:${configuredRiskLevel}`
          : 'configured_risk_level:low',
      ],
    };
  }
}
