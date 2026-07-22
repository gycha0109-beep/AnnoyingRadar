import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "../../../lib/supabase/server.js";
import CandidateGrouping from "./candidate-grouping.js";
import EvidenceReview from "./evidence-review.js";
import RawInputEditor from "./raw-input-editor.js";

export const dynamic = "force-dynamic";

export default async function RawInputDetailPage({ params }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    redirect("/login");
  }

  const { rawInputId } = await params;

  return (
    <main className="stack page-shell">
      <nav className="topbar">
        <Link className="brand" href="/">어노잉 레이더</Link>
        <Link className="button-link" href="/">대시보드</Link>
      </nav>
      <RawInputEditor rawInputId={rawInputId} />
      <EvidenceReview rawInputId={rawInputId} />
      <CandidateGrouping rawInputId={rawInputId} />
    </main>
  );
}
