import { handler } from "../runtime";

// The CopilotKit runtime serves its sub-routes (/info, /agent/lissie/run, …) from one catch-all;
// its hooks, not the verbs exported here, decide what a caller may reach (see ../runtime.ts).
export { handler as DELETE, handler as GET, handler as PATCH, handler as POST };
