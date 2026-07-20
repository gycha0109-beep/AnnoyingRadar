import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "../supabase/server.js";

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function jsonError(error) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  console.error(error);

  return NextResponse.json(
    {
      error: {
        code: "internal_server_error",
        message: "Internal server error",
      },
    },
    { status: 500 },
  );
}

export async function requireUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    throw new ApiError(401, "login_required", "Login is required");
  }

  return {
    user,
    userId: user.id,
  };
}

export async function assertRawInputOwner(
  rawInputId,
  userId,
  serviceClient,
  columns = "*",
) {
  const { data, error } = await serviceClient
    .from("ar_raw_inputs")
    .select(columns)
    .eq("id", rawInputId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error(error);
    throw new ApiError(
      500,
      "raw_input_owner_check_failed",
      "Failed to verify raw input owner",
    );
  }

  if (!data) {
    throw new ApiError(404, "raw_input_not_found", "Raw input not found");
  }

  return data;
}

export async function hasConfirmedRawInputCandidate(
  rawInputId,
  userId,
  serviceClient,
) {
  const { data, error } = await serviceClient
    .from("ar_problem_candidates")
    .select("id")
    .eq("raw_input_id", rawInputId)
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(error);
    throw new ApiError(
      500,
      "confirmed_candidate_check_failed",
      "Failed to check confirmed candidates",
    );
  }

  return Boolean(data);
}
