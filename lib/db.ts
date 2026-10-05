import "server-only";
import { drizzle } from "drizzle-orm/libsql";
import { authRelations } from "./auth-schema";

// The only place that opens the database (see tech-docs/database.md).
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");

export const db = drizzle({ connection: { url }, relations: authRelations });
