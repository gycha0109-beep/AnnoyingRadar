import {
  buildCuratorIncidentDecisionPacket,
  SOURCE_INCIDENT_DECISION_PACKET_VERSION,
} from "./source-incident-decision-packet-service.mjs";

export const SOURCE_INCIDENT_CURATOR_DECISION_TABLE = "ar_source_incident_curator_decisions";
export const SOURCE_INCIDENT_CURATOR_DECISION_SCHEMA_VERSION = "source-incident-curator-decision-v0.1";
export const SOURCE_INCIDENT_CURATOR_DECISION_RPC = "ar_record_source_incident_curator_decision";

export class SourceIncidentCuratorDecisionError extends Error {
  constructor(code, message, { status = 409 } = {}) {
    super(message);
    this.name = "SourceIncidentCuratorDecisionError";
    this.code = code;
    this.status = status;
  }
}

const cleanOptional = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

export function normalizeCuratorIncidentDecision(input = {}) {
  const evidenceDecision = cleanOptional(input.evidenceDecision);
  const incidentAction = cleanOptional(input.incidentAction);
  const existingIncidentId = cleanOptional(input.existingIncidentId);
  const newIncidentKey = cleanOptional(input.newIncidentKey);
  const newIncidentLabel = cleanOptional(input.newIncidentLabel);
  const decisionReason = cleanOptional(input.decisionReason);

  if (!evidenceDecision || !["accept", "reject"].includes(evidenceDecision)) {
    throw new SourceIncidentCuratorDecisionError(
      "curator_incident_evidence_decision_invalid",
      "evidenceDecision must be accept or reject",
      { status: 400 },
    );
  }

  if (newIncidentKey && newIncidentKey.length > 500) {
    throw new SourceIncidentCuratorDecisionError(
      "curator_incident_key_too_long",
      "newIncidentKey must be at most 500 characters",
      { status: 400 },
    );
  }
  if (newIncidentLabel && newIncidentLabel.length > 500) {
    throw new SourceIncidentCuratorDecisionError(
      "curator_incident_label_too_long",
      "newIncidentLabel must be at most 500 characters",
      { status: 400 },
    );
  }
  if (decisionReason && decisionReason.length > 2000) {
    throw new SourceIncidentCuratorDecisionError(
      "curator_incident_reason_too_long",
      "decisionReason must be at most 2000 characters",
      { status: 400 },
    );
  }

  if (evidenceDecision === "reject") {
    if (incidentAction || existingIncidentId || newIncidentKey || newIncidentLabel) {
      throw new SourceIncidentCuratorDecisionError(
        "curator_incident_reject_shape_invalid",
        "Rejected evidence cannot carry Incident assignment fields",
        { status: 400 },
      );
    }
    return {
      evidence_decision: "reject",
      incident_action: null,
      existing_incident_id: null,
      new_incident_key: null,
      new_incident_label: null,
      decision_reason: decisionReason,
      incident_persistence_authorized: false,
    };
  }

  if (!incidentAction || !["create_new", "reuse_existing", "hold"].includes(incidentAction)) {
    throw new SourceIncidentCuratorDecisionError(
      "curator_incident_action_invalid",
      "Accepted evidence requires incidentAction create_new, reuse_existing, or hold",
      { status: 400 },
    );
  }

  if (incidentAction === "hold") {
    if (existingIncidentId || newIncidentKey || newIncidentLabel) {
      throw new SourceIncidentCuratorDecisionError(
        "curator_incident_hold_shape_invalid",
        "hold cannot carry Incident identity fields",
        { status: 400 },
      );
    }
    return {
      evidence_decision: "accept",
      incident_action: "hold",
      existing_incident_id: null,
      new_incident_key: null,
      new_incident_label: null,
      decision_reason: decisionReason,
      incident_persistence_authorized: false,
    };
  }

  if (incidentAction === "create_new") {
    if (existingIncidentId || !newIncidentKey) {
      throw new SourceIncidentCuratorDecisionError(
        "curator_incident_create_shape_invalid",
        "create_new requires newIncidentKey and forbids existingIncidentId",
        { status: 400 },
      );
    }
    return {
      evidence_decision: "accept",
      incident_action: "create_new",
      existing_incident_id: null,
      new_incident_key: newIncidentKey,
      new_incident_label: newIncidentLabel,
      decision_reason: decisionReason,
      incident_persistence_authorized: true,
    };
  }

  if (!existingIncidentId || newIncidentKey || newIncidentLabel) {
    throw new SourceIncidentCuratorDecisionError(
      "curator_incident_reuse_shape_invalid",
      "reuse_existing requires existingIncidentId and forbids new Incident fields",
      { status: 400 },
    );
  }
  return {
    evidence_decision: "accept",
    incident_action: "reuse_existing",
    existing_incident_id: existingIncidentId,
    new_incident_key: null,
    new_incident_label: null,
    decision_reason: decisionReason,
    incident_persistence_authorized: true,
  };
}

