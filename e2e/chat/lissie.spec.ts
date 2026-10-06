import { expect, type Page, test } from "@playwright/test";

// Calls the real model through OpenRouter, so it runs only via `npm run test:chat`, never in QA or CI.

const isConnect = (url: string) => url.endsWith("/agent/lissie/connect");
const isRun = (url: string) => url.endsWith("/agent/lissie/run");

// Sends a message once the chat has loaded its thread, and waits for Lissie's whole reply.
async function send(page: Page, text: string) {
  const run = page.waitForResponse((response) => isRun(response.url()));
  await page.getByTestId("copilot-chat-textarea").fill(text);
  await page.getByTestId("copilot-chat-textarea").press("Enter");
  await (await run).finished();
}

test("Lissie answers and still remembers the conversation after a reload", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const user = page.getByTestId("copilot-user-message");
  const lissie = page.getByTestId("copilot-assistant-message");

  await page.goto("/signup");
  await page.getByLabel("Name").fill("Lissie's human");
  await page.getByLabel("Email").fill(`human-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("tuna-o-clock");
  const connected = page.waitForResponse((r) => isConnect(r.url()));
  await page.getByRole("button", { name: "Sign up" }).click();
  await connected;

  await send(page, "Hi Lissie. What can you do for me?");
  await expect(user).toHaveText(["Hi Lissie. What can you do for me?"]);
  await expect(lissie).toHaveCount(1);
  const reply = (await lissie.innerText()).trim();
  expect(reply).not.toBe("");

  const reconnected = page.waitForResponse((r) => isConnect(r.url()));
  await page.reload();
  await (await reconnected).finished();
  await expect(user).toHaveText(["Hi Lissie. What can you do for me?"]);
  await expect(lissie).toHaveCount(1);
  expect((await lissie.innerText()).trim()).toBe(reply);
});
