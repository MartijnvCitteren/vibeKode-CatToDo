import { expect, test } from "@playwright/test";

test("signs up, signs out and signs back in", async ({ page }) => {
  // Unique, so the test also passes against a reused E2E_DATABASE_URL.
  const email = `lissie-${Date.now()}@example.com`;
  const password = "tuna-o-clock";
  const greeting = page.getByRole("heading", { name: "Hi, Lissie" });

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole("link", { name: "Sign up" }).click();
  await page.getByLabel("Name").fill("Lissie");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(greeting).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    /invalid email or password/i,
  );

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(greeting).toBeVisible();
});
