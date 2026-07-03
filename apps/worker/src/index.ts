import type { WorkerBindings } from './app/env.js';
import { createHttpApp } from './http/index.js';
import { consumePlatformEvents } from './queue/consumer.js';
import { handleScheduledVerificationTimeouts } from './scheduled/verification-timeouts.js';

const app = createHttpApp();

export default {
  fetch: app.fetch,
  queue: consumePlatformEvents,
  scheduled: handleScheduledVerificationTimeouts,
} satisfies ExportedHandler<WorkerBindings, unknown>;
