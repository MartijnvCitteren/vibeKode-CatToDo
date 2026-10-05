import { vi } from "vitest";

// `server-only` throws outside a React Server bundle; Node tests exercise server modules directly.
vi.mock("server-only", () => ({}));
