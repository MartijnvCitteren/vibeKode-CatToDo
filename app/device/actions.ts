"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

// What the device page shows after the user approves or denies a CLI login code.
export type DeviceState = { decision?: "approved" | "denied"; error?: string };

/**
 * Approves or denies a device login code for the signed-in user (see tech-docs/cli.md).
 * Better Auth first binds the code to this session (`GET /device`), then accepts the decision.
 */
export async function decideDevice(
  _: DeviceState,
  formData: FormData,
): Promise<DeviceState> {
  const userCode = String(formData.get("user_code") ?? "");
  const decision =
    formData.get("decision") === "approve" ? "approved" : "denied";
  const requestHeaders = await headers();
  try {
    await auth.api.deviceVerify({
      query: { user_code: userCode },
      headers: requestHeaders,
    });
    const body = { userCode };
    if (decision === "approved") {
      await auth.api.deviceApprove({ body, headers: requestHeaders });
    } else {
      await auth.api.deviceDeny({ body, headers: requestHeaders });
    }
  } catch (error) {
    if (isAPIError(error)) {
      // Device endpoints put their text in error_description rather than message.
      return {
        error:
          error.body?.error_description ??
          error.message ??
          "That code did not work",
      };
    }
    throw error;
  }
  return { decision };
}
