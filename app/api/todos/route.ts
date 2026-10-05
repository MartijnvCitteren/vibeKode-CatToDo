import { newTodoSchema, todoFilterSchema } from "@todo-cat/contract";
import { addTodo, listTodos } from "@/lib/todo-service";
import { parse, parseBody, respond } from "./rest";

/** Lists the user's todos; `?status=open|done|all` and `?search=` filter them. */
export async function GET(request: Request) {
  return respond(request, async (userId) => {
    const { searchParams } = new URL(request.url);
    const filter = parse(todoFilterSchema, Object.fromEntries(searchParams));
    return Response.json(await listTodos(userId, filter));
  });
}

export async function POST(request: Request) {
  return respond(request, async (userId) => {
    const input = await parseBody(request, newTodoSchema);
    return Response.json(await addTodo(userId, input), { status: 201 });
  });
}