async function requireNoExistingDecision(serviceClient, formationAssessmentId) {
  const { data, error } = await serviceClient
    .from(SOURCE_INCIDENT_CURATOR_DECISION_TABLE)
    .select("id")
    .eq("formation_assessment_id", formationAssessmentId)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    throw new SourceIncidentCuratorDecisionError(
      "curator_incident_decision_already_recorded",
      "This exact Formation assessment already has a final curator Incident decision",
    );
  }
}

function validateDecisionAgainstPacket(decision, packet) {
  const incidents = packet?.existing_authority?.incidents ?? [];
  if (decision.incident_action === "create_new") {
    if (incidents.some((incident) => incident.incident_key === decision.new_incident_key)) {
      throw new SourceIncidentCuratorDecisionError(
        "curator_incident_create_key_exists",
        "create_new requires an unused Incident key in the current curator packet authority",
      );
    }
  }
  if (decision.incident_action === "reuse_existing") {
    if (!incidents.some((incident) => incident.incident_id === decision.existing_incident_id)) {
      throw new SourceIncidentCuratorDecisionError(
        "curator_incident_reuse_target_missing",
        "reuse_existing requires an Incident present in the current curator packet authority",
      );
    }
  }
}

function normalizeRpcDecisionRow(data) {
  if (Array.isArray(data)) {
    if (data.length !== 1) {
      throw new SourceIncidentCuratorDecisionError(
        "curator_incident_decision_readback_cardinality",
        "Curator Incident decision RPC must return exactly one durable row",
      );
    }
    return data[0];
  }
  if (data && typeof data === "object") return data;
  throw new SourceIncidentCuratorDecisionError(
    "curator_incident_decision_readback_missing",
    "Curator Incident decision RPC returned no durable decision row",
  );
}

function safeDecisionAuthority(row) {
  return {
    authority: "durable_curator_incident_decision_not_incident_persistence",
    decision_schema_version: row.decision_schema_version,
    decision_packet_version: row.decision_packet_version,
    decision_id: row.id,
    formation_assessment_id: row.formation_assessment_id,
    source_signal_id: row.source_signal_id,
    reviewed_context: {
      content_sha256: row.reviewed_context_content_sha256,
      char_count: row.reviewed_context_char_count,
    },
    reviewed_evidence: {
      quote_sha256: row.reviewed_evidence_quote_sha256,
      quote_char_count: row.reviewed_evidence_quote_char_count,
    },
    decision: {
      evidence_decision: row.evidence_decision,
      incident_action: row.incident_action,
      existing_incident_id: row.existing_incident_id,
      new_incident_key: row.new_incident_key,
      new_incident_label: row.new_incident_label,
      decision_reason: row.decision_reason,
      incident_persistence_authorized: row.incident_persistence_authorized,
    },
    decided_by_curator_user_id: row.decided_by_curator_user_id,
    decided_at: row.decided_at,
    runtime_posture: {
      model_calls: 0,
      database_write_statements: 1,
      curator_decision_rows_written: 1,
      incident_writes: 0,
      source_incident_link_writes: 0,
      public_problem_writes: 0,
      public_evidence_writes: 0,
      public_feed_writes: 0,
      publication_performed: false,
    },
  };
}

