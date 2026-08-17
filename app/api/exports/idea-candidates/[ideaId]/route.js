import { ApiError, jsonError, requireUser } from "../../../../../lib/auth/require-user.js";
import {
  ideaCandidateExportFilename,
  markdownAttachmentHeaders,
  renderIdeaCandidateMarkdown,
} from "../../../../../lib/exports/markdown.mjs";
import { loadIdeaCandidateExport } from "../../../../../lib/exports/service.mjs";
import { createServiceClient } from "../../../../../lib/supabase/service.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  try {
    const { ideaId } = await params;
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();
    const payload = await loadIdeaCandidateExport(serviceClient, ideaId, userId);
    if (!payload) throw new ApiError(404, "idea_candidate_not_found", "Idea Candidate not found");

    const filename = ideaCandidateExportFilename(ideaId);
    return new Response(renderIdeaCandidateMarkdown(payload), {
      status: 200,
      headers: markdownAttachmentHeaders(filename),
    });
  } catch (error) {
    return jsonError(error);
  }
}
