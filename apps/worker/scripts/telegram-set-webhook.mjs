const allowedEnvironments = ['staging', 'production'];
const allowedUpdates = ['message', 'callback_query', 'chat_join_request', 'chat_member', 'my_chat_member'];
const telegramApiTimeoutMs = 10_000;

const toEnvPrefix = (environment) => {
  return environment.toUpperCase();
};

const readEnvironment = () => {
  const environment = process.argv[2];

  if (!allowedEnvironments.includes(environment)) {
    throw new Error('请明确指定环境：staging 或 production');
  }

  return environment;
};

const readRequiredEnv = (name) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`缺少环境变量：${name}`);
  }

  return value;
};

const readEnvironmentConfig = (environment) => {
  const prefix = toEnvPrefix(environment);

  return {
    botToken: readRequiredEnv(`TELEGRAM_${prefix}_BOT_TOKEN`),
    webhookUrl: validateWebhookUrl(readRequiredEnv(`TELEGRAM_${prefix}_WEBHOOK_URL`)),
    webhookSecret: readRequiredEnv(`TELEGRAM_${prefix}_WEBHOOK_SECRET`),
  };
};

const readDropPendingUpdates = (environment) => {
  const prefix = toEnvPrefix(environment);

  return process.env[`TELEGRAM_${prefix}_DROP_PENDING_UPDATES`] === 'true';
};

const readDryRun = () => {
  return process.env.TELEGRAM_SET_WEBHOOK_DRY_RUN === 'true';
};

const validateWebhookUrl = (url) => {
  const parsed = new URL(url);

  if (parsed.protocol !== 'https:') {
    throw new Error('Webhook URL 必须使用 https:// 开头');
  }

  if (!parsed.pathname.endsWith('/webhooks/telegram')) {
    throw new Error('Webhook URL 必须指向 /webhooks/telegram');
  }

  return parsed.toString();
};

const requestTelegram = async ({ botToken, webhookUrl, webhookSecret, dropPendingUpdates }) => {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), telegramApiTimeoutMs);

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      signal: abortController.signal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: allowedUpdates,
        drop_pending_updates: dropPendingUpdates,
      }),
    });

    const body = await response.json();

    if (!response.ok || body.ok !== true) {
      const description = typeof body.description === 'string' ? body.description : 'Telegram 未返回错误说明';
      throw new Error(`Telegram setWebhook 失败：${description}`);
    }
  } finally {
    clearTimeout(timeout);
  }
};

const printResult = ({ environment, webhookUrl, dropPendingUpdates, dryRun }) => {
  console.log(dryRun ? 'Telegram webhook dry-run 通过，未请求 Telegram API' : 'Telegram webhook 设置成功');
  console.log(`环境：${environment}`);
  console.log(`Webhook URL：${webhookUrl}`);
  console.log(`Allowed updates：${allowedUpdates.join(', ')}`);
  console.log(`Drop pending updates：${dropPendingUpdates ? 'true' : 'false'}`);
};

const main = async () => {
  const environment = readEnvironment();
  const { botToken, webhookUrl, webhookSecret } = readEnvironmentConfig(environment);
  const dropPendingUpdates = readDropPendingUpdates(environment);
  const dryRun = readDryRun();

  if (!dryRun) {
    await requestTelegram({
      botToken,
      webhookUrl,
      webhookSecret,
      dropPendingUpdates,
    });
  }

  printResult({
    environment,
    webhookUrl,
    dropPendingUpdates,
    dryRun,
  });
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : '未知错误';
  console.error(message);
  process.exitCode = 1;
});
