import type { Todo } from "@todo-cat/contract";

/** One todo per line, full id included, so a reader can pass it straight to `done` or `delete`. */
export function formatTodo(todo: Todo): string {
  const due = todo.dueDate ? `  (due ${todo.dueDate})` : "";
  return `${todo.done ? "[x]" : "[ ]"} ${todo.id}  ${todo.title}${due}`;
}

export function formatTodos(todos: Todo[]): string {
  return todos.length ? todos.map(formatTodo).join("\n") : "No todos.";
}

/** `ABCDEFGH` as `ABCD-EFGH`, easier to read aloud and to type. */
export function formatUserCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
