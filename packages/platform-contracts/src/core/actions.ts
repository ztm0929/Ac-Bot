import type { Platform } from './platform.js';

export type DirectMessageInput = {
  platform: Platform;
  platformAccountId: string;
  text: string;
};

export type JoinApplicationActionInput = {
  platform: Platform;
  communityId: string;
  platformAccountId: string;
  applicationId: string;
  reason?: string;
};

export type ApproveJoinApplicationInput = JoinApplicationActionInput;

export type RejectJoinApplicationInput = JoinApplicationActionInput;

export type SendAdminReviewCardInput = {
  platform: Platform;
  reviewChannelId: string;
  applicationId: string;
  summary: string;
};

export type PlatformAdapter = {
  sendDirectMessage(input: DirectMessageInput): Promise<void>;
  approveJoinApplication(input: ApproveJoinApplicationInput): Promise<void>;
  rejectJoinApplication(input: RejectJoinApplicationInput): Promise<void>;
  sendAdminReviewCard(input: SendAdminReviewCardInput): Promise<void>;
};
