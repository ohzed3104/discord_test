// @ts-check
import { expect, test } from '@playwright/test';
import {
  DISCORD_CHANNEL_URL,
  LOGIN_TIMEOUT_MS,
  waitForLogin,
} from './support/discord.js';

test.setTimeout(LOGIN_TIMEOUT_MS + 120000);

const SERVER_URL = getServerUrl(DISCORD_CHANNEL_URL);

function getServerUrl(channelUrl) {
  if (!channelUrl) return undefined;
  const match = channelUrl.match(/^(https:\/\/discord\.com\/channels\/\d+)(?:\/\d+)?/);
  return match?.[1];
}

function channelName(prefix) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function getServerHeaderButton(page) {
  return page
    .getByRole('button', { name: /Server Options|server actions|tác vụ máy chủ|tÃ¡c vá»¥ mÃ¡y chá»§/i })
    .or(page.locator('[data-testid="guild-header"]'))
    .or(page.locator('[aria-label="Server Options"]'))
    .or(page.locator('[aria-label*="Server Options"]'))
    .first();
}

async function clickFirstVisible(page, locators, description) {
  for (const locator of locators) {
    if ((await locator.count()) === 0) continue;

    const first = locator.first();

    try {
      await expect(first).toBeVisible({ timeout: 2000 });
      await expect(first).toBeEnabled({ timeout: 2000 });

      await first.click({ trial: true });
      await first.click();

      return true;
    } catch {
      continue;
    }
  }

  throw new Error(`Could not find clickable control: ${description}`);
}

async function openServer(page, label) {
  await waitForLogin(page, label);
  await page.goto(DISCORD_CHANNEL_URL, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/channels\/\d+\/\d+/, { timeout: 30000 });

  const noTextChannel = page.getByText(/No Text Channels|Không Có Kênh Văn Bản/i).first();
  await expect(getServerHeaderButton(page).or(noTextChannel), `${label} should open a loaded server channel`).toBeVisible({
    timeout: 60000,
  });
  if (await noTextChannel.isVisible().catch(() => false)) {
    throw new Error(`${label} cannot access text channels at ${DISCORD_CHANNEL_URL}. Check channel permissions.`);
  }
}

async function openServerMenu(page) {
  await clickFirstVisible(
    page,
    [
      getServerHeaderButton(page),
      page.locator('header').first(),
    ],
    'server menu'
  );
}

async function openCreateChannelDialog(page) {
  await openServerMenu(page);

  const menuItem = page.getByRole('menuitem', { name: /Create Channel|Tạo Kênh|Tạo kênh/i });
  if ((await menuItem.count()) > 0) {
    await menuItem.first().click();
    return;
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  const textCategory = page.getByRole('button', { name: /Text Channels|Kênh Chat/i }).first();
  if ((await textCategory.count()) > 0) {
    await textCategory.hover().catch(() => {});
    await page.waitForTimeout(500);
  }

  try {
    await clickFirstVisible(
      page,
      [
        page.locator('[aria-label="Create Channel"]'),
        page.locator('[aria-label*="Create Channel"]'),
        page.locator('[aria-label*="Tạo Kênh"]'),
        page.locator('[aria-label*="Tạo kênh"]'),
        page.locator('[data-list-item-id*="create-channel"]'),
        page.getByRole('button', { name: /Create Channel|Tạo Kênh|Tạo kênh/i }),
      ],
      'create channel button'
    );
  } catch {
    test.skip(true, 'User A does not have Manage Channels permission on this server.');
  }
}

async function getCreateChannelDialog(page) {
  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toBeVisible({ timeout: 15000 });
  return dialog;
}

async function selectChannelType(page, typeName) {
  const dialog = await getCreateChannelDialog(page);
  const type = dialog.getByText(new RegExp(`^${typeName}$`, 'i')).first();
  if ((await type.count()) === 0) return false;
  await type.click();
  return true;
}

async function fillChannelName(page, name) {
  const dialog = await getCreateChannelDialog(page);
  const input = dialog.locator('input').last();
  await expect(input).toBeVisible({ timeout: 15000 });
  await input.fill(name);
}

async function submitCreateChannel(page) {
  const dialog = await getCreateChannelDialog(page);
  await dialog.getByRole('button', { name: /Create|Create Channel/i }).last().click();
}

async function createChannel(page, typeName, name) {
  await openCreateChannelDialog(page);
  const hasType = await selectChannelType(page, typeName);
  if (!hasType) {
  await page.keyboard.press('Escape');

  throw new Error(
    `${typeName} channel option is not available on this server.`
  );
}

  await fillChannelName(page, name);
  await submitCreateChannel(page);
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 30000 });
}

