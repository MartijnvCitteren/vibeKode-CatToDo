import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ProgressBar } from "./progress-bar";

const fill = (bar: HTMLElement) =>
  (bar.firstElementChild as HTMLElement).style.width;

test("fills to value out of max and says so to assistive tech", () => {
  render(<ProgressBar value={3} max={4} label="Done" />);
  const bar = screen.getByRole("progressbar", { name: "Done" });
  expect(bar.getAttribute("aria-valuenow")).toBe("3");
  expect(bar.getAttribute("aria-valuemax")).toBe("4");
  expect(fill(bar)).toBe("75%");
  expect(screen.getByText("75%")).toBeDefined();
});

test("draws an empty bar when there is nothing to do", () => {
  render(<ProgressBar value={0} max={0} label="Done" />);
  const bar = screen.getByRole("progressbar", { name: "Done" });
  expect(bar.getAttribute("aria-valuenow")).toBe("0");
  expect(fill(bar)).toBe("0%");
});

test("never overfills or underfills", () => {
  render(<ProgressBar value={9} max={4} label="Over" />);
  render(<ProgressBar value={-1} max={4} label="Under" />);
  expect(fill(screen.getByRole("progressbar", { name: "Over" }))).toBe("100%");
  expect(fill(screen.getByRole("progressbar", { name: "Under" }))).toBe("0%");
});
