// @ts-check
import { expect } from '@playwright/test';

export const DISCORD_APP_URL = process.env.DISCORD_APP_URL || 'https://discord.com/app';
export const DISCORD_CHANNEL_URL = process.env.DISCORD_CHANNEL_URL;
export const DISCORD_CHANNEL_ALT_URL = process.env.DISCORD_CHANNEL_ALT_URL;
export const LOGIN_TIMEOUT_MS = Number(process.env.DISCORD_LOGIN_TIMEOUT_MS || 180000);
export const DISCORD_SERVER_NAME = process.env.DISCORD_SERVER_NAME || 'PW Test Server';
export const DISCORD_SERVER_INVITE_URL = process.env.DISCORD_SERVER_INVITE_URL;

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

export async function waitForLogin(page, label) {
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

export function getMessageList(page) {
  return page
    .locator(
      'ol[aria-label="Messages"], div[role="log"], [data-list-id="chat-messages"], main [role="log"]'
    )
    .first();
}

function getVisibleMessages(page) {
  return getMessageList(page).locator('[id^="chat-messages-"], [role="article"], li');
}

export async function getMessageInput(page) {
  const slate = page.locator('div[role="textbox"][data-slate-editor="true"]');
  if (await slate.count()) {
    return slate.first();
  }
  return page.locator('[role="textbox"]').last();
}

export async function openChannel(page, label) {
  await openChannelUrl(page, label, DISCORD_CHANNEL_URL);
}

export async function openChannelUrl(page, label, url) {
  await waitForLogin(page, label);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const noTextChannel = page.getByText(/No Text Channels|Không Có Kênh Văn Bản/i).first();
  let input = await getMessageInput(page);

  const inputVisible = await input.waitFor({ state: 'visible', timeout: 5000 }).then(
    () => true,
    () => false
  );
  if (!inputVisible && !(await noTextChannel.isVisible().catch(() => false))) {
    const firstTextChannel = page.locator('a[href^="/channels/"]:not([href^="/channels/@me"])').first();
    if (await firstTextChannel.isVisible().catch(() => false)) {
      await firstTextChannel.click();
      input = await getMessageInput(page);
    }
  }

  await expect(input.or(noTextChannel), `${label} should open a text channel: ${url}`).toBeVisible({
    timeout: 30000,
  });
  if (await noTextChannel.isVisible().catch(() => false)) {
    throw new Error(`${label} cannot access a text channel at ${url}. Check DISCORD_CHANNEL_URL permissions.`);
  }
  await expect(getMessageList(page)).toBeVisible({ timeout: 20000 });
}

export async function sendMessage(page, text) {
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

export async function expectMessageVisible(page, text, timeoutMs = 15000) {
  const list = getMessageList(page);
  await expect(list.getByText(text).first()).toBeVisible({ timeout: timeoutMs });
}

export async function expectMessagePartsVisible(page, parts, timeoutMs = 15000) {
  const list = getMessageList(page);
  for (const part of parts) {
    await expect(list.getByText(part).first()).toBeVisible({ timeout: timeoutMs });
  }
}

async function expectMessageWithPartsVisible(page, marker, parts, timeoutMs = 15000) {
  const message = getVisibleMessages(page).filter({ hasText: marker }).last();
  await expect(message).toBeVisible({ timeout: timeoutMs });
  await expect
    .poll(async () => {
      const text = await message.textContent();
      return parts.every((part) => text?.includes(part));
    }, { timeout: timeoutMs })
    .toBeTruthy();
}

export async function expectMessageNotSent(pageA, pageB, text) {
  const beforeA = await getVisibleMessages(pageA).count();
  const probe = text.trim() ? text.slice(0, 80) : '';

  await sendMessage(pageA, text);

  if (probe) {
    await expect
      .poll(async () => getVisibleMessages(pageA).filter({ hasText: probe }).count(), { timeout: 3000 })
      .toBe(0);
    await expect
      .poll(async () => getVisibleMessages(pageB).filter({ hasText: probe }).count(), { timeout: 3000 })
      .toBe(0);
  } else {
    await expect.poll(async () => getVisibleMessages(pageA).count(), { timeout: 3000 }).toBe(beforeA);
  }

  await clearMessageInput(pageA);
}

export async function expectMessageRejectedBySender(pageA, pageB, text) {
  const probe = text.slice(0, 80);

  await sendMessage(pageA, text);

  const tooLongDialog = pageA
    .getByRole('dialog')
    .filter({ hasText: /Tin nhắn của bạn quá dài|Your message is too long/i })
    .first();
  await expect(tooLongDialog).toBeVisible({ timeout: 10000 });
  await expect(tooLongDialog).toContainText(/2000/);

  await pageB.waitForTimeout(3000);
  await expect(getVisibleMessages(pageA).filter({ hasText: probe })).toHaveCount(0);
  await expect(getVisibleMessages(pageB).filter({ hasText: probe })).toHaveCount(0);

  const closeButton = tooLongDialog.getByRole('button', { name: /Tắt|Close|Cancel/i }).first();
  if (await closeButton.count()) {
    await closeButton.click();
  } else {
    await pageA.keyboard.press('Escape');
  }
  await clearMessageInput(pageA);
}

export async function sendFromAToBAndExpect(pageA, pageB, name, input, expectedParts = [input]) {
  const marker = `pw-${name}-${Date.now()}`;
  const message = `${marker}\n${input}`;

  await sendMessage(pageA, message);
  await expectMessageWithPartsVisible(pageA, marker, expectedParts, 20000);
  await expectMessageWithPartsVisible(pageB, marker, expectedParts, 20000);

  return marker;
}

export async function sendFromBToAAndExpect(pageA, pageB, name, input, expectedParts = [input]) {
  const marker = `pw-${name}-${Date.now()}`;
  const message = `${marker}\n${input}`;

  await sendMessage(pageB, message);
  await expectMessageWithPartsVisible(pageB, marker, expectedParts, 20000);
  await expectMessageWithPartsVisible(pageA, marker, expectedParts, 20000);

  return marker;
}

export async function expectMessageOrder(page, firstText, secondText) {
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

export async function openAddServerDialog(page) {
  const candidates = [
    page.locator(
      '[aria-label="Add a Server"], [aria-label="Add Server"], [aria-label="Thêm Máy Chủ"], [data-testid="guildsnav-addguild"], [data-list-item-id="guildsnav___create-join-button"]'
    ),
    page.getByRole('button', { name: /Add a Server|Add Server|Add/i }),
    page.getByRole('treeitem', { name: /Add a Server|Add Server|Thêm Máy Chủ|ThÃªm MÃ¡y Chá»§/i }),
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
  const localizedButton = localizedNav
    .first()
    .locator(
      '[aria-label*="Add a Server"], [aria-label*="Add Server"], [aria-label*="Thêm Máy Chủ"], [aria-label*="ThÃªm MÃ¡y Chá»§"], [role="treeitem"][aria-label*="Add"], [role="treeitem"][aria-label*="Thêm"], [role="treeitem"][aria-label*="ThÃªm"], button, [role="button"]'
    )
    .last();
  await expect(localizedButton).toBeVisible({ timeout: 15000 });
  await localizedButton.click();
}

export async function createServer(page, name) {
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
  const serverMenu = page
    .locator('[aria-label="Server Options"], [aria-label*="Server Options"], [data-testid="guild-header"]')
    .first();
  await expect(serverMenu).toBeVisible({ timeout: 15000 });
  await serverMenu.click();
  await page.getByRole('menuitem', { name: /Server Settings/i }).click();
  await page.getByRole('tab', { name: /Overview/i }).click();
}

export async function updateServerName(page, name) {
  await openServerSettings(page);
  const nameInput = page.getByLabel(/Server Name/i);
  await expect(nameInput).toBeVisible();
  await nameInput.fill(name);
  const saveButton = page.getByRole('button', { name: /Save Changes/i });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await page.keyboard.press('Escape');
}
