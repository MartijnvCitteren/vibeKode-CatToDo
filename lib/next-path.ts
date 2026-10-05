/**
 * Where to send a user after login: the `next` path if it stays on this site, else `/`.
 * Only a single leading slash passes, so a crafted `?next=//evil.example` cannot redirect off-site.
 */
export function nextPath(next: string | string[] | undefined | null): string {
  if (typeof next !== "string") return "/";
  return /^\/(?![/\\])/.test(next) ? next : "/";
}

/** `/login` (or `/signup`) that comes back to `next` afterwards. */
export function withNext(page: "/login" | "/signup", next: string): string {
  return next === "/" ? page : `${page}?${new URLSearchParams({ next })}`;
}
