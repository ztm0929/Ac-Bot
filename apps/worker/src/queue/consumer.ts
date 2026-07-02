import { isPlatformEventEnvelope } from '@ac-bot/platform-contracts/core';

import type { WorkerBindings } from '../app/env.js';
import { persistPlatformEvent } from '../platform/db/platform-events.js';

export const consumePlatformEvents: ExportedHandlerQueueHandler<WorkerBindings, unknown> = async (batch, env) => {
  for (const message of batch.messages) {
    if (!isPlatformEventEnvelope(message.body)) {
      message.ack();
      continue;
    }

    await persistPlatformEvent(env.DB, message.body);
    message.ack();
  }
};
