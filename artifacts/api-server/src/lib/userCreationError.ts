/** Clerk puts actionable validation details in errors[], not Error.message. */
export function userCreationError(error: unknown): { status: number; error: string } {
  if (typeof error === "object" && error !== null && "clerkError" in error && error.clerkError === true) {
    const failure = error as { status?: number; errors?: Array<{ longMessage?: string; message?: string }> };
    if (failure.status === 400 || failure.status === 422 || failure.status === 409) {
      const messages = (Array.isArray(failure.errors) ? failure.errors : [])
        .map(detail => detail?.longMessage || detail?.message)
        .filter((message): message is string => typeof message === "string" && message.trim().length > 0);
      return {
        status: failure.status,
        error: messages.length
          ? [...new Set(messages)].join(" ")
          : "The identity service rejected the user details. Check the email address and password requirements.",
      };
    }
    if (failure.status === 429) {
      return { status: 429, error: "Too many requests. Wait a moment before trying again." };
    }
  }
  return { status: 503, error: "Unable to create user right now. Please try again later." };
}
