// @ts-check
import { expect, test } from '@playwright/test';
import {
  DISCORD_CHANNEL_ALT_URL,
  DISCORD_CHANNEL_URL,
  LOGIN_TIMEOUT_MS,
  expectMessageNotSent,
  expectMessagePartsVisible,
  expectMessageVisible,
  getMessageList,
  openChannelUrl,
  sendMessage,
} from './support/discord.js';

test.setTimeout(LOGIN_TIMEOUT_MS + 60000);

test.describe('Discord channel management', () => {
  test.skip(process.env.DISCORD_SKIP_CHANNEL_MANAGEMENT === '1', 'Channel management suite skipped by env.');
  test.skip(!DISCORD_CHANNEL_URL, 'Set DISCORD_CHANNEL_URL to a channel or DM URL.');
  test.skip(!DISCORD_CHANNEL_ALT_URL, 'Set DISCORD_CHANNEL_ALT_URL to another channel URL.');
  test.describe.configure({ mode: 'serial', timeout: LOGIN_TIMEOUT_MS + 120000 });

  let contextA;
  let contextB;
  let pageA;
  let pageB;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(LOGIN_TIMEOUT_MS + 120000);
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

  test('CH-MGMT-003: sender sees own message in main channel', async () => {
    const message = `pw-main-sender-${Date.now()}`;

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await sendMessage(pageA, message);

    await expectMessageVisible(pageA, message, 20000);
  });

  test('CH-MGMT-004: sender sees own message in alternate channel', async () => {
    const message = `pw-alt-sender-${Date.now()}`;

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_ALT_URL);
    await sendMessage(pageA, message);

    await expectMessageVisible(pageA, message, 20000);
  });

  test('CH-MGMT-005: User A message appears for User B in main channel', async () => {
    const message = `pw-main-a-to-b-${Date.now()}`;

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_URL);
    await sendMessage(pageA, message);

    await expectMessageVisible(pageB, message, 20000);
  });

  test('CH-MGMT-006: User B message appears for User A in main channel', async () => {
    const message = `pw-main-b-to-a-${Date.now()}`;

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_URL);
    await sendMessage(pageB, message);

    await expectMessageVisible(pageA, message, 20000);
  });

  test('CH-MGMT-007: User A message appears for User B in alternate channel', async () => {
    const message = `pw-alt-a-to-b-${Date.now()}`;

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_ALT_URL);
    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_ALT_URL);
    await sendMessage(pageA, message);

    await expectMessageVisible(pageB, message, 20000);
  });

  test('CH-MGMT-008: User B message appears for User A in alternate channel', async () => {
    const message = `pw-alt-b-to-a-${Date.now()}`;

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_ALT_URL);
    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_ALT_URL);
    await sendMessage(pageB, message);

    await expectMessageVisible(pageA, message, 20000);
  });

  test('CH-MGMT-009: main channel message does not leak to alternate channel', async () => {
    const message = `pw-main-no-leak-${Date.now()}`;

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await sendMessage(pageA, message);
    await expectMessageVisible(pageA, message, 20000);

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_ALT_URL);
    await expect(getMessageList(pageA).getByText(message)).toHaveCount(0);
  });

  test('CH-MGMT-010: alternate channel message does not leak to main channel', async () => {
    const message = `pw-alt-no-leak-${Date.now()}`;

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_ALT_URL);
    await sendMessage(pageA, message);
    await expectMessageVisible(pageA, message, 20000);

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await expect(getMessageList(pageA).getByText(message)).toHaveCount(0);
  });

  test('CH-MGMT-011: main channel message remains visible after refresh', async () => {
    const message = `pw-main-refresh-${Date.now()}`;

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await sendMessage(pageA, message);
    await expectMessageVisible(pageA, message, 20000);
    await pageA.reload({ waitUntil: 'domcontentloaded' });

    await expectMessageVisible(pageA, message, 20000);
  });

  test('CH-MGMT-012: alternate channel message remains visible after refresh', async () => {
    const message = `pw-alt-refresh-${Date.now()}`;

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_ALT_URL);
    await sendMessage(pageA, message);
    await expectMessageVisible(pageA, message, 20000);
    await pageA.reload({ waitUntil: 'domcontentloaded' });

    await expectMessageVisible(pageA, message, 20000);
  });

  test('CH-MGMT-013: multiline message is scoped to the active channel', async () => {
    const marker = `pw-channel-multiline-${Date.now()}`;

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await sendMessage(pageA, `${marker}\nline 1\nline 2\nline 3`);

    await expectMessagePartsVisible(pageA, [marker, 'line 1', 'line 2', 'line 3'], 20000);
    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_ALT_URL);
    await expect(getMessageList(pageA).getByText(marker)).toHaveCount(0);
  });

  test('CH-MGMT-014: markdown message is readable in the active channel', async () => {
    const marker = `pw-channel-markdown-${Date.now()}`;

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await sendMessage(pageA, `${marker}\n**bold text**\n- item one\n\`inline code\``);

    await expectMessagePartsVisible(pageA, [marker, 'bold text', 'item one', 'inline code'], 20000);
    await expectMessagePartsVisible(pageB, [marker, 'bold text', 'item one', 'inline code'], 20000);
  });

  test('CH-MGMT-015: special characters are delivered in main channel', async () => {
    const message = `pw-channel-special-${Date.now()} !@#$%^&*()_+-=[]{};:,.?`;

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_URL);
    await sendMessage(pageA, message);

    await expectMessageVisible(pageB, message, 20000);
  });

  test('CH-MGMT-016: numeric-only content is delivered in alternate channel', async () => {
    const message = `pw-channel-number-${Date.now()} 12345678901234567890`;

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_ALT_URL);
    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_ALT_URL);
    await sendMessage(pageA, message);

    await expectMessageVisible(pageB, message, 20000);
  });

  test('CH-MGMT-017: empty message is not sent in main channel', async () => {
    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_URL);

    await expectMessageNotSent(pageA, pageB, '');
  });

  test('CH-MGMT-018: spaces-only message is not sent in alternate channel', async () => {
    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_ALT_URL);
    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_ALT_URL);

    await expectMessageNotSent(pageA, pageB, '     ');
  });

  test('CH-MGMT-019: switching back preserves main channel content', async () => {
    const message = `pw-main-switch-back-${Date.now()}`;

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await sendMessage(pageA, message);
    await expectMessageVisible(pageA, message, 20000);
    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_ALT_URL);
    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);

    await expectMessageVisible(pageA, message, 20000);
  });

  test('CH-MGMT-020: switching back preserves alternate channel content', async () => {
    const message = `pw-alt-switch-back-${Date.now()}`;

    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_ALT_URL);
    await sendMessage(pageA, message);
    await expectMessageVisible(pageA, message, 20000);
    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_ALT_URL);

    await expectMessageVisible(pageA, message, 20000);
  });
});

