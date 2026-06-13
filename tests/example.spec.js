// @ts-check
import { test, expect } from '@playwright/test';

const DISCORD_APP_URL = process.env.DISCORD_APP_URL || 'https://discord.com/app';
const DISCORD_CHANNEL_URL = process.env.DISCORD_CHANNEL_URL;
const DISCORD_CHANNEL_ALT_URL = process.env.DISCORD_CHANNEL_ALT_URL;
const LOGIN_TIMEOUT_MS = Number(process.env.DISCORD_LOGIN_TIMEOUT_MS || 180000);
const DISCORD_SERVER_NAME = process.env.DISCORD_SERVER_NAME || 'PW Test Server';
const DISCORD_SERVER_INVITE_URL = process.env.DISCORD_SERVER_INVITE_URL;

test.setTimeout(LOGIN_TIMEOUT_MS + 60000);

function getDiscordCredentials(label) {
  if (label.includes('User C')) {
    return {
      email: process.env.DISCORD_USER_C_EMAIL,
      password: process.env.DISCORD_USER_C_PASSWORD,
    };
  }

  if (label.includes('User B')) {
    return {
      email: process.env.DISCORD_USER_B_EMAIL,
      password: process.env.DISCORD_USER_B_PASSWORD,
    };
  }

  return {
    email: process.env.DISCORD_USER_A_EMAIL,
    password: process.env.DISCORD_USER_A_PASSWORD,
  };
}

async function loginWithEnvCredentials(page, label) {
  const { email, password } = getDiscordCredentials(label);
  if (!email || !password) {
    await page.pause();
    return;
  }

  const emailInput = page.locator('input[name="email"]').first();
  const passwordInput = page.locator('input[name="password"]').first();

  await expect(emailInput, `${label} email input should be visible`).toBeVisible({
    timeout: LOGIN_TIMEOUT_MS,
  });
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.getByRole('button', { name: /log in|đăng nhập/i }).click();
}

