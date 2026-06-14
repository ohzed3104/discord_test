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

test.setTimeout(LOGIN_TIMEOUT_MS + 120000);

async function waitForStep(page) {
  await page.waitForTimeout(STEP_DELAY_MS);
}

async function openServerUrl(page, label) {
  await waitForLogin(page, label);
  await waitForStep(page);
  await page.goto(DISCORD_CHANNEL_URL, { waitUntil: 'domcontentloaded' });
  await waitForStep(page);
  await expect(page).toHaveURL(/\/channels\//, { timeout: 20000 });
}

async function openCreateOwnServerForm(page) {
  await openAddServerDialog(page);
  await waitForStep(page);

  await page.getByRole('button', { name: /Create My Own|Tạo Mẫu Riêng|Táº¡o Máº«u RiÃªng/i }).click();
  await waitForStep(page);

  await page
    .getByRole('button', {
      name: /For me and my friends|Dành cho tôi và bạn bè tôi|DÃ nh cho tÃ´i vÃ  báº¡n bÃ¨ tÃ´i|For a club or community/i,
    })
    .click();
  await waitForStep(page);
}

function getCreateServerNameInput(page) {
  return page
    .locator('input[name="guildName"], input[label="Tên máy chủ"], input[label="TÃªn mÃ¡y chá»§"]')
    .or(page.getByRole('textbox').first())
    .first();
}

function getCreateServerButton(page) {
  return page.getByRole('button', { name: /^Create$|^Tạo$|^Táº¡o$/i });
}

function getSettingsServerNameInput(page) {
  return page.locator('main input[type="text"]').first();
}

function getSaveChangesButton(page) {
  return page.getByRole('button', { name: /Save Changes|Lưu|LÆ°u|LÃ†/i }).last();
}

function getResetChangesButton(page) {
  return page.getByRole('button', { name: /Reset|Cancel|Discard|Đặt|Hủy|Ä|Há»§y/i }).first();
}

function getCloseSettingsButton(page) {
  return page.getByRole('button', { name: /Close|Tắt|Táº¯t|ESC/i }).first();
}

function getServerList(page) {
  return page
    .locator(
      '[role="group"][aria-label*="Server"], [role="group"][aria-label*="MÃ¡y chá»§"], [data-list-id="guildsnav"], nav[aria-label="Servers"]'
    )
    .first();
}

function getAnyServerItem(page) {
  return getServerList(page).locator('[role="treeitem"][data-list-item-id^="guildsnav___"]').first();
}

function getAnyServerContextTarget(page) {
  return getServerList(page)
    .locator('[data-dnd-name]:has([role="treeitem"][data-list-item-id^="guildsnav___"])')
    .first();
}

function getServerSettingsMenuItem(page) {
  return page
    .locator('#guild-context-guild-settings')
    .or(page.getByRole('menuitem', { name: /Server Settings|Cài đặt máy chủ|CÃ i Ä‘áº·t mÃ¡y chá»§/i }))
    .first();
}

async function openServerContextMenu(page) {
  const serverList = getServerList(page);
  await expect(serverList).toBeVisible({ timeout: 15000 });

  const serverItem = getAnyServerItem(page);
  await expect(serverItem).toBeVisible({ timeout: 15000 });

  const contextTarget = getAnyServerContextTarget(page);
  const target = (await contextTarget.count()) > 0 ? contextTarget : serverItem;
  await target.scrollIntoViewIfNeeded();

  const box = await target.boundingBox();
  const settingsMenuItem = getServerSettingsMenuItem(page);

  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await waitForStep(page);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  } else {
    await target.click({ button: 'right', force: true });
  }
  await waitForStep(page);

  if (!(await settingsMenuItem.isVisible().catch(() => false))) {
    await target.click({ button: 'right', force: true });
    await waitForStep(page);
  }

  if (!(await settingsMenuItem.isVisible().catch(() => false))) {
    await target.focus();
    await page.keyboard.press('Shift+F10');
    await waitForStep(page);
  }

  if (box && !(await settingsMenuItem.isVisible().catch(() => false))) {
    await target.dispatchEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      buttons: 2,
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
    });
    await waitForStep(page);
  }

  await expect(settingsMenuItem).toBeVisible({ timeout: 15000 });
}

async function openServerSettingsProfile(page) {
  await openServerContextMenu(page);

  const settingsMenuItem = getServerSettingsMenuItem(page);
  await expect(settingsMenuItem).toBeVisible({ timeout: 15000 });
  await settingsMenuItem.click();
  await waitForStep(page);

  await expect(getSettingsServerNameInput(page)).toBeVisible({ timeout: 20000 });
}

async function closeCreateServerModal(page) {
  await page.keyboard.press('Escape');
  await waitForStep(page);
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10000 });
}

