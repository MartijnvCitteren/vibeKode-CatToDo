import { describe, expect, test } from "vitest";
import {
  dueDateSchema,
  newTodoSchema,
  todoChangesSchema,
  todoFilterSchema,
} from "./index";

describe("dueDateSchema", () => {
  test("accepts real calendar dates only", () => {
    expect(dueDateSchema.safeParse("2028-02-29").success).toBe(true);
    expect(dueDateSchema.safeParse("2026-02-29").success).toBe(false);
    expect(dueDateSchema.safeParse("2026-1-5").success).toBe(false);
    expect(dueDateSchema.safeParse("2026-10-05T00:00:00Z").success).toBe(false);
  });
});

describe("newTodoSchema", () => {
  test("trims the title and rejects an empty one", () => {
    expect(newTodoSchema.parse({ title: "  Nap  " })).toEqual({ title: "Nap" });
    expect(newTodoSchema.safeParse({ title: "   " }).success).toBe(false);
  });

  test("rejects unknown fields instead of dropping them", () => {
    expect(
      newTodoSchema.safeParse({ title: "Nap", due: "2026-10-05" }).success,
    ).toBe(false);
  });
});

describe("todoChangesSchema", () => {
  test("needs at least one change", () => {
    expect(todoChangesSchema.safeParse({}).success).toBe(false);
    expect(todoChangesSchema.safeParse({ dueDate: null }).success).toBe(true);
    expect(todoChangesSchema.safeParse({ done: false }).success).toBe(true);
  });
});

describe("todoFilterSchema", () => {
  test("defaults to every status", () => {
    expect(todoFilterSchema.parse({})).toEqual({ status: "all" });
    expect(todoFilterSchema.safeParse({ status: "later" }).success).toBe(false);
  });
});
