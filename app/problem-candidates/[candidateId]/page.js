import Link from "next/link";
import { redirect } from "next/navigation";

import CandidateReview from "./candidate-review.js";
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
        <Link className="button-link" href="/">대시보드</Link>
      </nav>
      <CandidateReview candidateId={candidateId} />
    </main>
  );
}