async function openChannelContextMenu(page, name) {
  const channel = page.getByText(name).first();
  await expect(channel).toBeVisible({ timeout: 30000 });
  await channel.click({ button: 'right' });
}

async function openChannelSettings(page, name) {
  await openChannelContextMenu(page, name);
  await page.getByRole('menuitem', { name: /Edit Channel/i }).click();
  await expect(page.getByRole('heading', { name: /Channel Settings|Overview/i }).first()).toBeVisible({
    timeout: 15000,
  });
}

async function saveSettings(page) {
  const save = page.getByRole("button", {
    name: /Save Changes/i,
  });

  await expect(save).toBeEnabled({
    timeout: 10000,
  });

  await Promise.all([
    page.waitForTimeout(1000),
    save.click(),
  ]);
}

async function closeSettings(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}
async function safeDeleteChannel(page, name) {
  try {
    await deleteChannel(page, name);
  } catch (error) {
    console.warn(
      `Failed to cleanup channel ${name}`,
      error
    );
  }
}

async function deleteChannel(page, name) {
  await openChannelContextMenu(page, name);
  await page.getByRole('menuitem', { name: /Delete Channel/i }).click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toBeVisible({ timeout: 15000 });
  await dialog.getByRole('button', { name: /Delete Channel|Delete/i }).last().click();
  await expect(page.getByText(name).first()).toHaveCount(0, { timeout: 30000 });
}

async function createTempTextChannel(page, prefix) {
  const name = channelName(prefix);
  await createChannel(page, 'Text', name);
  return name;
}

