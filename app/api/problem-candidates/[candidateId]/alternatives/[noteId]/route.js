import { NextResponse } from "next/server";

import {
  ApiError,
  assertCandidateOwner,
  jsonError,
  requireUser,
} from "../../../../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../../../../lib/candidates/review-api.mjs";
import { normalizeProblemAlternativePatch } from "../../../../../../lib/problem-alternatives/contracts.mjs";
import { mapProblemAlternativeRpcError } from "../../../../../../lib/problem-alternatives/review-api.mjs";
import { loadProblemAlternativeNote } from "../../../../../../lib/problem-alternatives/service.mjs";
import { createServiceClient } from "../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

async function idsFrom(params) {
  const resolved = await params;
  return { candidateId: resolved.candidateId, noteId: resolved.noteId };
}

async function assertScopedNote(serviceClient, candidateId, noteId, userId) {
  await assertCandidateOwner(candidateId, userId, serviceClient, "id");
  let note;
  try {
    note = await loadProblemAlternativeNote(serviceClient, candidateId, noteId, userId);
  } catch (error) {
    console.error(error);
    throw new ApiError(500, "problem_alternative_read_failed", "Failed to verify Problem alternative note");
  }
  if (!note) throw new ApiError(404, "problem_alternative_not_found", "Problem alternative note not found");
  return note;
}

export async function PATCH(request, { params }) {
  try {
    const { candidateId, noteId } = await idsFrom(params);
    const { userId } = await requireUser();
    const body = await readObjectBody(request);

    let patch;
    try {
      patch = normalizeProblemAlternativePatch(body);
    } catch (error) {
      throw new ApiError(400, "invalid_problem_alternative_request", error.message);
    }

    const serviceClient = createServiceClient();
    await assertScopedNote(serviceClient, candidateId, noteId, userId);
    const { data, error } = await serviceClient.rpc("ar_update_problem_alternative_note", {
      p_note_id: noteId,
      p_user_id: userId,
      p_patch: patch,
    });
    if (error) {
      throw mapProblemAlternativeRpcError(
        error,
        "problem_alternative_update_failed",
        "Failed to update Problem alternative note",
      );
    }
    if (!data) throw new ApiError(500, "problem_alternative_update_failed", "Problem alternative update was not persisted");

    return NextResponse.json({ note: data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request, { params }) {
  try {
    const { candidateId, noteId } = await idsFrom(params);
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();
    await assertScopedNote(serviceClient, candidateId, noteId, userId);

    const { data, error } = await serviceClient.rpc("ar_delete_problem_alternative_note", {
      p_note_id: noteId,
      p_user_id: userId,
    });
    if (error) {
      throw mapProblemAlternativeRpcError(
        error,
        "problem_alternative_delete_failed",
        "Failed to delete Problem alternative note",
      );
    }
    if (data !== noteId) throw new ApiError(500, "problem_alternative_delete_failed", "Problem alternative delete was not persisted");

    return NextResponse.json({ deleted_note_id: data });
  } catch (error) {
    return jsonError(error);
  }
}