export async function recordCuratorIncidentDecision(serviceClient, {
  signalId,
  formationAssessmentId,
  curatorUserId,
  decision: inputDecision,
  fetchImpl = globalThis.fetch,
  fetchContext,
} = {}) {
  const normalizedSignalId = cleanOptional(signalId);
  const normalizedFormationAssessmentId = cleanOptional(formationAssessmentId);
  const normalizedCuratorUserId = cleanOptional(curatorUserId);
  if (!normalizedSignalId) {
    throw new SourceIncidentCuratorDecisionError("source_signal_id_required", "Source Signal id is required", { status: 400 });
  }
  if (!normalizedFormationAssessmentId) {
    throw new SourceIncidentCuratorDecisionError(
      "formation_assessment_id_required",
      "An explicit Formation assessment id is required; latest-row inference is not allowed",
      { status: 400 },
    );
  }
  if (!normalizedCuratorUserId) {
    throw new SourceIncidentCuratorDecisionError("curator_user_id_required", "Authenticated curator user id is required", { status: 400 });
  }

  const normalizedDecision = normalizeCuratorIncidentDecision(inputDecision);
  const packet = await buildCuratorIncidentDecisionPacket(serviceClient, {
    signalId: normalizedSignalId,
    formationAssessmentId: normalizedFormationAssessmentId,
    fetchImpl,
    fetchContext,
  });

  if (packet.version !== SOURCE_INCIDENT_DECISION_PACKET_VERSION) {
    throw new SourceIncidentCuratorDecisionError(
      "curator_incident_packet_version_mismatch",
      "Server curator Incident packet version drifted",
    );
  }

  validateDecisionAgainstPacket(normalizedDecision, packet);
  await requireNoExistingDecision(serviceClient, normalizedFormationAssessmentId);

  const context = packet.formation_assessment_authority.context;
  const evidence = packet.formation_assessment_authority.evidence;
  const { data, error } = await serviceClient.rpc(SOURCE_INCIDENT_CURATOR_DECISION_RPC, {
    p_curator_user_id: normalizedCuratorUserId,
    p_decision_schema_version: SOURCE_INCIDENT_CURATOR_DECISION_SCHEMA_VERSION,
    p_decision_packet_version: packet.version,
    p_formation_assessment_id: normalizedFormationAssessmentId,
    p_source_signal_id: normalizedSignalId,
    p_reviewed_context_content_sha256: context.content_sha256,
    p_reviewed_context_char_count: context.char_count,
    p_reviewed_evidence_quote_sha256: evidence.quote_sha256,
    p_reviewed_evidence_quote_char_count: evidence.quote_char_count,
    p_evidence_decision: normalizedDecision.evidence_decision,
    p_incident_action: normalizedDecision.incident_action,
    p_existing_incident_id: normalizedDecision.existing_incident_id,
    p_new_incident_key: normalizedDecision.new_incident_key,
    p_new_incident_label: normalizedDecision.new_incident_label,
    p_decision_reason: normalizedDecision.decision_reason,
  });
  if (error) {
    throw new SourceIncidentCuratorDecisionError(
      "curator_incident_decision_persistence_failed",
      error.message || "Failed to persist curator Incident decision",
    );
  }

  const row = normalizeRpcDecisionRow(data);
  if (!row?.id) {
    throw new SourceIncidentCuratorDecisionError(
      "curator_incident_decision_readback_missing",
      "Curator Incident decision RPC returned an invalid durable decision row",
    );
  }
  return safeDecisionAuthority(row);
}
