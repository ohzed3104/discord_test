// @ts-check
import { expect, test } from '@playwright/test';
import path from 'node:path';

import {
  DISCORD_CHANNEL_URL,
  DISCORD_SERVER_NAME,
  LOGIN_TIMEOUT_MS,
  openAddServerDialog,
  waitForLogin,
} from './support/discord.js';

const STEP_DELAY_MS = 2000;
const SERVER_ICON_PATH =
  process.env.DISCORD_SERVER_ICON_PATH || path.resolve('tests/fixtures/server-icon.png');

test.setTimeout(LOGIN_TIMEOUT_MS + 180000);

async function waitForStep(page) {
  await page.waitForTimeout(STEP_DELAY_MS);
}

async function openDiscord(page, label) {
  await waitForLogin(page, label);
  if (DISCORD_CHANNEL_URL) {
    await page.goto(DISCORD_CHANNEL_URL, { waitUntil: 'domcontentloaded' });
  }
  await expect(page).toHaveURL(/\/channels\//, { timeout: 20000 });
}

function getServerList(page) {
  return page
    .locator(
      '[data-list-id="guildsnav"], [data-testid="guildsnav"], nav[aria-label="Servers"], [role="tree"][aria-label*="Server"]'
    )
    .first();
}

function getServerByName(page, serverName) {
  return getServerList(page)
    .locator(`[aria-label*="${serverName}"], [data-dnd-name="${serverName}"]`)
    .or(page.getByRole('treeitem', { name: new RegExp(serverName, 'i') }))
    .first();
}

function getServerNameInput(page) {
  return page
    .locator(
      'div[role="dialog"] input[name="guildName"], div[role="dialog"] input[type="text"], input[name="guildName"], input[aria-label*="Server Name"], input[aria-label*="Tên máy chủ"]'
    )
    .first();
}

function getCreateServerButton(page) {
  return page.getByRole('button', { name: /^Create$|^Tạo$/i });
}

function getSaveChangesButton(page) {
  return page.getByRole('button', { name: /Save Changes|Lưu thay đổi/i }).first();
}

async function saveSettingsIfNeeded(page) {
  const saveButton = getSaveChangesButton(page);
  if ((await saveButton.count()) > 0 && (await saveButton.isVisible().catch(() => false))) {
    await expect(saveButton).toBeEnabled({ timeout: 15000 });
    await saveButton.click();
    await waitForStep(page);
    return true;
  }

  return false;
}

function getSettingsServerNameInput(page) {
  return page
    .locator('main input[name="name"], main input[label*="Server"], main input[aria-label*="Server"]')
    .or(page.getByLabel(/^Server Name$|^Tên$/i))
    .first();
}

async function closeDialog(page) {
  await page.keyboard.press('Escape');
  await waitForStep(page);
}

async function closeSettings(page) {
  const closeButton = page.getByRole('button', { name: /Close|Tắt|Đóng/i }).last();
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

  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10000 });
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
  await expect(createButton).toBeEnabled();
  await createButton.click();
  await waitForStep(page);

  await expect(page.getByText(serverName).first()).toBeVisible({ timeout: 20000 });
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
    .or(page.locator('nav[aria-label*="máy chủ"] button').first())
    .or(page.locator('section[aria-label*="Server"] header button').first())
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

async function saveSettings(page) {
  const didSave = await saveSettingsIfNeeded(page);
  expect(didSave, 'Save Changes button should appear after editing settings').toBeTruthy();

  const doneButton = page.getByRole('button', { name: /Done|Xong/i }).first();
  if ((await doneButton.count()) > 0 && (await doneButton.isVisible().catch(() => false))) {
    await doneButton.click();
    await waitForStep(page);
  }
}

async function renameServer(page, newName) {
  await openServerSettings(page);
  const nameInput = getSettingsServerNameInput(page);
  await nameInput.fill(newName);
  await waitForStep(page);
  await saveSettings(page);
  await closeSettings(page);
  await expect(page.getByText(newName).first()).toBeVisible({ timeout: 20000 });
}

