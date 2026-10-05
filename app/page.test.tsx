import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Page from "./page";

test("home page renders its heading", () => {
  render(<Page />);
  expect(screen.getByRole("heading", { level: 1 })).toBeDefined();
});
