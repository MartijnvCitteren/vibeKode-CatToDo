import type { ComponentProps } from "react";

// Vertical spacing for a form's fields, error and submit button.
export function Form(props: ComponentProps<"form">) {
  return <form className="flex flex-col gap-4" {...props} />;
}
