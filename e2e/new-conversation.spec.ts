import { expect, test } from "@playwright/test";

// The whole flow needs the model, so it lives in e2e/chat/; this checks the button without one.
test("a fresh human's empty chat has nothing to start over from", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Lissie's human");
  await page.getByLabel("Email").fill(`fresh-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("tuna-o-clock");
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(
    page.getByRole("button", { name: "New conversation" }),
  ).toBeDisabled();
});