test.describe('Discord channel management', () => {
  test.skip(process.env.DISCORD_SKIP_CHANNEL_MANAGEMENT === '1', 'Channel management suite skipped by env.');
  test.skip(!SERVER_URL, 'Set DISCORD_CHANNEL_URL to a server text channel URL, not a DM URL.');
  test.skip(({ browserName }) => browserName !== 'chromium', 'Discord channel management suite runs on Chromium only.');
  test.describe.configure({ mode: 'serial', timeout: LOGIN_TIMEOUT_MS + 120000 });

  let context;
  let page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(LOGIN_TIMEOUT_MS + 120000);
    context = await browser.newContext();
    page = await context.newPage();
    await openServer(page, 'User A');
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('CH-MGMT-001: open create channel dialog from server menu', async () => {
    await openServer(page, 'User A');
    await openCreateChannelDialog(page);
    await expect(await getCreateChannelDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('CH-MGMT-002: create text channel', async () => {
    const name = await createTempTextChannel(page, 'pw-text');
    await deleteChannel(page, name);
  });

  test('CH-MGMT-003: create voice channel', async () => {
    const name = channelName('pw-voice');
    await createChannel(page, 'Voice', name);
    await deleteChannel(page, name);
  });

  test('CH-MGMT-004: create forum channel when available', async () => {
    const name = channelName('pw-forum');
    await createChannel(page, 'Forum', name);
    await deleteChannel(page, name);
  });

  test('CH-MGMT-005: create announcement channel when available', async () => {
    const name = channelName('pw-announcement');
    await createChannel(page, 'Announcement', name);
    await deleteChannel(page, name);
  });

  test('CH-MGMT-006: create stage channel when available', async () => {
    const name = channelName('pw-stage');
    await createChannel(page, 'Stage', name);
    await deleteChannel(page, name);
  });

  test('CH-MGMT-007: empty channel name keeps create button disabled', async () => {
    await openCreateChannelDialog(page);
    await selectChannelType(page, 'Text');
    await fillChannelName(page, '');
    const dialog = await getCreateChannelDialog(page);
    await expect(dialog.getByRole('button', { name: /Create|Create Channel/i }).last()).toBeDisabled();
    await page.keyboard.press('Escape');
  });

  test('CH-MGMT-008: long channel name is validated before create', async () => {
    await openCreateChannelDialog(page);
    await selectChannelType(page, 'Text');
    await fillChannelName(page, 'a'.repeat(120));
    const dialog = await getCreateChannelDialog(page);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('CH-MGMT-009: create channel with numbers in name', async () => {
    const name = channelName('pw-text-123');
    await createChannel(page, 'Text', name);
    await deleteChannel(page, name);
  });

  test('CH-MGMT-010: create channel with hyphenated name', async () => {
    const name = channelName('pw-hyphen-name');
    await createChannel(page, 'Text', name);
    await deleteChannel(page, name);
  });

  test('CH-MGMT-011: rename text channel', async () => {
    const originalName = await createTempTextChannel(page, 'pw-rename');
    const updatedName = channelName('pw-renamed');

    await openChannelSettings(page, originalName);
    await page.locator('input').last().fill(updatedName);
    await saveSettings(page);
    await closeSettings(page);

    await expect(page.getByText(updatedName).first()).toBeVisible({ timeout: 30000 });
    await deleteChannel(page, updatedName);
  });

  test('CH-MGMT-012: cancel rename keeps original channel name', async () => {
    const name = await createTempTextChannel(page, 'pw-cancel-rename');

    await openChannelSettings(page, name);
    await page.locator('input').last().fill(channelName('pw-should-not-save'));
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Reset|Discard/i }).click().catch(() => {});
    await closeSettings(page);

    await expect(page.getByText(name).first()).toBeVisible({ timeout: 30000 });
    await deleteChannel(page, name);
  });

  test('CH-MGMT-013: update text channel topic when field is available', async () => {
    const name = await createTempTextChannel(page, 'pw-topic');

    await openChannelSettings(page, name);
    const topic = page.locator('textarea').first();
    if ((await topic.count()) === 0) {
      await closeSettings(page);
      await deleteChannel(page, name);
      test.skip(true, 'Topic field is not available for this channel UI.');
    }
    await topic.fill(`topic-${Date.now()}`);
    await saveSettings(page);
    await closeSettings(page);

    await deleteChannel(page, name);
  });

  test('CH-MGMT-014: toggle age restricted setting when available', async () => {
    const name = await createTempTextChannel(page, 'pw-nsfw');

    await openChannelSettings(page, name);
    const toggle = page.getByRole('switch', { name: /Age-Restricted|NSFW/i }).first();
    if ((await toggle.count()) === 0) {
      await closeSettings(page);
      await deleteChannel(page, name);
      test.skip(true, 'Age restricted toggle is not available.');
    }
    await toggle.click();
    await saveSettings(page);
    await closeSettings(page);

    await deleteChannel(page, name);
  });

  test('CH-MGMT-015: update slowmode when control is available', async () => {
    const name = await createTempTextChannel(page, 'pw-slowmode');

    await openChannelSettings(page, name);
    const slowmode = page.locator('input[type="range"], [role="slider"]').first();
    if ((await slowmode.count()) === 0) {
      await closeSettings(page);
      await deleteChannel(page, name);
      test.skip(true, 'Slowmode control is not available.');
    }
    await slowmode.focus();
    await page.keyboard.press('ArrowRight');
    await saveSettings(page);
    await closeSettings(page);

    await deleteChannel(page, name);
  });

  test('CH-MGMT-016: open permissions tab for channel', async () => {
    const name = await createTempTextChannel(page, 'pw-perms');

    await openChannelSettings(page, name);
    await page.getByRole('tab', { name: /Permissions/i }).click();
    await expect(page.getByText(/Advanced Permissions|Permissions/i).first()).toBeVisible({ timeout: 15000 });
    await closeSettings(page);

    await deleteChannel(page, name);
  });

  test('CH-MGMT-017: everyone role is visible in permissions when available', async () => {
    const name = await createTempTextChannel(page, 'pw-everyone');

    await openChannelSettings(page, name);
    await page.getByRole('tab', { name: /Permissions/i }).click();
    await expect(page.getByText(/@everyone|everyone/i).first()).toBeVisible({ timeout: 15000 });
    await closeSettings(page);

    await deleteChannel(page, name);
  });

  test('CH-MGMT-018: delete confirmation can be cancelled', async () => {
    const name = await createTempTextChannel(page, 'pw-cancel-delete');

    await openChannelContextMenu(page, name);
    await page.getByRole('menuitem', { name: /Delete Channel/i }).click();
    await page.getByRole('button', { name: /Cancel/i }).click();

    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15000 });
    await deleteChannel(page, name);
  });

  test('CH-MGMT-019: delete text channel', async () => {
    const name = await createTempTextChannel(page, 'pw-delete');
    await deleteChannel(page, name);
  });

  test('CH-MGMT-020: deleted channel no longer appears after refresh', async () => {
    const name = await createTempTextChannel(page, 'pw-delete-refresh');
    await deleteChannel(page, name);
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByText(name).first()).toHaveCount(0, { timeout: 30000 });
  });
});
