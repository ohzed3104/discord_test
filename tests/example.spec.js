// @ts-check
import { test, expect } from '@playwright/test';

const DISCORD_APP_URL = process.env.DISCORD_APP_URL || 'https://discord.com/app';
const DISCORD_CHANNEL_URL = process.env.DISCORD_CHANNEL_URL;
const DISCORD_CHANNEL_ALT_URL = process.env.DISCORD_CHANNEL_ALT_URL;
const LOGIN_TIMEOUT_MS = Number(process.env.DISCORD_LOGIN_TIMEOUT_MS || 180000);
const SINGLE_USER_MODE = process.env.DISCORD_SINGLE_USER === '1';
const MULTIWINDOW_ENABLED = process.env.DISCORD_MULTIWINDOW === '1';
const THIRD_USER_ENABLED = process.env.DISCORD_THIRD_USER === '1';
const DISCORD_SERVER_NAME = process.env.DISCORD_SERVER_NAME || 'PW Test Server';
const DISCORD_SERVER_INVITE_URL = process.env.DISCORD_SERVER_INVITE_URL;

async function waitForLogin(page, label) {
  await page.goto(DISCORD_APP_URL, { waitUntil: 'domcontentloaded' });
  if (!page.url().includes('/channels/')) {
    await page.pause();
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
  await input.type(text);
  await page.keyboard.press('Enter');
}

async function expectMessageVisible(page, text, timeoutMs = 15000) {
  const list = getMessageList(page);
  await expect(list.getByText(text).first()).toBeVisible({ timeout: timeoutMs });
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
  test.skip(true, 'Realtime messaging suite skipped (completed).');
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

    if (!SINGLE_USER_MODE) {
      contextB = await browser.newContext();
      pageB = await contextB.newPage();
      await openChannel(pageB, 'User B');
    }
  });

  test.afterAll(async () => {
    await contextA?.close();
    await contextB?.close();
  });

  test('send/receive realtime between two users', async () => {
    test.skip(SINGLE_USER_MODE, 'Single-user mode enabled.');
    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_URL);
    const message = `pw-realtime-a-${Date.now()}`;
    await sendMessage(pageA, message);
    await expectMessageVisible(pageA, message, 20000);
    await expectMessageVisible(pageB, message, 20000);
  });

  test('sync messages across multiple windows', async () => {
    test.skip(SINGLE_USER_MODE, 'Single-user mode enabled.');
    test.skip(!MULTIWINDOW_ENABLED, 'Multiwindow test disabled.');
    const pageA2 = await contextA.newPage();
    await openChannel(pageA2, 'User A (window 2)');

    const message = `pw-sync-b-${Date.now()}`;
    await sendMessage(pageB, message);
    await expectMessageVisible(pageA, message, 20000);
    await expectMessageVisible(pageA2, message, 20000);

    await pageA2.close();
  });

  test('message order is correct', async () => {
    const messageA = `pw-order-a-${Date.now()}`;
    const messageB = `pw-order-b-${Date.now()}`;

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await sendMessage(pageA, messageA);

    if (SINGLE_USER_MODE) {
      await sendMessage(pageA, messageB);
      await expectMessageVisible(pageA, messageB);
      await expectMessageOrder(pageA, messageA, messageB);
      return;
    }

    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_URL);
    await expectMessageVisible(pageB, messageA, 20000);
    await sendMessage(pageB, messageB);
    await expectMessageVisible(pageA, messageB, 20000);

    await expectMessageOrder(pageA, messageA, messageB);
    await expectMessageOrder(pageB, messageA, messageB);
  });

  test('message history persists after refresh', async () => {
    const message = `pw-history-a-${Date.now()}`;
    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await sendMessage(pageA, message);

    if (!SINGLE_USER_MODE) {
      await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_URL);
      await expectMessageVisible(pageB, message, 20000);
    }

    await pageA.reload({ waitUntil: 'domcontentloaded' });
    await expect(getMessageList(pageA)).toBeVisible();
    await expectMessageVisible(pageA, message);
  });
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
    test.skip(SINGLE_USER_MODE, 'Single-user mode enabled.');
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
    await page.keyboard.press('Escape');
  });

  test('edit server info', async () => {
    test.skip(SINGLE_USER_MODE, 'Single-user mode enabled.');
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
