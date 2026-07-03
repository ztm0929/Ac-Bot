export type WorkerBindings = {
  APP_ENV?: string;
  DB: D1Database;
  PLATFORM_EVENTS: Queue;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
};

export type WorkerEnv = {
  Bindings: WorkerBindings;
};
