import { ApiError, jsonError, requireUser } from "../../../../../lib/auth/require-user.js";
import {
  markdownAttachmentHeaders,
  renderResearchProjectMarkdown,
  researchProjectExportFilename,
} from "../../../../../lib/exports/markdown.mjs";
import { loadResearchProjectExport } from "../../../../../lib/exports/service.mjs";
import { createServiceClient } from "../../../../../lib/supabase/service.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  try {
    const { projectId } = await params;
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();
    const payload = await loadResearchProjectExport(serviceClient, projectId, userId);
    if (!payload) throw new ApiError(404, "research_project_not_found", "Research Project not found");

    const filename = researchProjectExportFilename(projectId);
    return new Response(renderResearchProjectMarkdown(payload), {
      status: 200,
      headers: markdownAttachmentHeaders(filename),
    });
  } catch (error) {
    return jsonError(error);
  }
}
