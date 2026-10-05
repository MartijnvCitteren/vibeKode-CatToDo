// A form-level error in a live region that is always rendered, so screen readers announce new messages.
export function FormError({ message }: { message?: string }) {
  return (
    <p role="alert" className="text-sm text-red-700 dark:text-red-400">
      {message}
    </p>
  );
}
