import type { Activity } from "@shared/ipc";
import type { BadgeVariant } from "../components/ui/variants";

const STRONG_CONFIDENCE = 0.8;
const UNCERTAIN_ON_TRACK_CONFIDENCE = 0.65;

export function getActivityEvidenceVariant(activity: Activity): BadgeVariant {
  if (activity.isDrifting) {
    return activity.confidence >= STRONG_CONFIDENCE ? "accent" : "warning";
  }

  if (activity.confidence < UNCERTAIN_ON_TRACK_CONFIDENCE) {
    return "warning";
  }

  return "success";
}

export function getActivityEvidenceLabel(
  activity: Activity,
): "On track" | "Drifting" | "Off-track" {
  if (activity.isDrifting && activity.confidence >= STRONG_CONFIDENCE) {
    return "Off-track";
  }

  if (
    !activity.isDrifting &&
    activity.confidence >= UNCERTAIN_ON_TRACK_CONFIDENCE
  ) {
    return "On track";
  }

  return "Drifting";
}

export function buildActivityEvidenceTooltip(activity: Activity): string {
  const label = getActivityEvidenceLabel(activity);
  const confidencePercent = Math.round(activity.confidence * 100);
  const reason =
    activity.assessmentReason?.trim() ||
    "No detailed reason was recorded for this batch.";
  const classification = activity.level2Classification
    ? `\nClassification: ${activity.level2Classification}`
    : "";

  return `${label} (${confidencePercent}% confidence)\n${reason}${classification}`;
}
