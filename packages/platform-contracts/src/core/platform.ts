export type Platform = 'telegram' | 'discord' | 'matrix' | 'qq';

export type IsoDateTimeString = string;

export type PlatformEventEnvelope<TPayload = unknown> = {
  platform: Platform;
  eventType: string;
  rawEventId: string;
  receivedAt: IsoDateTimeString;
  payload: TPayload;
};
