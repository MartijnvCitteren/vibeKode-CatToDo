import Link from "next/link";
import type { ComponentProps } from "react";

export function TextLink(props: ComponentProps<typeof Link>) {
  return (
    <Link
      className="font-semibold text-amber-700 underline-offset-4 hover:underline dark:text-amber-500"
      {...props}
    />
  );
}
