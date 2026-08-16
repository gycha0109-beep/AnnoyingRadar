import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "../../../lib/supabase/server.js";
import ProjectDetail from "./project-detail.js";

export const dynamic = "force-dynamic";

export default async function ResearchProjectPage({ params }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) redirect("/login");

  const { projectId } = await params;

  return (
    <main className="stack page-shell">
      <nav className="topbar">
        <Link className="brand" href="/">어노잉 레이더</Link>
        <div className="inline-actions">
          <Link className="button-link" href="/projects">Projects</Link>
          <Link className="button-link" href={`/ideas?project=${encodeURIComponent(projectId)}`}>Project Idea Board</Link>
          <Link className="button-link" href="/problems">Problem Cards</Link>
          <Link className="button-link" href="/ideas">Ideas</Link>
          <Link className="button-link" href="/">대시보드</Link>
        </div>
      </nav>
      <ProjectDetail projectId={projectId} />
    </main>
  );
}