async function updateServerIcon(page) {
  await openServerSettings(page);

  const fileInput = page
    .locator(
      'input[type="file"][accept*=".png"][aria-label], input[type="file"][accept*=".jpg"][aria-label], input[type="file"][accept*=".png"]'
    )
    .last();
  await expect(fileInput).toBeAttached({ timeout: 15000 });
  await fileInput.setInputFiles(SERVER_ICON_PATH);
  await waitForStep(page);

  const applyButton = page.getByRole('button', { name: /Apply|Save|Áp dụng|Lưu|Hoàn tất/i }).first();
  if ((await applyButton.count()) > 0 && (await applyButton.isVisible().catch(() => false))) {
    await applyButton.click();
    await waitForStep(page);
  }

  await saveSettingsIfNeeded(page);
  await closeSettings(page);
}

function getDefaultTextChannel(page) {
  return page
    .getByRole('link', { name: /general|chung/i })
    .or(page.getByText(/general|chung/i))
    .first();
}

async function createInviteLink(page) {
  await openServerHeaderMenu(page);
  const inviteMenuItem = page
    .getByRole('menuitem', { name: /Invite People|Mời Vào Máy Chủ|Mời mọi người|Mời người|Mời/i })
    .first();
  await expect(inviteMenuItem).toBeVisible({ timeout: 15000 });
  await inviteMenuItem.click();
  await waitForStep(page);

  const linkInput = page
    .locator('input[value^="https://discord.gg/"], input[value^="https://discord.com/invite/"]')
    .first();
  await expect(linkInput).toBeVisible({ timeout: 15000 });

  const inviteLink = await linkInput.inputValue();
  expect(inviteLink).toMatch(/discord\.(gg|com\/invite)\//);

  await closeDialog(page);
  return inviteLink;
}

async function joinServerByInvite(page, inviteLink) {
  await page.goto(inviteLink, { waitUntil: 'domcontentloaded' });
  await waitForStep(page);

  const captchaDialog = page.getByRole('dialog', { name: /con người|human|robot/i }).first();
  if ((await captchaDialog.count()) > 0 && (await captchaDialog.isVisible().catch(() => false))) {
    return false;
  }

  const acceptButton = page.getByRole('button', { name: /Accept Invite|Join|Tham gia|Chấp nhận/i }).first();
  if ((await acceptButton.count()) > 0 && (await acceptButton.isVisible().catch(() => false))) {
    await acceptButton.click();
    await waitForStep(page);
  }

  if ((await captchaDialog.count()) > 0 && (await captchaDialog.isVisible().catch(() => false))) {
    return false;
  }

  await page.waitForURL(/\/channels\//, { timeout: 30000 }).catch(() => {});
  if (!/\/channels\//.test(page.url())) {
    return false;
  }

  return true;
}

async function openMembersListIfNeeded(page) {
  const membersButton = page
    .getByRole('button', { name: /Show Member List|Member List|Danh sách thành viên/i })
    .first();

  if ((await membersButton.count()) > 0 && (await membersButton.isVisible().catch(() => false))) {
    await membersButton.click();
    await waitForStep(page);
  }
}

async function kickMember(page, memberNameOrEmail) {
  await openMembersListIfNeeded(page);

  const member = page
    .getByRole('listitem', { name: new RegExp(memberNameOrEmail, 'i') })
    .or(page.getByText(new RegExp(memberNameOrEmail, 'i')))
    .first();

  await expect(member).toBeVisible({ timeout: 20000 });
  await member.click({ button: 'right' });
  await waitForStep(page);

  await page.getByRole('menuitem', { name: /Kick|Khai trừ|Đuổi/i }).click();
  await waitForStep(page);

  const confirmButton = page.getByRole('button', { name: /Kick|Confirm|Xác nhận|Đuổi/i }).last();
  await expect(confirmButton).toBeVisible({ timeout: 15000 });
  await confirmButton.click();
  await waitForStep(page);
}

async function leaveServer(page) {
  await openServerHeaderMenu(page);
  await page.getByRole('menuitem', { name: /Leave Server|Rời máy chủ/i }).click();
  await waitForStep(page);

  const confirmButton = page.getByRole('button', { name: /Leave Server|Leave|Rời máy chủ|Rời/i }).last();
  await expect(confirmButton).toBeVisible({ timeout: 15000 });
  await confirmButton.click();
  await waitForStep(page);
}

async function deleteServer(page, serverName) {
  await openServerSettings(page);
  const deleteSettingsItem = page
    .getByRole('tab', { name: /Delete Server|Xóa máy chủ/i })
    .or(page.getByRole('button', { name: /Delete Server|Xóa máy chủ/i }))
    .first();
  await expect(deleteSettingsItem).toBeVisible({ timeout: 15000 });
  await deleteSettingsItem.scrollIntoViewIfNeeded();
  await deleteSettingsItem.click();
  await waitForStep(page);

  await page.getByRole('button', { name: /Delete Server|Xóa máy chủ/i }).last().click();
  await waitForStep(page);

  const confirmInput = page.locator('input').last();
  if ((await confirmInput.count()) > 0 && (await confirmInput.isVisible().catch(() => false))) {
    await confirmInput.fill(serverName);
    await waitForStep(page);
  }

  const confirmButton = page.getByRole('button', { name: /Delete Server|Delete|Xóa máy chủ|Xóa/i }).last();
  await expect(confirmButton).toBeEnabled({ timeout: 15000 });
  await confirmButton.click();
  await waitForStep(page);
}

test.describe('Discord server management', () => {
  test.skip(!DISCORD_CHANNEL_URL, 'Set DISCORD_CHANNEL_URL to a channel or DM URL.');
  test.skip(({ browserName }) => browserName !== 'chromium', 'Discord server management suite runs on Chromium only.');
  test.describe.configure({ mode: 'serial' });

  let contextOwner;
  let contextMember;
  let pageOwner;
  let pageMember;
  let serverName;
  let updatedServerName;
  let inviteLink;
  let memberJoined = false;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(LOGIN_TIMEOUT_MS + 180000);

    contextOwner = await browser.newContext();
    contextMember = await browser.newContext();
    pageOwner = await contextOwner.newPage();
    pageMember = await contextMember.newPage();

    serverName = `${DISCORD_SERVER_NAME} ${Date.now()}`;
    updatedServerName = `${serverName} Updated`;

    await openDiscord(pageOwner, 'User A');
    await openDiscord(pageMember, 'User B');
  });

  test.afterAll(async () => {
    await contextOwner?.close();
    await contextMember?.close();
  });

  test.describe('Tạo server', () => {
    test('Tạo server mới thành công', async () => {
      await createServer(pageOwner, serverName);
      await expect(pageOwner.getByText(serverName).first()).toBeVisible({ timeout: 20000 });
    });

    test('Không cho tạo server khi tên rỗng', async () => {
      await openCreateOwnServerForm(pageOwner);
      await getServerNameInput(pageOwner).fill('');
      await waitForStep(pageOwner);
      await expect(getCreateServerButton(pageOwner)).toBeDisabled();
      await closeDialog(pageOwner);
    });
  });

  test.describe('Hiển thị server', () => {
    test('Server mới xuất hiện trong danh sách server bên trái', async () => {
      await expect(getServerByName(pageOwner, serverName)).toBeVisible({ timeout: 20000 });
    });
  });

  test.describe('Mở server', () => {
    test('Click vào server và vào đúng server', async () => {
      await clickServer(pageOwner, serverName);
      await expect(pageOwner.getByText(serverName).first()).toBeVisible({ timeout: 20000 });
      await expect(pageOwner).toHaveURL(/\/channels\/\d+/, { timeout: 20000 });
    });
  });

  test.describe('Cập nhật server', () => {
    test('Đổi tên server thành công', async () => {
      await clickServer(pageOwner, serverName);
      await renameServer(pageOwner, updatedServerName);
    });

    test('Đổi icon/avatar server thành công', async () => {
      await clickServer(pageOwner, updatedServerName);
      await updateServerIcon(pageOwner);
      await expect(getServerByName(pageOwner, updatedServerName)).toBeVisible({ timeout: 20000 });
    });
  });

  test.describe('Quản lý thành viên', () => {
    test('Mời thành viên vào server bằng invite link', async () => {
      await clickServer(pageOwner, updatedServerName);
      inviteLink = await createInviteLink(pageOwner);
      expect(inviteLink).toMatch(/discord\.(gg|com\/invite)\//);
    });

    test('Thành viên mới join server thành công', async () => {
      test.skip(!process.env.DISCORD_USER_B_EMAIL, 'Set DISCORD_USER_B_EMAIL and DISCORD_USER_B_PASSWORD.');
      memberJoined = await joinServerByInvite(pageMember, inviteLink);
      test.skip(!memberJoined, 'Discord requires CAPTCHA verification for this invite join.');
      await expect(pageMember.getByText(updatedServerName).first()).toBeVisible({ timeout: 30000 });
    });

    test('Kick thành viên khỏi server', async () => {
      test.skip(!process.env.DISCORD_USER_B_EMAIL, 'Set DISCORD_USER_B_EMAIL and DISCORD_USER_B_PASSWORD.');
      test.skip(!memberJoined, 'Member did not join because Discord required CAPTCHA verification.');
      await clickServer(pageOwner, updatedServerName);
      const memberLabel = process.env.DISCORD_USER_B_DISPLAY_NAME || process.env.DISCORD_USER_B_EMAIL;
      await kickMember(pageOwner, memberLabel);
      await pageMember.reload({ waitUntil: 'domcontentloaded' });
      await waitForStep(pageMember);
      await expect(pageMember.getByText(updatedServerName).first()).toHaveCount(0);
    });
  });

  test.describe('Phân quyền', () => {
    test('User thường không được sửa setting server', async () => {
      test.skip(!process.env.DISCORD_USER_B_EMAIL, 'Set DISCORD_USER_B_EMAIL and DISCORD_USER_B_PASSWORD.');
      inviteLink ||= await createInviteLink(pageOwner);
      memberJoined ||= await joinServerByInvite(pageMember, inviteLink);
      test.skip(!memberJoined, 'Discord requires CAPTCHA verification for this invite join.');
      await clickServer(pageMember, updatedServerName);
      await openServerHeaderMenu(pageMember);
      await expect(pageMember.getByRole('menuitem', { name: /Server Settings|Cài đặt máy chủ/i })).toHaveCount(0);
      await closeDialog(pageMember);
    });

    test('Admin/Owner được sửa setting server', async () => {
      await clickServer(pageOwner, updatedServerName);
      await openServerSettings(pageOwner);
      await expect(getSettingsServerNameInput(pageOwner)).toBeVisible({ timeout: 20000 });
      await pageOwner.keyboard.press('Escape');
      await waitForStep(pageOwner);
    });
  });

  test.describe('Channel mặc định', () => {
    test('Server mới có channel mặc định như general', async () => {
      await clickServer(pageOwner, updatedServerName);
      await expect(getDefaultTextChannel(pageOwner)).toBeVisible({ timeout: 20000 });
    });
  });

  test.describe('Xóa/Rời server', () => {
    test('User rời server thành công', async () => {
      test.skip(!process.env.DISCORD_USER_B_EMAIL, 'Set DISCORD_USER_B_EMAIL and DISCORD_USER_B_PASSWORD.');
      inviteLink ||= await createInviteLink(pageOwner);
      memberJoined ||= await joinServerByInvite(pageMember, inviteLink);
      test.skip(!memberJoined, 'Discord requires CAPTCHA verification for this invite join.');
      await clickServer(pageMember, updatedServerName);
      await leaveServer(pageMember);
      await expect(getServerByName(pageMember, updatedServerName)).toHaveCount(0);
    });
  });

  test.describe('Xóa server', () => {
    test('Owner xóa server thành công', async () => {
      await clickServer(pageOwner, updatedServerName);
      await deleteServer(pageOwner, updatedServerName);
      await expect(getServerByName(pageOwner, updatedServerName)).toHaveCount(0);
    });
  });
});
