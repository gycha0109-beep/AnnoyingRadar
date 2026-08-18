import { redirect } from "next/navigation";

import PersonalWorkspace from "../components/personal-workspace.js";
import { createServerSupabaseClient } from "../../lib/supabase/server.js";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user ?? null;

  if (!user) redirect("/login");

  return <PersonalWorkspace user={user} />;
}
