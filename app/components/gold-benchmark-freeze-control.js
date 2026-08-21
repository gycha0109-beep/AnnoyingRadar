"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function GoldBenchmarkFreezeControl({ benchmark }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function freeze() {
    if (benchmark.frozen || benchmark.annotated < benchmark.target) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/radar/admin/source-signals/gold/freeze", {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Gold benchmark freeze에 실패했습니다.");
      setResult(payload.benchmark ?? null);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setPending(false);
    }
  }

  const ready = benchmark.annotated >= benchmark.target;

  return (
    <div className="complaint-gold-form gold-freeze-control">
      <div className="source-run-metrics">
        <span>annotated <strong>{benchmark.annotated}</strong> / {benchmark.target}</span>
        <span>calibration <strong>{benchmark.calibration}</strong> / {benchmark.calibration_target}</span>
        <span>holdout <strong>{benchmark.holdout}</strong> / {benchmark.holdout_target}</span>
      </div>
      {benchmark.frozen ? (
        <p className="source-configured">benchmark frozen · labels immutable</p>
      ) : (
        <>
          <button type="button" onClick={freeze} disabled={pending || !ready}>
            {pending ? "고정 중…" : "Gold 200/100 split 고정"}
          </button>
          <p className="source-lab-copy">
            {ready
              ? "300개 중 deterministic 200 calibration / 100 holdout을 한 번만 고정합니다. 고정된 라벨은 이후 수정할 수 없습니다."
              : `Gold label이 ${benchmark.target - benchmark.annotated}개 더 필요합니다.`}
          </p>
        </>
      )}
      {result ? <p className="source-configured">freeze complete · {result.frozen_count} samples</p> : null}
      {error ? <p className="source-error" role="alert">{error}</p> : null}
    </div>
  );
}
