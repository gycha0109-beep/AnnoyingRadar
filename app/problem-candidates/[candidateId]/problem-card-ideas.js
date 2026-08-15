"use client";

import { useEffect, useState } from "react";

import IdeaSection from "./idea-section.js";

export default function ProblemCardIdeas({ candidateId }) {
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/problem-candidates/${candidateId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json();
        setDetail(payload);
      } catch (error) {
        if (error?.name !== "AbortError") console.error(error);
      }
    }
    void load();
    return () => controller.abort();
  }, [candidateId]);

  if (!detail?.candidate || !detail?.raw_input) return null;
  return <IdeaSection candidate={detail.candidate} rawInput={detail.raw_input} />;
}