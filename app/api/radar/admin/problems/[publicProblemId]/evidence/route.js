import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../../../../../lib/candidates/review-api.mjs";
import { mapRadarRpcError, unwrapRpcRow } from "../../../../../../../lib/radar/api.mjs";
import { normalizePublicEvidenceCreate } from "../../../../../../../lib/radar/contracts.mjs";
import { requireRadarCurator } from "../../../../../../../lib/radar/curator.js";
import { loadAdminPublicProblemDetail } from "../../../../../../../lib/radar/service.mjs";
import { createServiceClient } from "../../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function publicProblemIdFrom(params) {
  const resolved = await params;
  const value = resolved.publicProblemId;
  if (!UUID_RE.test(value ?? "")) throw new ApiError(400, "invalid_public_problem_id", "Invalid Public Problem id");
  return value;
}

export async function POST(request, { params }) {
  try {
    const publicProblemId = await publicProblemIdFrom(params);
    const serviceClient = createServiceClient();
    const { userId } = await requireRadarCurator(serviceClient);
    const body = await readObjectBody(request);

    let input;
    try {
      input = normalizePublicEvidenceCreate(body);
    } catch (error) {
      throw new ApiError(400, "invalid_public_evidence_create", error.message);
    }

    const { data, error } = await serviceClient.rpc("ar_add_public_problem_evidence", {
      p_problem_id: publicProblemId,
      p_curator_user_id: userId,
      p_excerpt: input.excerpt,
      p_publication_basis: input.publication_basis,
      p_source_type: input.source_type,
      p_source_label: input.source_label,
      p_source_url: input.source_url,
      p_source_key: input.source_key,
      p_source_observed_at: input.source_observed_at,
      p_order_index: input.order_index,
    });
    if (error) {
      throw mapRadarRpcError(error, "public_evidence_create_failed", "Failed to add Public Evidence");
    }

    const created = unwrapRpcRow(data);
    if (!created?.id) throw new ApiError(500, "public_evidence_create_failed", "Public Evidence was not persisted");
    const detail = await loadAdminPublicProblemDetail(serviceClient, publicProblemId);
    if (!detail) throw new ApiError(404, "public_problem_not_found", "Public Problem not found");
    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
