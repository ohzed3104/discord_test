// @ts-check
import { expect, test } from '@playwright/test';

import {
  DISCORD_CHANNEL_URL,
  DISCORD_SERVER_NAME,
  LOGIN_TIMEOUT_MS,
  openAddServerDialog,
  waitForLogin,
} from './support/discord.js';

const STEP_DELAY_MS = 2000;
const LONG_NAME_LENGTH = 3300;
const CREATED_LONG_NAME_PREFIX_LENGTH = 60;

test.setTimeout(LOGIN_TIMEOUT_MS + 240000);

async function waitForStep(page) {
  await page.waitForTimeout(STEP_DELAY_MS);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeServerLabel(serverName) {
  return serverName.replace(/[^\p{L}\p{N}\s-]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function getServerList(page) {
  return page
    .locator(
      '[data-list-id="guildsnav"], [data-testid="guildsnav"], nav[aria-label="Servers"], nav[aria-label*="Máy chủ"], [role="tree"][aria-label*="Server"]'
    )
    .first();
}

function getServerByName(page, serverName) {
  return getServersByName(page, serverName).first();
}

function getServersByName(page, serverName) {
  const exactName = new RegExp(`^${escapeRegExp(serverName)}$`, 'i');
  return getServerList(page)
    .locator(`[aria-label*="${serverName}"], [data-dnd-name="${serverName}"]`)
    .or(page.getByRole('treeitem', { name: exactName }))
    .or(page.getByRole('button', { name: exactName }));
}

function getCreatedServerLocator(page, serverName) {
  const exactName = page.getByText(serverName).first();

  if (serverName.length <= CREATED_LONG_NAME_PREFIX_LENGTH) {
    const normalizedName = normalizeServerLabel(serverName);
    if (normalizedName && normalizedName !== serverName) {
      return exactName.or(page.getByText(normalizedName).first()).first();
    }

    return exactName;
  }

  const visiblePrefix = serverName.slice(0, CREATED_LONG_NAME_PREFIX_LENGTH);
  return getServerList(page).getByText(visiblePrefix).or(page.getByText(visiblePrefix)).first();
}

function getServerNameInput(page) {
  return page
    .locator(
      'div[role="dialog"] input[name="guildName"], div[role="dialog"] input[type="text"], input[name="guildName"], input[aria-label*="Server Name"], input[aria-label*="Tên máy chủ"]'
    )
    .first();
}

function getCreateServerButton(page) {
  return page.getByRole('button', { name: /^Create$|^Tạo$/i }).first();
}

function getSaveChangesButton(page) {
  return page.getByRole('button', { name: /Save Changes|Lưu thay đổi/i }).first();
}

function getSettingsServerNameInput(page) {
  return page
    .locator('main input[name="name"], main input[aria-label*="Server"], main input[aria-label*="Máy chủ"]')
    .or(page.getByLabel(/^Server Name$|^Tên máy chủ$|^Tên$/i))
    .first();
}

function getValidationMessage(page) {
  return page
    .locator('[role="alert"], .errorMessage, [class*="error"], [id*="error"]')
    .or(page.getByText(/required|cannot be empty|too long|too short|invalid|length must be|bắt buộc|không được bỏ trống|quá dài|quá ngắn|không hợp lệ|độ dài phải từ/i))
    .first();
}

async function closeDialog(page) {
  await page.keyboard.press('Escape');
  await waitForStep(page);
}

async function dismissTransientUi(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
}

async function openDiscord(page, label) {
  await waitForLogin(page, label);
  if (DISCORD_CHANNEL_URL) {
    await page.goto(DISCORD_CHANNEL_URL, { waitUntil: 'domcontentloaded' });
  }
  await expect(page).toHaveURL(/\/channels\//, { timeout: 20000 });
}

async function openCreateOwnServerForm(page) {
  await openAddServerDialog(page);
  await waitForStep(page);

  await page.getByRole('button', { name: /Create My Own|Tạo Mẫu Riêng|Tự tạo/i }).click();
  await waitForStep(page);

  await page
    .getByRole('button', {
      name: /For me and my friends|For a club or community|Dành cho tôi và bạn bè|cộng đồng/i,
    })
    .first()
    .click();
  await waitForStep(page);
}

async function createServer(page, serverName) {
  await openCreateOwnServerForm(page);

  const nameInput = getServerNameInput(page);
  await expect(nameInput).toBeVisible({ timeout: 15000 });
  await nameInput.fill(serverName);
  await waitForStep(page);

  const createButton = getCreateServerButton(page);
  await expect(createButton).toBeEnabled({ timeout: 15000 });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await createButton.click();
    await waitForStep(page);

    const createdVisible = await getCreatedServerLocator(page, serverName).waitFor({ state: 'visible', timeout: 10000 }).then(
      () => true,
      () => false
    );
    if (createdVisible) {
      return;
    }

    if (!(await createButton.isVisible().catch(() => false)) || !(await createButton.isEnabled().catch(() => false))) {
      break;
    }
  }

  await expect(getCreatedServerLocator(page, serverName)).toBeVisible({ timeout: 20000 });
}

async function tryCreateServer(page, serverName) {
  await openCreateOwnServerForm(page);

  const nameInput = getServerNameInput(page);
  await expect(nameInput).toBeVisible({ timeout: 15000 });
  await nameInput.fill(serverName);
  await waitForStep(page);

  const createButton = getCreateServerButton(page);
  const isDisabled = await createButton.isDisabled().catch(() => false);
  if (isDisabled) {
    return { created: false, reason: 'disabled' };
  }

  await createButton.click();
  await waitForStep(page);

  const errorVisible = await getValidationMessage(page).isVisible().catch(() => false);
  if (errorVisible) {
    return { created: false, reason: 'validation' };
  }

  const createdLocator = getCreatedServerLocator(page, serverName);
  const createdVisible = await createdLocator.waitFor({ state: 'visible', timeout: 15000 }).then(
    () => true,
    () => false
  );
  const createdName = createdVisible ? (await createdLocator.textContent())?.trim() || serverName : undefined;
  return { created: createdVisible, reason: createdVisible ? 'created' : 'unknown', name: createdName };
}

async function clickServer(page, serverName) {
  const server = getServerByName(page, serverName);
  await expect(server).toBeVisible({ timeout: 20000 });
  await server.click();
  await waitForStep(page);
}

async function openServerHeaderMenu(page) {
  const header = page
    .getByRole('button', { name: /Server Options|server actions|tác vụ máy chủ/i })
    .or(page.locator('[data-testid="guild-header"], [aria-label="Server Options"], [aria-label*="Server Options"]'))
    .or(page.locator('section[aria-label*="Server"] header button, section[aria-label*="Máy chủ"] header button').first())
    .first();

  await expect(header).toBeVisible({ timeout: 20000 });
  await header.click();
  await waitForStep(page);
}

async function openServerSettings(page) {
  await openServerHeaderMenu(page);
  await page.getByRole('menuitem', { name: /Server Settings|Cài đặt máy chủ/i }).click();
  await waitForStep(page);

  const overviewTab = page.getByRole('tab', { name: /Overview|Tổng quan/i }).first();
  if (await overviewTab.count()) {
    await overviewTab.click();
    await waitForStep(page);
  }

  await expect(getSettingsServerNameInput(page)).toBeVisible({ timeout: 20000 });
}

async function closeSettings(page) {
  const closeButton = page.getByRole('button', { name: /Close|Đóng|Tắt/i }).last();
  if ((await closeButton.count()) > 0 && (await closeButton.isVisible().catch(() => false))) {
    await closeButton.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await waitForStep(page);

  if ((await page.getByRole('dialog').count()) > 0) {
    await page.keyboard.press('Escape');
    await waitForStep(page);
  }
}

async function saveSettings(page) {
  const saveButton = getSaveChangesButton(page);
  await expect(saveButton, 'Save Changes button should appear after editing settings').toBeVisible({
    timeout: 15000,
  });
  await expect(saveButton).toBeEnabled({ timeout: 15000 });
  await saveButton.click();
  await waitForStep(page);

  const doneButton = page.getByRole('button', { name: /Done|Xong/i }).first();
  if ((await doneButton.count()) > 0 && (await doneButton.isVisible().catch(() => false))) {
    await doneButton.click();
    await waitForStep(page);
  }
}

async function renameServer(page, currentName, newName) {
  await clickServer(page, currentName);
  await openServerSettings(page);

  const nameInput = getSettingsServerNameInput(page);
  await nameInput.fill(newName);
  await waitForStep(page);
  await saveSettings(page);
  await closeSettings(page);

  await expect(page.getByText(newName).first()).toBeVisible({ timeout: 20000 });
}

async function tryRenameServer(page, currentName, newName) {
  await clickServer(page, currentName);
  await openServerSettings(page);

  const nameInput = getSettingsServerNameInput(page);
  await nameInput.fill(newName);
  await waitForStep(page);

  const saveButton = getSaveChangesButton(page);
  const saveVisible = await saveButton.isVisible().catch(() => false);
  const saveDisabled = saveVisible ? await saveButton.isDisabled().catch(() => false) : true;
  if (saveDisabled) {
    await closeSettings(page);
    return { saved: false, reason: 'disabled' };
  }

  await saveButton.click();
  await waitForStep(page);

  const errorVisible = await getValidationMessage(page).waitFor({ state: 'visible', timeout: 5000 }).then(
    () => true,
    () => false
  );
  await closeSettings(page);

  if (errorVisible) {
    return { saved: false, reason: 'validation' };
  }

  if (!newName.trim()) {
    const originalVisible = await getServerByName(page, currentName).waitFor({ state: 'visible', timeout: 15000 }).then(
      () => true,
      () => false
    );
    return { saved: !originalVisible, reason: originalVisible ? 'unchanged' : 'saved' };
  }

  const renamedVisible = await getServerByName(page, newName).waitFor({ state: 'visible', timeout: 15000 }).then(
    () => true,
    () => false
  );
  return { saved: renamedVisible, reason: renamedVisible ? 'saved' : 'unknown' };
}

async function cancelRenameServer(page, currentName, attemptedName) {
  await clickServer(page, currentName);
  await openServerSettings(page);

  const nameInput = getSettingsServerNameInput(page);
  await nameInput.fill(attemptedName);
  await waitForStep(page);

  const resetButton = page.getByRole('button', { name: /Reset|Đặt lại|Hủy/i }).first();
  if ((await resetButton.count()) > 0 && (await resetButton.isVisible().catch(() => false))) {
    await resetButton.click();
  } else {
    await page.keyboard.press('Escape');
    const discardButton = page.getByRole('button', { name: /Discard|Hủy thay đổi|Không lưu/i }).first();
    if ((await discardButton.count()) > 0 && (await discardButton.isVisible().catch(() => false))) {
      await discardButton.click();
    }
  }
  await waitForStep(page);
  await closeSettings(page);
}

async function openDeleteServerPanel(page, serverName) {
  await clickServer(page, serverName);
  await openServerSettings(page);

  const deleteSettingsItem = page
    .getByRole('tab', { name: /Delete Server|Xóa máy chủ/i })
    .or(page.getByRole('button', { name: /Delete Server|Xóa máy chủ/i }))
    .first();
  await expect(deleteSettingsItem).toBeVisible({ timeout: 15000 });
  await deleteSettingsItem.scrollIntoViewIfNeeded();
  await deleteSettingsItem.click();
  await waitForStep(page);
}

async function startDeleteServer(page, serverName) {
  await openDeleteServerPanel(page, serverName);
  await page.getByRole('button', { name: /Delete Server|Xóa máy chủ/i }).last().click();
  await waitForStep(page);

  const confirmInput = page.locator('input').last();
  if ((await confirmInput.count()) > 0 && (await confirmInput.isVisible().catch(() => false))) {
    await confirmInput.fill(serverName);
    await waitForStep(page);
  }
}

async function deleteServer(page, serverName) {
  await startDeleteServer(page, serverName);
  const confirmButton = page.getByRole('button', { name: /Delete Server|Delete|Xóa máy chủ|Xóa/i }).last();
  await expect(confirmButton).toBeEnabled({ timeout: 15000 });
  await confirmButton.click();
  await waitForStep(page);
}

async function cancelDeleteServer(page, serverName) {
  await startDeleteServer(page, serverName);
  const cancelButton = page.getByRole('button', { name: /Cancel|Hủy/i }).first();
  if ((await cancelButton.count()) > 0 && (await cancelButton.isVisible().catch(() => false))) {
    await cancelButton.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await waitForStep(page);
  await closeSettings(page);
}

test.describe('Discord server management v2', () => {
  test.skip(!DISCORD_CHANNEL_URL, 'Set DISCORD_CHANNEL_URL to a channel or DM URL.');
  test.skip(({ browserName }) => browserName !== 'chromium', 'Discord server management suite runs on Chromium only.');
  test.describe.configure({ mode: 'serial' });

  let contextOwner;
  let pageOwner;
  const runId = Date.now();
  const createdServers = [];

  function serverName(suffix) {
    return `${DISCORD_SERVER_NAME} ${suffix} ${runId}`;
  }

  async function trackServer(name) {
    createdServers.push(name);
    return name;
  }

  function untrackServer(name) {
    const index = createdServers.indexOf(name);
    if (index >= 0) {
      createdServers.splice(index, 1);
    }
  }

  test.beforeEach(async ({ browser }, testInfo) => {
    testInfo.setTimeout(LOGIN_TIMEOUT_MS + 180000);
    contextOwner = await browser.newContext();
    pageOwner = await contextOwner.newPage();
    await openDiscord(pageOwner, 'User A');
  });

  test.afterEach(async ({}, testInfo) => {
    testInfo.setTimeout(LOGIN_TIMEOUT_MS + 180000);
    for (const name of Array.from(createdServers).reverse()) {
      try {
        await dismissTransientUi(pageOwner);
        await deleteServer(pageOwner, name);
        untrackServer(name);
      } catch {
        // Best-effort cleanup only. Individual tests already assert their own outcomes.
      }
    }
    await contextOwner?.close();
    contextOwner = undefined;
    pageOwner = undefined;
  });

  test.afterAll(async ({ browser }, testInfo) => {
    if (createdServers.length === 0) {
      return;
    }

    testInfo.setTimeout(LOGIN_TIMEOUT_MS + 180000);
    const cleanupContext = await browser.newContext();
    const cleanupPage = await cleanupContext.newPage();
    try {
      await openDiscord(cleanupPage, 'User A');
      for (const name of Array.from(createdServers).reverse()) {
        try {
          await dismissTransientUi(cleanupPage);
          await deleteServer(cleanupPage, name);
          untrackServer(name);
        } catch {
          // Best-effort fallback cleanup for servers left by failed tests.
        }
      }
    } finally {
      await cleanupContext.close();
    }
  });

  test('Tạo server với tên hợp lệ', async () => {
    const name = await trackServer(serverName('SV01 Valid'));
    await createServer(pageOwner, name);
    await expect(getServerByName(pageOwner, name)).toBeVisible({ timeout: 20000 });
  });

  test('Tạo server với tên rỗng', async () => {
    const result = await tryCreateServer(pageOwner, '');
    expect(result.created, `Empty server name should be rejected, got ${result.reason}`).toBeFalsy();
    await closeDialog(pageOwner);
  });

  test('Tạo server với tên tiếng Việt', async () => {
    const name = await trackServer(serverName('Tiếng Việt Đầy Đủ Dấu'));
    await createServer(pageOwner, name);
    await expect(pageOwner.getByText(name).first()).toBeVisible({ timeout: 20000 });
  });

  // test('Tạo server với ký tự đặc biệt', async () => {
  //   const name = await trackServer(serverName('Special !@#$%^&()_+-=[]{};,.'));
  //   await createServer(pageOwner, name);
  //   await expect(getCreatedServerLocator(pageOwner, name)).toBeVisible({ timeout: 20000 });
  // });

  test('Tạo server với tên quá dài', async () => {
    const name = `${serverName('Long')} ${'A'.repeat(LONG_NAME_LENGTH)}`;
    const result = await tryCreateServer(pageOwner, name);

    if (result.created) {
      await trackServer(result.name || name);
      await expect(getCreatedServerLocator(pageOwner, name)).toBeVisible({ timeout: 20000 });
    } else {
      await expect(getValidationMessage(pageOwner).or(getCreateServerButton(pageOwner))).toBeVisible();
      await closeDialog(pageOwner);
    }
  });

  test('Đổi tên server hợp lệ', async () => {
    const originalName = await trackServer(serverName('SV06 Original'));
    const updatedName = serverName('SV06 Updated');
    await createServer(pageOwner, originalName);
    await renameServer(pageOwner, originalName, updatedName);
    untrackServer(originalName);
    await trackServer(updatedName);
    await expect(getServerByName(pageOwner, updatedName)).toBeVisible({ timeout: 20000 });
  });

  test('Đổi tên server thành rỗng', async () => {
    const name = await trackServer(serverName('SV07 Original'));
    await createServer(pageOwner, name);

    const result = await tryRenameServer(pageOwner, name, '');
    expect(result.saved, `Empty renamed server should be rejected, got ${result.reason}`).toBeFalsy();
    await expect(getServerByName(pageOwner, name)).toBeVisible({ timeout: 20000 });
  });

  test('Đổi tên server thành khoảng trắng', async () => {
    const name = await trackServer(serverName('SV07 Spaces Original'));
    await createServer(pageOwner, name);

    const result = await tryRenameServer(pageOwner, name, '     ');
    expect(result.saved, `Whitespace-only renamed server should be rejected, got ${result.reason}`).toBeFalsy();
    await expect(getServerByName(pageOwner, name)).toBeVisible({ timeout: 20000 });
  });

  test('Đổi tên server sang tiếng Việt', async () => {
    const originalName = await trackServer(serverName('SV08 Original'));
    const updatedName = serverName('Đổi tên tiếng Việt đầy đủ dấu');
    await createServer(pageOwner, originalName);
    await renameServer(pageOwner, originalName, updatedName);
    untrackServer(originalName);
    await trackServer(updatedName);
    await expect(pageOwner.getByText(updatedName).first()).toBeVisible({ timeout: 20000 });
  });

  test('Đổi tên server với ký tự đặc biệt', async () => {
    const originalName = await trackServer(serverName('SV09 Original'));
    const updatedName = serverName('Rename !@#$%^&()_+-=[]{};,.');
    await createServer(pageOwner, originalName);
    await renameServer(pageOwner, originalName, updatedName);
    untrackServer(originalName);
    await trackServer(updatedName);
    await expect(pageOwner.getByText(updatedName).first()).toBeVisible({ timeout: 20000 });
  });

  test('Đổi tên server quá dài', async () => {
    const name = await trackServer(serverName('SV10 Original'));
    const longName = `${serverName('Rename Long')} ${'B'.repeat(LONG_NAME_LENGTH)}`;
    await createServer(pageOwner, name);

    const result = await tryRenameServer(pageOwner, name, longName);
    expect(result.saved, `Very  renamlonged server should be rejected, got ${result.reason}`).toBeFalsy();
    await expect(getServerByName(pageOwner, name)).toBeVisible({ timeout: 20000 });
  });

  test('Xóa server thành công', async () => {
    const name = await trackServer(serverName('SV11 Delete'));
    await createServer(pageOwner, name);
    await deleteServer(pageOwner, name);
    untrackServer(name);
    await expect(getServerByName(pageOwner, name)).toHaveCount(0);
  });

  test('Truy cập server sau khi xóa', async () => {
    const name = await trackServer(serverName('SV13 Access After Delete'));
    await createServer(pageOwner, name);
    const deletedServerUrl = pageOwner.url();

    await deleteServer(pageOwner, name);
    untrackServer(name);
    await expect(getServerByName(pageOwner, name)).toHaveCount(0);

    await pageOwner.goto(deletedServerUrl, { waitUntil: 'domcontentloaded' });
    await waitForStep(pageOwner);
    await expect(pageOwner.getByText(name).first()).toHaveCount(0);
    await expect(pageOwner).not.toHaveURL(deletedServerUrl);
  });

  test('Tạo server trùng tên', async () => {
    const name = await trackServer(serverName('SV14 Duplicate'));
    await createServer(pageOwner, name);
    const beforeCount = await getServersByName(pageOwner, name).count();

    await openCreateOwnServerForm(pageOwner);

    const nameInput = getServerNameInput(pageOwner);
    await expect(nameInput).toBeVisible({ timeout: 15000 });
    await nameInput.fill(name);
    await waitForStep(pageOwner);

    const createButton = getCreateServerButton(pageOwner);
    const isDisabled = await createButton.isDisabled().catch(() => false);
    if (isDisabled) {
      await closeDialog(pageOwner);
      await expect(getServerByName(pageOwner, name)).toBeVisible({ timeout: 20000 });
      return;
    }

    await createButton.click();
    await waitForStep(pageOwner);

    const afterCount = await getServersByName(pageOwner, name).count();
    if (afterCount > beforeCount) {
      await trackServer(name);
      expect(afterCount).toBeGreaterThanOrEqual(beforeCount + 1);
    } else {
      await expect(getValidationMessage(pageOwner).or(getCreateServerButton(pageOwner))).toBeVisible();
      await closeDialog(pageOwner);
    }
  });
});
