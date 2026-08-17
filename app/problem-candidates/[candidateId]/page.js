import Link from "next/link";
import { redirect } from "next/navigation";

import AlternativeNotesPanel from "./alternative-notes-panel.js";
import CandidateReview from "./candidate-review.js";
import ProblemCardIdeas from "./problem-card-ideas.js";
import ResearchProjectPanel from "./research-project-panel.js";
import SavedProblemPanel from "./saved-problem-panel.js";
import { createServerSupabaseClient } from "../../../lib/supabase/server.js";

export const dynamic = "force-dynamic";

export default async function ProblemCandidatePage({ params }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) redirect("/login");
  const { candidateId } = await params;

  return (
    <main className="stack page-shell">
      <nav className="topbar">
        <Link className="brand" href="/">어노잉 레이더</Link>
        <div className="inline-actions">
          <a
            className="button-link"
            href={`/api/exports/problem-candidates/${encodeURIComponent(candidateId)}`}
          >
            Markdown 내보내기
          </a>
          <Link className="button-link" href="/projects">Projects</Link>
          <Link className="button-link" href="/problems">Problem Cards</Link>
          <Link className="button-link" href="/ideas">Idea 목록</Link>
          <Link className="button-link" href="/">대시보드</Link>
        </div>
      </nav>
      <CandidateReview candidateId={candidateId} />
      <SavedProblemPanel candidateId={candidateId} />
      <ResearchProjectPanel candidateId={candidateId} />
      <AlternativeNotesPanel candidateId={candidateId} />
      <ProblemCardIdeas candidateId={candidateId} />
    </main>
  );
}