async function waitForLogin(page, label) {
  await page.goto(DISCORD_APP_URL, { waitUntil: 'domcontentloaded' });

  const loginForm = page.locator('input[name="email"]').first();
  await Promise.race([
    page.waitForURL(/\/channels\//, { timeout: LOGIN_TIMEOUT_MS }).catch(() => {}),
    loginForm.waitFor({ state: 'visible', timeout: LOGIN_TIMEOUT_MS }).catch(() => {}),
  ]);

  if (!page.url().includes('/channels/')) {
    await loginWithEnvCredentials(page, label);
    await page.waitForURL(/\/channels\//, { timeout: LOGIN_TIMEOUT_MS });
  }
  await expect(page, `${label} should be logged in`).toHaveURL(/\/channels\//);
}

function getMessageList(page) {
  return page
    .locator(
      'ol[aria-label="Messages"], div[role="log"], [data-list-id="chat-messages"], main [role="log"]'
    )
    .first();
}

function getVisibleMessages(page) {
  return getMessageList(page).locator('[id^="chat-messages-"], [role="article"], li');
}

async function getMessageInput(page) {
  const slate = page.locator('div[role="textbox"][data-slate-editor="true"]');
  if (await slate.count()) {
    return slate.first();
  }
  return page.locator('[role="textbox"]').last();
}

async function openChannel(page, label) {
  await openChannelUrl(page, label, DISCORD_CHANNEL_URL);
}

async function openChannelUrl(page, label, url) {
  await waitForLogin(page, label);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const input = await getMessageInput(page);
  await expect(input).toBeVisible({ timeout: 20000 });
  await expect(getMessageList(page)).toBeVisible({ timeout: 20000 });
}

async function sendMessage(page, text) {
  const input = await getMessageInput(page);
  await input.click();
  if (text) {
    await page.keyboard.insertText(text);
  }
  await page.keyboard.press('Enter');
}

async function clearMessageInput(page) {
  const input = await getMessageInput(page);
  await input.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
}

async function expectMessageVisible(page, text, timeoutMs = 15000) {
  const list = getMessageList(page);
  await expect(list.getByText(text).first()).toBeVisible({ timeout: timeoutMs });
}

async function expectMessagePartsVisible(page, parts, timeoutMs = 15000) {
  const list = getMessageList(page);
  for (const part of parts) {
    await expect(list.getByText(part).first()).toBeVisible({ timeout: timeoutMs });
  }
}

async function expectBlankMessageNotSent(pageA, pageB, text) {
  const beforeA = await getVisibleMessages(pageA).count();
  const beforeB = await getVisibleMessages(pageB).count();

  await sendMessage(pageA, text);

  await expect
    .poll(async () => getVisibleMessages(pageA).count(), { timeout: 3000 })
    .toBe(beforeA);
  await expect
    .poll(async () => getVisibleMessages(pageB).count(), { timeout: 3000 })
    .toBe(beforeB);
  await clearMessageInput(pageA);
}

async function expectMessageOrder(page, firstText, secondText) {
  const first = getMessageList(page).getByText(firstText).first();
  const second = getMessageList(page).getByText(secondText).first();
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();

  const firstHandle = await first.elementHandle();
  const secondHandle = await second.elementHandle();
  const isInOrder = await page.evaluate(([a, b]) => {
    if (!a || !b) return false;
    return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  }, [firstHandle, secondHandle]);
  expect(isInOrder).toBeTruthy();
}

async function openAddServerDialog(page) {
  const candidates = [
    page.locator(
      '[aria-label="Add a Server"], [aria-label="Add Server"], [aria-label="Thêm Máy Chủ"], [data-testid="guildsnav-addguild"], [data-list-item-id="guildsnav___create-join-button"]'
    ),
    page.getByRole('button', { name: /Add a Server|Add Server|Add/i }),
    page.locator('nav[aria-label="Servers"] [role="button"]').last(),
  ];

  for (const locator of candidates) {
    if ((await locator.count()) > 0) {
      await locator.first().click();
      return;
    }
  }

  const serversNav = page.locator('nav[aria-label="Servers"]');
  if (await serversNav.count()) {
    await expect(serversNav).toBeVisible({ timeout: 15000 });
    const fallbackButton = serversNav.locator('button, [role="button"]').last();
    await expect(fallbackButton).toBeVisible({ timeout: 15000 });
    await fallbackButton.click();
    return;
  }

  const localizedNav = page.locator(
    'nav[aria-label*="Server"], nav[aria-label*="Máy chủ"], nav[aria-label*="May chu"], [data-list-id="guildsnav"], [data-testid="guildsnav"]'
  );
  await expect(localizedNav.first()).toBeVisible({ timeout: 15000 });
  const localizedButton = localizedNav.first().locator('button, [role="button"]').last();
  await expect(localizedButton).toBeVisible({ timeout: 15000 });
  await localizedButton.click();
}

async function createServer(page, name) {
  await openAddServerDialog(page);
  await page.getByRole('button', { name: /Create My Own|Tạo Mẫu Riêng/i }).click();
  await page
    .getByRole('button', { name: /For me and my friends|Dành cho tôi và bạn bè tôi|For a club or community/i })
    .click();
  const nameInput = page.locator('input[label="Tên máy chủ"]').first();
  await expect(nameInput).toBeVisible();
  await nameInput.fill(name);
  const createButton = page.getByRole('button', { name: /^Create$|^Tạo$/i });
  await expect(createButton).toBeEnabled();
  await createButton.click();
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 15000 });
}

async function openServerSettings(page) {
  const serverMenu = page.locator('[aria-label="Server Options"], [aria-label*="Server Options"], [data-testid="guild-header"]').first();
  await expect(serverMenu).toBeVisible({ timeout: 15000 });
  await serverMenu.click();
  await page.getByRole('menuitem', { name: /Server Settings/i }).click();
  await page.getByRole('tab', { name: /Overview/i }).click();
}

async function updateServerName(page, name) {
  await openServerSettings(page);
  const nameInput = page.getByLabel(/Server Name/i);
  await expect(nameInput).toBeVisible();
  await nameInput.fill(name);
  const saveButton = page.getByRole('button', { name: /Save Changes/i });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await page.keyboard.press('Escape');
}

test.describe('Discord realtime messaging', () => {
  // test.skip(true, 'Realtime messaging suite skipped (completed).');
  test.skip(!DISCORD_CHANNEL_URL, 'Set DISCORD_CHANNEL_URL to a channel or DM URL.');
  test.describe.configure({ mode: 'serial' });

  let contextA;
  let contextB;
  let pageA;
  let pageB;

  test.beforeAll(async ({ browser }) => {
    contextA = await browser.newContext();
    pageA = await contextA.newPage();
    await openChannel(pageA, 'User A');

    contextB = await browser.newContext();
    pageB = await contextB.newPage();
    await openChannel(pageB, 'User B');
  });

  test.afterAll(async () => {
    await contextA?.close();
    await contextB?.close();
  });

  test('send/receive realtime between two users', async () => {
    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_URL);

    const runId = Date.now();
    const messageCases = [
      {
        name: 'short text',
        input: 'hello',
      },
      {
        name: 'leading and trailing spaces',
        input: '  hello  ',
      },
      {
        name: 'multiple lines',
        input: 'line 1\nline 2\nline 3',
        expectedParts: ['line 1', 'line 2', 'line 3'],
      },
      {
        name: 'long text',
        input: `long-${'a'.repeat(800)}`,
      },
      {
        name: 'numbers only',
        input: '12345678901234567890',
      },
      {
        name: 'special characters',
        input: '!@#$%^&*()_+-=[]{}',
      },
      {
        name: 'vietnamese text',
        input: 'Xin chào, kiểm thử tiếng Việt',
      },
      {
        name: 'unicode and emoji',
        input: 'Hello 😀🔥✅',
        expectedParts: ['Hello'],
      },
      {
        name: 'near discord message limit',
        input: `near-limit-${'x'.repeat(1850)}`,
      },
      {
        name: 'consecutive newlines',
        input: 'first line\n\n\nlast line',
        expectedParts: ['first line', 'last line'],
      },
      {
        name: 'copied markdown format',
        input: '**bold text**\n- item one\n`inline code`\nhttps://example.com',
        expectedParts: ['bold text', 'item one', 'inline code', 'https://example.com'],
      },
    ];

    for (const messageCase of messageCases) {
      const marker = `pw-realtime-${runId}-${messageCase.name}`;
      const message = `${marker}\n${messageCase.input}`;
      await sendMessage(pageA, message);

      const expectedParts = [marker, ...(messageCase.expectedParts || [messageCase.input])];
      await expectMessagePartsVisible(pageA, expectedParts, 20000);
      await expectMessagePartsVisible(pageB, expectedParts, 20000);
    }

    await expectBlankMessageNotSent(pageA, pageB, '');
    await expectBlankMessageNotSent(pageA, pageB, '     ');
  });

  // test('sync messages across multiple windows', async () => {
  //   const pageA2 = await contextA.newPage();
  //   await openChannel(pageA2, 'User A (window 2)');

  //   const message = `pw-sync-b-${Date.now()}`;
  //   await sendMessage(pageB, message);
  //   await expectMessageVisible(pageA, message, 20000);
  //   await expectMessageVisible(pageA2, message, 20000);

  //   await pageA2.close();
  // });

  // test('message order is correct', async () => {
  //   const messageA = `pw-order-a-${Date.now()}`;
  //   const messageB = `pw-order-b-${Date.now()}`;

  //   await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
  //   await sendMessage(pageA, messageA);

  //   await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_URL);
  //   await expectMessageVisible(pageB, messageA, 20000);
  //   await sendMessage(pageB, messageB);
  //   await expectMessageVisible(pageA, messageB, 20000);

  //   await expectMessageOrder(pageA, messageA, messageB);
  //   await expectMessageOrder(pageB, messageA, messageB);
  // });

  // test('message history persists after refresh', async () => {
  //   const message = `pw-history-a-${Date.now()}`;
  //   await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
  //   await sendMessage(pageA, message);

  //   await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_URL);
  //   await expectMessageVisible(pageB, message, 20000);

  //   await pageA.reload({ waitUntil: 'domcontentloaded' });
  //   await expect(getMessageList(pageA)).toBeVisible();
  //   await expectMessageVisible(pageA, message);
  // });
});

