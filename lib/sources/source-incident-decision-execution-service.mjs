export const SOURCE_INCIDENT_DECISION_EXECUTION_TABLE = "ar_source_incident_decision_executions";
export const SOURCE_INCIDENT_DECISION_EXECUTION_RPC = "ar_execute_source_incident_curator_decision";

export class SourceIncidentDecisionExecutionError extends Error {
  constructor(code, message, { status = 409 } = {}) {
    super(message);
    this.name = "SourceIncidentDecisionExecutionError";
    this.code = code;
    this.status = status;
  }
}

const cleanRequired = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

function normalizeRpcExecutionRow(data) {
  if (Array.isArray(data)) {
    if (data.length !== 1) {
      throw new SourceIncidentDecisionExecutionError(
        "incident_decision_execution_readback_cardinality",
        "Incident decision execution RPC must return exactly one durable execution row",
      );
    }
    return data[0];
  }
  if (data && typeof data === "object") return data;
  throw new SourceIncidentDecisionExecutionError(
    "incident_decision_execution_readback_missing",
    "Incident decision execution RPC returned no durable execution row",
  );
}

function safeExecutionAuthority(row) {
  const createNew = row.incident_action === "create_new";
  return {
    authority: "approved_curator_incident_decision_execution_not_public_problem_persistence",
    execution_id: row.id,
    curator_decision_id: row.curator_decision_id,
    source_signal_id: row.source_signal_id,
    incident_id: row.incident_id,
    incident_action: row.incident_action,
    executed_by_curator_user_id: row.executed_by_curator_user_id,
    executed_at: row.executed_at,
    runtime_posture: {
      model_calls: 0,
      database_rpc_calls: 1,
      execution_rows_written: 1,
      incident_rows_created: createNew ? 1 : 0,
      source_incident_link_rows_written: 1,
      public_problem_writes: 0,
      public_evidence_writes: 0,
      public_feed_writes: 0,
      publication_performed: false,
    },
  };
}

export async function executeApprovedIncidentDecision(serviceClient, {
  decisionId,
  curatorUserId,
} = {}) {
  const normalizedDecisionId = cleanRequired(decisionId);
  const normalizedCuratorUserId = cleanRequired(curatorUserId);

  if (!normalizedDecisionId) {
    throw new SourceIncidentDecisionExecutionError(
      "curator_decision_id_required",
      "An explicit curator decision id is required; latest-decision inference is not allowed",
      { status: 400 },
    );
  }
  if (!normalizedCuratorUserId) {
    throw new SourceIncidentDecisionExecutionError(
      "curator_user_id_required",
      "Authenticated curator user id is required",
      { status: 400 },
    );
  }

  const { data, error } = await serviceClient.rpc(SOURCE_INCIDENT_DECISION_EXECUTION_RPC, {
    p_curator_user_id: normalizedCuratorUserId,
    p_curator_decision_id: normalizedDecisionId,
  });
  if (error) {
    const message = error.message || "Failed to execute approved curator Incident decision";
    const status = /not found/i.test(message) ? 404 : 409;
    throw new SourceIncidentDecisionExecutionError(
      "incident_decision_execution_failed",
      message,
      { status },
    );
  }

  const row = normalizeRpcExecutionRow(data);
  if (!row?.id || !row?.curator_decision_id || !row?.incident_id || !row?.source_signal_id) {
    throw new SourceIncidentDecisionExecutionError(
      "incident_decision_execution_readback_invalid",
      "Incident decision execution RPC returned an invalid durable execution row",
    );
  }
  if (row.curator_decision_id !== normalizedDecisionId) {
    throw new SourceIncidentDecisionExecutionError(
      "incident_decision_execution_authority_mismatch",
      "Incident decision execution readback does not match the explicit requested decision id",
    );
  }

  return safeExecutionAuthority(row);
}
