import { expect, test } from "vitest";
import { nextPath, withNext } from "./next-path";

test("keeps a path on this site", () => {
  expect(nextPath("/device?user_code=ABCDEFGH")).toBe(
    "/device?user_code=ABCDEFGH",
  );
  expect(nextPath("/")).toBe("/");
});

test("falls back to / for anything that could leave the site", () => {
  for (const next of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "device",
    "",
    undefined,
    null,
    ["/device"],
  ]) {
    expect(nextPath(next)).toBe("/");
  }
});

test("links to login with next only when it goes somewhere", () => {
  expect(withNext("/login", "/")).toBe("/login");
  expect(withNext("/signup", "/device?user_code=AB")).toBe(
    "/signup?next=%2Fdevice%3Fuser_code%3DAB",
  );
});
