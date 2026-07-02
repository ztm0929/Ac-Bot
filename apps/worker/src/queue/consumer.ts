import { isPlatformEventEnvelope } from '@ac-bot/platform-contracts/core';

import type { WorkerBindings } from '../app/env.js';

export const consumePlatformEvents: ExportedHandlerQueueHandler<WorkerBindings, unknown> = async (batch) => {
  for (const message of batch.messages) {
    if (!isPlatformEventEnvelope(message.body)) {
      message.ack();
      continue;
    }

    message.ack();
  }
};