test.describe('Discord channel management', () => {
  test.skip(true, 'Channel management suite skipped (completed).');
  test.skip(!DISCORD_CHANNEL_URL, 'Set DISCORD_CHANNEL_URL to a channel or DM URL.');
  test.skip(!DISCORD_CHANNEL_ALT_URL, 'Set DISCORD_CHANNEL_ALT_URL to another channel URL.');
  test.describe.configure({ mode: 'serial' });

  let contextA;
  let contextB;
  let pageA;
  let pageB;

  test.beforeAll(async ({ browser }) => {
    contextA = await browser.newContext();
    contextB = await browser.newContext();
    pageA = await contextA.newPage();
    pageB = await contextB.newPage();

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_URL);
  });

  test.afterAll(async () => {
    await contextA?.close();
    await contextB?.close();
  });

  test('switch channels and see correct content', async () => {
    const mainMessage = `pw-channel-main-${Date.now()}`;
    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_URL);
    await sendMessage(pageA, mainMessage);
    await expectMessageVisible(pageB, mainMessage, 20000);

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_ALT_URL);
    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_ALT_URL);
    await expect(getMessageList(pageA).getByText(mainMessage)).toHaveCount(0);

    const altMessage = `pw-channel-alt-${Date.now()}`;
    await sendMessage(pageB, altMessage);
    await expectMessageVisible(pageA, altMessage, 20000);

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await expect(getMessageList(pageA).getByText(altMessage)).toHaveCount(0);
  });

  test('new messages update in real time per channel', async () => {
    const mainMessage = `pw-channel-rt-main-${Date.now()}`;
    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_URL);
    await sendMessage(pageB, mainMessage);
    await expectMessageVisible(pageA, mainMessage, 20000);

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_ALT_URL);
    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_ALT_URL);
    const altMessage = `pw-channel-rt-alt-${Date.now()}`;
    await sendMessage(pageA, altMessage);
    await expectMessageVisible(pageB, altMessage, 20000);
  });
});

