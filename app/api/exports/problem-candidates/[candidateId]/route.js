import { ApiError, jsonError, requireUser } from "../../../../../lib/auth/require-user.js";
import {
  markdownAttachmentHeaders,
  problemCardExportFilename,
  renderProblemCardMarkdown,
} from "../../../../../lib/exports/markdown.mjs";
import { loadProblemCardExport } from "../../../../../lib/exports/service.mjs";
import { createServiceClient } from "../../../../../lib/supabase/service.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  try {
    const { candidateId } = await params;
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();
    const payload = await loadProblemCardExport(serviceClient, candidateId, userId);
    if (!payload) throw new ApiError(404, "problem_card_not_found", "Problem Card not found");

    const filename = problemCardExportFilename(candidateId);
    return new Response(renderProblemCardMarkdown(payload), {
      status: 200,
      headers: markdownAttachmentHeaders(filename),
    });
  } catch (error) {
    return jsonError(error);
  }
}
