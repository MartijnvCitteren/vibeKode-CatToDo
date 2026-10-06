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

// Signs up a fresh human and waits until the chat has loaded its (empty) thread.
async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Lissie's human");
  await page.getByLabel("Email").fill(`human-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("tuna-o-clock");
  const connected = page.waitForResponse((r) => isConnect(r.url()));
  await page.getByRole("button", { name: "Sign up" }).click();
  await connected;
}

test("Lissie answers and still remembers the conversation after a reload", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const user = page.getByTestId("copilot-user-message");
  const lissie = page.getByTestId("copilot-assistant-message");

  await signUp(page);

  await send(page, "Hi Lissie. What can you do for me?");
  await expect(user).toHaveText(["Hi Lissie. What can you do for me?"]);
  // A tool call splits her turn: the text after it is a message of its own.
  await expect(lissie).not.toHaveCount(0);
  const replies = await lissie.allInnerTexts();
  expect(replies.join("").trim()).not.toBe("");

  const reconnected = page.waitForResponse((r) => isConnect(r.url()));
  await page.reload();
  await (await reconnected).finished();
  await expect(user).toHaveText(["Hi Lissie. What can you do for me?"]);
  await expect(lissie).toHaveCount(replies.length);
  expect(await lissie.allInnerTexts()).toEqual(replies);
});

test("Lissie adds buy milk, the sidebar shows it, and her tool call survives a reload", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const open = page
    .getByRole("complementary", { name: "Your list" })
    .getByRole("region", { name: "Open" });
  const milk = open.getByRole("listitem").filter({ hasText: /buy milk/i });
  const added = page
    .getByTestId("lissie-tool-call")
    .filter({ hasText: /^Added “buy milk”/i });

  await signUp(page);
  await expect(open.getByRole("listitem")).toHaveCount(0);

  await send(page, "Please add buy milk to my list.");
  await expect(milk).toHaveCount(1);
  await expect(added).toHaveCount(1);

  const reconnected = page.waitForResponse((r) => isConnect(r.url()));
  await page.reload();
  await (await reconnected).finished();
  await expect(milk).toHaveCount(1);
  await expect(added).toHaveCount(1);
});