test.describe('Discord server management', () => {
  test.skip(!DISCORD_CHANNEL_URL, 'Set DISCORD_CHANNEL_URL to a channel or DM URL.');
  test.describe.configure({ mode: 'serial' });

  let contextA;
  let contextB;
  let pageA;
  let pageB;

  test.beforeAll(async ({ browser }) => {
    contextA = await browser.newContext();
    contextB = await browser.newContext();
    pageA = await contextA.newPage();
    pageB = await contextB.newPage();

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_URL);
  });

  test.afterAll(async () => {
    await contextA?.close();
    await contextB?.close();
  });

  test('create new server with valid info', async () => {
    await createServer(pageA, `${DISCORD_SERVER_NAME} ${Date.now()}`);
  });

  test('validate empty server name', async () => {
    await openAddServerDialog(pageA);
    await pageA.getByRole('button', { name: /Create My Own|Tạo Mẫu Riêng/i }).click();
    await pageA
      .getByRole('button', { name: /For me and my friends|Dành cho tôi và bạn bè tôi|For a club or community/i })
      .click();
    const createButton = pageA.getByRole('button', { name: /^Create$|^Tạo$/i });
    await expect(createButton).toBeDisabled();
    await pageA.keyboard.press('Escape');
  });

  test('edit server info', async () => {
    const updatedName = `${DISCORD_SERVER_NAME} Updated ${Date.now()}`;
    await updateServerName(pageA, updatedName);
    await expect(pageA.getByText(updatedName).first()).toBeVisible({ timeout: 15000 });
  });

  test('join server via invite link', async () => {
    test.skip(!DISCORD_SERVER_INVITE_URL, 'Set DISCORD_SERVER_INVITE_URL to enable join tests.');
    await pageB.goto(DISCORD_SERVER_INVITE_URL, { waitUntil: 'domcontentloaded' });
    await pageB.getByRole('button', { name: /Accept Invite|Join/i }).click();
    await expect(pageB.getByText(/Welcome|joined|Server/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('new server appears after join', async () => {
    test.skip(!DISCORD_SERVER_INVITE_URL, 'Set DISCORD_SERVER_INVITE_URL to enable join tests.');
    const serverEntry = pageB.getByText(DISCORD_SERVER_NAME).first();
    await expect(serverEntry).toBeVisible({ timeout: 15000 });
  });
});
