import type { PlatformEventEnvelope } from '@ac-bot/platform-contracts/core';

import type { WorkerBindings } from '../app/env.js';

export const consumePlatformEvents: ExportedHandlerQueueHandler<WorkerBindings, PlatformEventEnvelope> = async (
  batch,
) => {
  for (const message of batch.messages) {
    message.ack();
  }
};
