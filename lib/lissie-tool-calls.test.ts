import type { Todo } from "@todo-cat/contract";
import { describe, expect, test } from "vitest";
import {
  addTodoLine,
  listTodosLine,
  setTodoDoneLine,
} from "./lissie-tool-calls";

function todo(changes: Partial<Todo> = {}): Todo {
  return {
    id: "todo-1",
    title: "Feed the cat",
    dueDate: null,
    done: false,
    createdAt: "2026-10-06T08:00:00.000Z",
    completedAt: null,
    ...changes,
  };
}

const json = (value: unknown) => JSON.stringify(value);
const notFound = json({
  error: { code: "todo-not-found", message: "No todo with id todo-1" },
});

describe("listTodosLine", () => {
  test("counts what she found", () => {
    const todos = [todo(), todo({ done: true }), todo({ done: true })];
    expect(listTodosLine({}, json({ todos }))).toBe(
      "Looked at your list: 1 open, 2 done",
    );
    expect(listTodosLine({}, json({ todos: [] }))).toBe(
      "Looked at your list: nothing",
    );
  });

  test("names the search", () => {
    expect(listTodosLine({ search: "milk" }, json({ todos: [todo()] }))).toBe(
      "Searched your list for “milk”: 1 open",
    );
  });

  test("while running and for a result it can't read", () => {
    expect(listTodosLine({})).toBe("Looking at your list…");
    expect(listTodosLine({}, "{")).toBe(
      "Tried to look at your list, and failed",
    );
  });
});

describe("addTodoLine", () => {
  test("names the todo she added, with its due date", () => {
    expect(addTodoLine({ title: "Buy milk" })).toBe("Adding “Buy milk”…");
    expect(addTodoLine({}, json(todo({ title: "Buy milk" })))).toBe(
      "Added “Buy milk”",
    );
    expect(addTodoLine({}, json(todo({ dueDate: "2026-10-07" })))).toBe(
      "Added “Feed the cat”, due 2026-10-07",
    );
  });

  test("a result that is no todo", () => {
    expect(addTodoLine({}, json({ error: true, message: "Invalid" }))).toBe(
      "Tried to add a todo, and failed",
    );
  });
});

describe("setTodoDoneLine", () => {
  test("names the todo she marked done or reopened", () => {
    expect(setTodoDoneLine({ done: true })).toBe("Marking a todo done…");
    expect(setTodoDoneLine({ done: false })).toBe("Reopening a todo…");
    expect(setTodoDoneLine({}, json(todo({ done: true })))).toBe(
      "Marked “Feed the cat” done",
    );
    expect(setTodoDoneLine({}, json(todo()))).toBe("Reopened “Feed the cat”");
  });

  test("a todo she couldn't find", () => {
    expect(setTodoDoneLine({ done: true }, notFound)).toBe(
      "Couldn't find that todo",
    );
  });
});
