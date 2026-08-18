const FALSE_POSITIVE_FLAGS = [
  "spam_or_ad",
  "repost_or_copy",
  "news_only",
  "generic_negative_only",
];

export function evaluateComplaintPredictions(goldCases, predictions) {
  const predictionById = new Map((predictions ?? []).map((item) => [item.id, item]));
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let definitive = 0;
  let reviewed = 0;
  let corrections = 0;
  let compared = 0;
  const falsePositiveTaxonomy = Object.fromEntries([
    ...FALSE_POSITIVE_FLAGS.map((key) => [key, 0]),
    ["other", 0],
  ]);

  for (const gold of goldCases ?? []) {
    const prediction = predictionById.get(gold.id);
    if (!prediction) continue;
    if (!new Set(["pass", "review", "reject"]).has(prediction.decision)) {
      throw new TypeError(`Prediction ${gold.id} has invalid decision`);
    }

    compared += 1;
    if (prediction.decision === "review") reviewed += 1;

    const goldLabel = gold.complaint_relevant;
    if (goldLabel === "yes" || goldLabel === "no") {
      definitive += 1;
      if (prediction.decision === "pass" && goldLabel === "yes") truePositive += 1;
      if (prediction.decision === "pass" && goldLabel === "no") {
        falsePositive += 1;
        const matchedFlags = FALSE_POSITIVE_FLAGS.filter((key) => Boolean(gold[key]));
        if (matchedFlags.length === 0) falsePositiveTaxonomy.other += 1;
        for (const key of matchedFlags) falsePositiveTaxonomy[key] += 1;
      }
      if (prediction.decision !== "pass" && goldLabel === "yes") falseNegative += 1;
    }

    const expected = goldLabel === "yes" ? "pass" : goldLabel === "no" ? "reject" : "review";
    if (prediction.decision !== expected) corrections += 1;
  }

  return {
    compared,
    definitive,
    complaintPrecision: ratio(truePositive, truePositive + falsePositive),
    complaintRecall: ratio(truePositive, truePositive + falseNegative),
    humanCorrectionRate: ratio(corrections, compared),
    uncertainRate: ratio(reviewed, compared),
    truePositive,
    falsePositive,
    falseNegative,
    falsePositiveTaxonomy,
  };
}

export function evaluateComplaintThresholds(goldCases, scores, thresholds = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]) {
  const scoreById = new Map((scores ?? []).map((item) => [item.id, item]));
  return thresholds.map((threshold) => {
    if (typeof threshold !== "number" || threshold < 0 || threshold > 1) {
      throw new TypeError("threshold must be between 0 and 1");
    }
    const predictions = [];
    for (const gold of goldCases ?? []) {
      const score = scoreById.get(gold.id);
      if (!score) continue;
      const structurallyPositive = score.complaint_relevant === "yes"
        && score.first_hand_experience === "yes"
        && score.concrete_friction === "yes";
      predictions.push({
        id: gold.id,
        decision: structurallyPositive && score.confidence >= threshold ? "pass" : "review",
      });
    }
    return { threshold, ...evaluateComplaintPredictions(goldCases, predictions) };
  });
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}
