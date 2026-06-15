// @ts-check
import { expect, test } from '@playwright/test';

import {
  DISCORD_APP_URL,
  DISCORD_CHANNEL_URL,
  LOGIN_TIMEOUT_MS,
  expectMessageNotSent,
  expectMessageOrder,
  expectMessageRejectedBySender,
  expectMessageVisible,
  getMessageList,
  openChannel,
  openChannelUrl,
  sendFromAToBAndExpect,
  sendFromBToAAndExpect,
  sendMessage,
} from './support/discord.js';

test.setTimeout(LOGIN_TIMEOUT_MS + 60000);

test.describe('Discord realtime messaging', () => {
  test.skip(!DISCORD_CHANNEL_URL, 'Set DISCORD_CHANNEL_URL to a channel or DM URL.');
  test.skip(({ browserName }) => browserName !== 'chromium', 'Discord realtime messaging suite runs on Chromium only.');
  test.describe.configure({ mode: 'serial' });

  /**
   * @type {import("playwright-core").BrowserContext}
   */
  let contextA;
  
  /**
   * @type {import("playwright-core").BrowserContext}
   */
  let contextB;

  /**
   * @type {import("playwright-core").Page}
   */
  let pageA;
  /**
   * @type {import("playwright-core").Page}
   */
  let pageB;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(LOGIN_TIMEOUT_MS + 180000);

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

  test.beforeEach(async () => {
    await openChannelUrl(pageA, 'User A', DISCORD_CHANNEL_URL);
    await openChannelUrl(pageB, 'User B', DISCORD_CHANNEL_URL);
  });

  test('short text message is sent from User A and received by User B', async () => {
    await sendFromAToBAndExpect(pageA, pageB, 'short-text', 'hello');
  });

  test('message with leading and trailing spaces is sent from User A and received by User B', async () => {
    await sendFromAToBAndExpect(pageA, pageB, 'edge-spaces', '  hello  ', ['hello']);
  });

  test('multiline message is rendered for User A and User B', async () => {
    await sendFromAToBAndExpect(pageA, pageB, 'multiline', 'line1\nline2', ['line1', 'line2']);
  });

  test('consecutive blank lines are rendered for User A and User B', async () => {
    await sendFromAToBAndExpect(pageA, pageB, 'blank-lines', 'a\n\nb', ['a', 'b']);
  });

  test('special-character message is sent from User A and received by User B', async () => {
    await sendFromAToBAndExpect(pageA, pageB, 'special-chars', '!@#$%^&*()');
  });

  test('emoji message is sent from User A and received by User B', async () => {
    await sendFromAToBAndExpect(pageA, pageB, 'emoji', 'Hello 😀🔥', ['Hello']);
  });

  test('markdown message is sent and rendered by Discord for User A and User B', async () => {
    await sendFromAToBAndExpect(pageA, pageB, 'markdown', '**bold**, `code`', ['bold', 'code']);
  });

  test('mention-like role text is sent from User A and received by User B', async () => {
    await sendFromAToBAndExpect(pageA, pageB, 'mention-role', '@role');
  });

  test('code block message is sent and rendered by Discord for User A and User B', async () => {
    await sendFromAToBAndExpect(pageA, pageB, 'code-block', '```js\nconsole.log("test");\n```', [
      'console.log("test");',
    ]);
  });

  test('sql-like text is sent as plain message content', async () => {
    await sendFromAToBAndExpect(pageA, pageB, 'sql-like-text', "' OR '1'='1'; DROP TABLE messages; --");
  });

  test('html injection text is sent as plain message content', async () => {
    await sendFromAToBAndExpect(
      pageA,
      pageB,
      'html-injection-text',
      '<h1>Hello</h1><script>alert("xss")</script>',
      ['<h1>Hello</h1>', '<script>alert("xss")</script>']
    );
  });

  test('xss image payload text is sent as plain message content', async () => {
    await sendFromAToBAndExpect(pageA, pageB, 'xss-image-payload', '<img src=x onerror=alert(1)>');
  });

  test('markdown javascript link text is sent without executing script', async () => {
    await sendFromAToBAndExpect(pageA, pageB, 'markdown-javascript-link', '[click me](javascript:alert(1))', [
      'click me',
    ]);
  });

  test('template injection text is sent as plain message content', async () => {
    await sendFromAToBAndExpect(pageA, pageB, 'template-injection-text', '{{7*7}} ${7*7} <%= 7*7 %>', [
      '{{7',
      '7}}',
      '${7',
      '7}',
      '<%= 7*7 %>',
    ]);
  });

  test('path traversal text is sent as plain message content', async () => {
    await sendFromAToBAndExpect(pageA, pageB, 'path-traversal-text', '../../etc/passwd C:\\Windows\\System32');
  });

  test('blank message is not sent', async () => {
    await expectMessageNotSent(pageA, pageB, '');
  });

  test('space-only message is not sent', async () => {
    await expectMessageNotSent(pageA, pageB, '     ');
  });

  test('newline-only message is not sent', async () => {
    await expectMessageNotSent(pageA, pageB, '\n\n');
  });

  test('message over Discord character limit is not sent', async () => {
    await expectMessageRejectedBySender(pageA, pageB, `pw-too-long-${Date.now()}-${'x'.repeat(2100)}`);
  });



  test('two users send nearly at the same time and both messages appear for both users', async () => {
    const messageA = `pw-same-time-a-${Date.now()}`;
    const messageB = `pw-same-time-b-${Date.now()}`;

    await Promise.all([sendMessage(pageA, messageA), sendMessage(pageB, messageB)]);

    await expectMessageVisible(pageA, messageA, 20000);
    await expectMessageVisible(pageA, messageB, 20000);
    await expectMessageVisible(pageB, messageA, 20000);
    await expectMessageVisible(pageB, messageB, 20000);
  });

  test('User B still receives messages after refreshing the page', async () => {
    await pageB.reload({ waitUntil: 'domcontentloaded' });
    await expect(getMessageList(pageB)).toBeVisible({ timeout: 20000 });

    await sendFromAToBAndExpect(pageA, pageB, 'b-refresh', 'message after B refresh');
  });


});
