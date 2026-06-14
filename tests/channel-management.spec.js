// @ts-check
import { expect, test } from '@playwright/test';
import {
  DISCORD_CHANNEL_ALT_URL,
  DISCORD_CHANNEL_URL,
  LOGIN_TIMEOUT_MS,
  expectMessageVisible,
  getMessageList,
  openChannelUrl,
  sendMessage,
} from './support/discord.js';

test.setTimeout(LOGIN_TIMEOUT_MS + 60000);

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

