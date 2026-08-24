export const PUBLICATION_READINESS_VERSION = "public-problem-publication-readiness-v0.1";

export function buildPublicProblemPublicationReadiness({ problem, evidence = [], incidentLinks = [] } = {}) {
  const rows = Array.isArray(evidence) ? evidence : [];
  const bindingSet = new Set((incidentLinks ?? []).map((link) => bindingKey(link.source_signal_id, link.incident_id)));
  const distinctSources = new Set(rows.map((item) => item.source_key).filter(Boolean)).size;
  const distinctIncidents = new Set(rows.map((item) => item.incident_id).filter(Boolean)).size;
  const missingIncidentCount = rows.filter((item) => !item.incident_id).length;
  const invalidBasisCount = rows.filter(
    (item) => !["external_public", "user_opt_in"].includes(item.publication_basis),
  ).length;
  const invalidExternalBindingCount = rows.filter((item) => (
    item.publication_basis === "external_public"
    && (
      !item.source_signal_id
      || !item.incident_id
      || !bindingSet.has(bindingKey(item.source_signal_id, item.incident_id))
    )
  )).length;

  const checks = [
    { code: "title_present", label: "제목이 작성됨", ok: Boolean(problem?.title?.trim()) },
    { code: "summary_present", label: "요약이 작성됨", ok: Boolean(problem?.summary?.trim()) },
    { code: "evidence_minimum", label: "공개 Evidence 2건 이상", ok: rows.length >= 2 },
    { code: "source_diversity", label: "서로 다른 source_key 2개 이상", ok: distinctSources >= 2 },
    { code: "incident_identity_complete", label: "모든 Evidence에 Incident identity 존재", ok: missingIncidentCount === 0 },
    { code: "incident_diversity", label: "서로 다른 Incident 2건 이상", ok: distinctIncidents >= 2 },
    { code: "publication_basis_valid", label: "Evidence basis가 공개 허용값만 사용", ok: invalidBasisCount === 0 },
    {
      code: "external_lineage_valid",
      label: "external_public Evidence의 Source ↔ Incident lineage가 유효함",
      ok: invalidExternalBindingCount === 0,
    },
  ];

  return {
    version: PUBLICATION_READINESS_VERSION,
    structurally_publishable: checks.every((item) => item.ok),
    editorially_approved: false,
    publication_state: problem?.status === "published" ? "published" : "not_published",
    checks,
    stats: {
      evidence_count: rows.length,
      distinct_source_count: distinctSources,
      distinct_incident_count: distinctIncidents,
      missing_incident_count: missingIncidentCount,
      invalid_basis_count: invalidBasisCount,
      invalid_external_binding_count: invalidExternalBindingCount,
    },
  };
}

function bindingKey(sourceSignalId, incidentId) {
  return `${String(sourceSignalId ?? "")}::${String(incidentId ?? "")}`;
}
