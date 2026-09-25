import { describe, it, expect } from "vitest";
import {
  buildActivityEvidenceTooltip,
  getActivityEvidenceLabel,
  getActivityEvidenceVariant,
} from "../activity-evidence";
import type { Activity } from "@shared/ipc";

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    summary: "Did work",
    timestamp: "2026-04-25T10:00:05Z",
    apps: ["ChatGPT Classic"],
    isDrifting: false,
    confidence: 0.9,
    ...overrides,
  };
}

describe("activity evidence helpers", () => {
  it("uses accent variant for high-confidence drift", () => {
    const variant = getActivityEvidenceVariant(
      makeActivity({ isDrifting: true, confidence: 0.9 }),
    );
    expect(variant).toBe("accent");
  });

  it("uses warning variant for low-confidence on-track assessments", () => {
    const variant = getActivityEvidenceVariant(
      makeActivity({ isDrifting: false, confidence: 0.5 }),
    );
    expect(variant).toBe("warning");
  });

  it("labels high-confidence on-task as On track", () => {
    const label = getActivityEvidenceLabel(
      makeActivity({ isDrifting: false, confidence: 0.9 }),
    );
    expect(label).toBe("On track");
  });

  it("labels low-confidence assessments as Drifting", () => {
    const label = getActivityEvidenceLabel(
      makeActivity({ isDrifting: false, confidence: 0.5 }),
    );
    expect(label).toBe("Drifting");
  });

  it("labels high-confidence drift as Off-track", () => {
    const label = getActivityEvidenceLabel(
      makeActivity({ isDrifting: true, confidence: 0.9 }),
    );
    expect(label).toBe("Off-track");
  });

  it("builds tooltip with verdict, confidence, reason, and classification when available", () => {
    const tooltip = buildActivityEvidenceTooltip(
      makeActivity({
        isDrifting: true,
        confidence: 0.82,
        assessmentReason:
          "Discord messages were unrelated to the session intention.",
        level2Classification: "Communication",
      }),
    );

    expect(tooltip).toContain("Off-track (82% confidence)");
    expect(tooltip).toContain(
      "Discord messages were unrelated to the session intention.",
    );
    expect(tooltip).toContain("Classification: Communication");
  });

  it("falls back to a default reason when none is available", () => {
    const tooltip = buildActivityEvidenceTooltip(
      makeActivity({ assessmentReason: "" }),
    );
    expect(tooltip).toContain(
      "No detailed reason was recorded for this batch.",
    );
  });
});
