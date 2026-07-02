export type WorkerEnv = {
  Bindings: {
    APP_ENV?: string;
    PLATFORM_EVENTS: Queue;
    TELEGRAM_WEBHOOK_SECRET?: string;
  };
};
