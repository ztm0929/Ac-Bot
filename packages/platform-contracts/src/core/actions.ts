import type { Platform } from './platform.js';

export type DirectMessageInput = {
  platform: Platform;
  platformAccountId: string;
  text: string;
};

export type MemberActionInput = {
  platform: Platform;
  communityId: string;
  platformAccountId: string;
  reason?: string;
};

export type MemberRestrictionMode = 'verification_locked' | 'probation_text_only';

export type MemberRestoreMode = 'probation_text_only';

export type RestrictMemberInput = MemberActionInput & {
  mode: MemberRestrictionMode;
};

export type RestoreMemberInput = MemberActionInput & {
  mode: MemberRestoreMode;
};

export type RemoveMemberInput = MemberActionInput;

export type BanMemberInput = MemberActionInput;

export type UnbanMemberInput = MemberActionInput;

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
  restrictMember(input: RestrictMemberInput): Promise<void>;
  restoreMember(input: RestoreMemberInput): Promise<void>;
  removeMember(input: RemoveMemberInput): Promise<void>;
  banMember(input: BanMemberInput): Promise<void>;
  unbanMember(input: UnbanMemberInput): Promise<void>;
  approveJoinApplication(input: ApproveJoinApplicationInput): Promise<void>;
  rejectJoinApplication(input: RejectJoinApplicationInput): Promise<void>;
  sendAdminReviewCard(input: SendAdminReviewCardInput): Promise<void>;
};
