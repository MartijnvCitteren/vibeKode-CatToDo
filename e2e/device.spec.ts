import { expect, test } from "@playwright/test";
import { CLI_CLIENT_ID } from "@todo-cat/contract";

test("approves a CLI login code after signing up from the device page", async ({
  page,
  request,
}) => {
  // What `todo-cat login` does first: ask Better Auth for a device code.
  const started = await request.post("/api/auth/device/code", {
    data: { client_id: CLI_CLIENT_ID },
  });
  expect(started.ok()).toBe(true);
  const { user_code, device_code } = await started.json();

  // Signed out, the device page sends the user through signup and back.
  await page.goto(`/device?user_code=${user_code}`);
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByRole("link", { name: "Sign up" }).click();
  await page.getByLabel("Name").fill("Lissie");
  await page.getByLabel("Email").fill(`device-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("tuna-o-clock");
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(page.getByText(user_code)).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status")).toHaveText(/CLI is logged in/);

  // The CLI's next poll gets a session token that the REST API accepts.
  const token = await request.post("/api/auth/device/token", {
    data: {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code,
      client_id: CLI_CLIENT_ID,
    },
  });
  expect(token.ok()).toBe(true);
  const { access_token } = await token.json();
  const todos = await request.get("/api/todos", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  expect(todos.status()).toBe(200);
});