async function closeServerSettings(page) {
  const closeButton = getCloseSettingsButton(page);
  if ((await closeButton.count()) > 0 && (await closeButton.isVisible().catch(() => false))) {
    await closeButton.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await waitForStep(page);
}

async function discardServerSettingsChanges(page) {
  const resetButton = getResetChangesButton(page);
  if ((await resetButton.count()) > 0 && (await resetButton.isVisible().catch(() => false))) {
    await resetButton.click();
    await waitForStep(page);
  }

  await closeServerSettings(page);

  const discardButton = page
    .getByRole('button', { name: /Discard|Don't Save|Do Not Save|Không lưu|KhÃ´ng lÆ°u|Hủy|Há»§y/i })
    .first();
  if ((await discardButton.count()) > 0 && (await discardButton.isVisible().catch(() => false))) {
    await discardButton.click();
    await waitForStep(page);
  }
}

async function createServerSlow(page, name) {
  await openCreateOwnServerForm(page);

  const nameInput = getCreateServerNameInput(page);
  await expect(nameInput).toBeVisible();
  await nameInput.fill(name);
  await waitForStep(page);

  const createButton = getCreateServerButton(page);
  await expect(createButton).toBeEnabled();
  await createButton.click();
  await waitForStep(page);

  await expect(page.getByText(name).first()).toBeVisible({ timeout: 15000 });
}

async function updateServerNameSlow(page, name) {
  await openServerSettingsProfile(page);

  const nameInput = getSettingsServerNameInput(page);
  await expect(nameInput).toBeVisible();
  await nameInput.fill(name);
  await waitForStep(page);

  const saveButton = getSaveChangesButton(page);
  await expect(saveButton).toBeVisible({ timeout: 10000 });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await waitForStep(page);

  await closeServerSettings(page);
}

test.describe('Discord server management', () => {
  test.skip(!DISCORD_CHANNEL_URL, 'Set DISCORD_CHANNEL_URL to a channel or DM URL.');
  test.describe.configure({ mode: 'serial' });

  let contextA;
  let pageA;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(LOGIN_TIMEOUT_MS + 120000);

    contextA = await browser.newContext();
    pageA = await contextA.newPage();

    await openServerUrl(pageA, 'User A');
  });

  test.afterAll(async () => {
    await contextA?.close();
  });

  test.describe('Create server', () => {
    test('create new server with valid info', async () => {
      await createServerSlow(pageA, `${DISCORD_SERVER_NAME} ${Date.now()}`);
    });

    test('create server button is enabled for a one-character server name', async () => {
      await openCreateOwnServerForm(pageA);
      await getCreateServerNameInput(pageA).fill('A');
      await waitForStep(pageA);
      await expect(getCreateServerButton(pageA)).toBeEnabled();
      await closeCreateServerModal(pageA);
    });

    test('cancel create server flow without creating a server', async () => {
      const serverName = `${DISCORD_SERVER_NAME} Cancelled ${Date.now()}`;

      await openCreateOwnServerForm(pageA);
      await getCreateServerNameInput(pageA).fill(serverName);
      await waitForStep(pageA);
      await closeCreateServerModal(pageA);

      await expect(pageA.getByText(serverName)).toHaveCount(0);
    });

    test('create server with special characters in the name', async () => {
      const serverName = `${DISCORD_SERVER_NAME} !@#$ ${Date.now()}`;

      await createServerSlow(pageA, serverName);
      await expect(pageA.getByText(serverName).first()).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Validation server info', () => {
    test('validate empty server name', async () => {
      await openCreateOwnServerForm(pageA);
      await getCreateServerNameInput(pageA).fill('');
      await waitForStep(pageA);
      await expect(getCreateServerButton(pageA)).toBeDisabled();
      await closeCreateServerModal(pageA);
    });

    test('validate whitespace-only server name', async () => {
      await openCreateOwnServerForm(pageA);
      await getCreateServerNameInput(pageA).fill('     ');
      await waitForStep(pageA);
      await expect(getCreateServerButton(pageA)).toBeDisabled();
      await closeCreateServerModal(pageA);
    });

    test('changing server name enables save changes', async () => {
      const draftName = `${DISCORD_SERVER_NAME} Draft ${Date.now()}`;

      await openServerSettingsProfile(pageA);
      const nameInput = getSettingsServerNameInput(pageA);

      await expect(nameInput).toBeVisible();
      await nameInput.fill(draftName);
      await waitForStep(pageA);
      await expect(getSaveChangesButton(pageA)).toBeEnabled();

      await discardServerSettingsChanges(pageA);
    });

    test('server name change can be discarded', async () => {
      const draftName = `${DISCORD_SERVER_NAME} Unsaved ${Date.now()}`;

      await openServerSettingsProfile(pageA);
      await getSettingsServerNameInput(pageA).fill(draftName);
      await waitForStep(pageA);
      await discardServerSettingsChanges(pageA);

      await expect(pageA.getByText(draftName)).toHaveCount(0);
    });
  });

  test.describe('Server settings', () => {
    test('open server profile settings', async () => {
      await openServerSettingsProfile(pageA);

      await expect(getSettingsServerNameInput(pageA)).toBeVisible();
      await closeServerSettings(pageA);
    });

    test('save button is hidden before settings are changed', async () => {
      await openServerSettingsProfile(pageA);

      await expect(getSaveChangesButton(pageA)).toHaveCount(0);
      await closeServerSettings(pageA);
    });

    test('edit server info', async () => {
      const updatedName = `${DISCORD_SERVER_NAME} Updated ${Date.now()}`;
      await updateServerNameSlow(pageA, updatedName);
      await expect(pageA.getByText(updatedName).first()).toBeVisible({ timeout: 15000 });
    });

    test('edited server info persists after reload', async () => {
      const updatedName = `${DISCORD_SERVER_NAME} Reload ${Date.now()}`;

      await updateServerNameSlow(pageA, updatedName);
      await pageA.reload({ waitUntil: 'domcontentloaded' });
      await waitForStep(pageA);

      await expect(pageA.getByText(updatedName).first()).toBeVisible({ timeout: 20000 });
    });
  });
});
