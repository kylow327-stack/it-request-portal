import { NextResponse } from "next/server";

/** Route wrappers so a thrown error is JSON `{ error }` instead of an empty 500. */
export function withApi<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error(error);
      if (error instanceof SyntaxError) {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Request failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
