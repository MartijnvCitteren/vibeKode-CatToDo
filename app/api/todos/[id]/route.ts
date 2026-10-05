import { todoChangesSchema } from "@todo-cat/contract";
import { deleteTodo, getTodo, updateTodo } from "@/lib/todo-service";
import { parseBody, respond } from "../rest";

type Context = RouteContext<"/api/todos/[id]">;

export async function GET(request: Request, ctx: Context) {
  return respond(request, async (userId) => {
    const { id } = await ctx.params;
    return Response.json(await getTodo(userId, id));
  });
}

/** Changes title, due date or done; a missing field stays as it is and `dueDate: null` clears it. */
export async function PATCH(request: Request, ctx: Context) {
  return respond(request, async (userId) => {
    const { id } = await ctx.params;
    const changes = await parseBody(request, todoChangesSchema);
    return Response.json(await updateTodo(userId, id, changes));
  });
}

export async function DELETE(request: Request, ctx: Context) {
  return respond(request, async (userId) => {
    const { id } = await ctx.params;
    await deleteTodo(userId, id);
    return new Response(null, { status: 204 });
  });
}
