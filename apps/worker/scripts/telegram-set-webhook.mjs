const requiredEnvNames = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_URL', 'TELEGRAM_WEBHOOK_SECRET'];

const allowedUpdates = ['message', 'callback_query', 'chat_join_request', 'chat_member', 'my_chat_member'];

const readRequiredEnv = (name) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`缺少环境变量：${name}`);
  }

  return value;
};

const readDropPendingUpdates = () => {
  return process.env.TELEGRAM_DROP_PENDING_UPDATES === 'true';
};

const readDryRun = () => {
  return process.env.TELEGRAM_SET_WEBHOOK_DRY_RUN === 'true';
};

const validateWebhookUrl = (url) => {
  const parsed = new URL(url);

  if (parsed.protocol !== 'https:') {
    throw new Error('TELEGRAM_WEBHOOK_URL 必须使用 https:// 开头');
  }

  if (!parsed.pathname.endsWith('/webhooks/telegram')) {
    throw new Error('TELEGRAM_WEBHOOK_URL 必须指向 /webhooks/telegram');
  }

  return parsed.toString();
};

const requestTelegram = async ({ botToken, webhookUrl, webhookSecret, dropPendingUpdates }) => {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
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

  return body;
};

const main = async () => {
  for (const name of requiredEnvNames) {
    readRequiredEnv(name);
  }

  const botToken = readRequiredEnv('TELEGRAM_BOT_TOKEN');
  const webhookUrl = validateWebhookUrl(readRequiredEnv('TELEGRAM_WEBHOOK_URL'));
  const webhookSecret = readRequiredEnv('TELEGRAM_WEBHOOK_SECRET');
  const dropPendingUpdates = readDropPendingUpdates();
  const dryRun = readDryRun();

  if (dryRun) {
    console.log('Telegram webhook dry-run 通过，未请求 Telegram API');
    console.log(`Webhook URL：${webhookUrl}`);
    console.log(`Allowed updates：${allowedUpdates.join(', ')}`);
    console.log(`Drop pending updates：${dropPendingUpdates ? 'true' : 'false'}`);
    return;
  }

  await requestTelegram({
    botToken,
    webhookUrl,
    webhookSecret,
    dropPendingUpdates,
  });

  console.log('Telegram webhook 设置成功');
  console.log(`Webhook URL：${webhookUrl}`);
  console.log(`Allowed updates：${allowedUpdates.join(', ')}`);
  console.log(`Drop pending updates：${dropPendingUpdates ? 'true' : 'false'}`);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : '未知错误';
  console.error(message);
  process.exitCode = 1;
});
