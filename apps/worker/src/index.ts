import type { WorkerBindings } from './app/env.js';
import { createHttpApp } from './http/index.js';
import { consumePlatformEvents } from './queue/consumer.js';

const app = createHttpApp();

export default {
  fetch: app.fetch,
  queue: consumePlatformEvents,
} satisfies ExportedHandler<WorkerBindings, unknown>;
