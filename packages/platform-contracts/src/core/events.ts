import type { IsoDateTimeString, Platform } from './platform.js';

export type CoreEventType =
  | 'join_application.created'
  | 'join_application.risk_scored'
  | 'verification.session_created'
  | 'verification.answer_received'
  | 'verification.completed'
  | 'member.approved'
  | 'member.rejected'
  | 'member.joined'
  | 'member.probation_started'
  | 'member.probation_finished'
  | 'admin.action_created';

export type CoreEventEnvelope<TPayload = unknown> = {
  eventId: string;
  eventType: CoreEventType;
  occurredAt: IsoDateTimeString;
  payload: TPayload;
};

export type JoinApplicationCreatedPayload = {
  platform: Platform;
  platformAccountId: string;
  communityId: string;
  applicationId: string;
  sourceId?: string;
};

export type MemberJoinedPayload = {
  platform: Platform;
  platformAccountId: string;
  communityId: string;
  joinedAt: IsoDateTimeString;
};

export type VerificationAnswerReceivedPayload = {
  platform: Platform;
  platformAccountId: string;
  answerText: string;
  answeredAt: IsoDateTimeString;
};
