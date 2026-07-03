export type WorkerBindings = {
  APP_ENV?: string;
  DB: D1Database;
  PLATFORM_EVENTS: Queue;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  VERIFICATION_ANSWER_TEXT?: string;
  VERIFICATION_MAX_ANSWER_ATTEMPTS?: string;
  VERIFICATION_TIMEOUT_MINUTES?: string;
  PROBATION_MINUTES?: string;
};

export type WorkerEnv = {
  Bindings: WorkerBindings;
};
