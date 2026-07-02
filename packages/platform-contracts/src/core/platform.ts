export const platforms = ['telegram', 'discord', 'matrix', 'qq'] as const;

export type Platform = (typeof platforms)[number];

export type IsoDateTimeString = string;

export type PlatformEventEnvelope<TPayload = unknown> = {
  platform: Platform;
  eventType: string;
  rawEventId: string;
  receivedAt: IsoDateTimeString;
  payload: TPayload;
};

const isRecord = (input: unknown): input is Record<string, unknown> => {
  return typeof input === 'object' && input !== null;
};

export const isPlatform = (input: unknown): input is Platform => {
  return typeof input === 'string' && platforms.some((platform) => platform === input);
};

export const isPlatformEventEnvelope = (input: unknown): input is PlatformEventEnvelope => {
  if (!isRecord(input)) {
    return false;
  }

  return (
    isPlatform(input.platform) &&
    typeof input.eventType === 'string' &&
    input.eventType.length > 0 &&
    typeof input.rawEventId === 'string' &&
    input.rawEventId.length > 0 &&
    typeof input.receivedAt === 'string' &&
    Number.isFinite(Date.parse(input.receivedAt)) &&
    Object.hasOwn(input, 'payload')
  );
};
