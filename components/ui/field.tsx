import type { ComponentProps } from "react";

// A labelled text input; the label wraps the input, so no id is needed to link them.
export function Field({
  label,
  ...inputProps
}: { label: string } & ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
      {label}
      <input
        className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base font-normal text-zinc-950 outline-none transition-colors placeholder:text-zinc-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/25 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        {...inputProps}
      />
    </label>
  );
}
