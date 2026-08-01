import {
  ActivityType,
  AuditLogAction,
  CampaignStatus,
  Confidence,
  EmailStatus,
  FindingCategory,
  JobStatus,
  LeadSource,
  PipelineStage,
  RecommendedService,
  Role,
  ScoreConfidence,
} from "@prisma/client";

export const STAGE_ORDER: PipelineStage[] = [
  PipelineStage.DISCOVERED,
  PipelineStage.RESEARCHING,
  PipelineStage.QUALIFIED,
  PipelineStage.DRAFT_READY,
  PipelineStage.NEEDS_REVIEW,
  PipelineStage.APPROVED,
  PipelineStage.GMAIL_DRAFT_CREATED,
  PipelineStage.CONTACTED,
  PipelineStage.REPLIED,
  PipelineStage.MEETING_BOOKED,
  PipelineStage.NOT_INTERESTED,
  PipelineStage.FOLLOW_UP_LATER,
  PipelineStage.DISQUALIFIED,
];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  DISCOVERED: "Discovered",
  RESEARCHING: "Researching",
  QUALIFIED: "Qualified",
  DRAFT_READY: "Draft ready",
  NEEDS_REVIEW: "Needs review",
  APPROVED: "Approved",
  GMAIL_DRAFT_CREATED: "Gmail draft created",
  CONTACTED: "Contacted manually",
  REPLIED: "Replied",
  MEETING_BOOKED: "Meeting booked",
  NOT_INTERESTED: "Not interested",
  FOLLOW_UP_LATER: "Follow up later",
  DISQUALIFIED: "Disqualified",
};

export type BadgeTone = "neutral" | "info" | "progress" | "success" | "warning" | "danger";

export const STAGE_TONES: Record<PipelineStage, BadgeTone> = {
  DISCOVERED: "neutral",
  RESEARCHING: "progress",
  QUALIFIED: "info",
  DRAFT_READY: "info",
  NEEDS_REVIEW: "warning",
  APPROVED: "info",
  GMAIL_DRAFT_CREATED: "progress",
  CONTACTED: "progress",
  REPLIED: "success",
  MEETING_BOOKED: "success",
  NOT_INTERESTED: "danger",
  FOLLOW_UP_LATER: "warning",
  DISQUALIFIED: "danger",
};

export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  UNKNOWN: "Unknown",
  VALID: "Valid",
  INVALID: "Invalid",
  RISKY: "Risky",
  UNVERIFIED: "Unverified",
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  MANUAL: "Manual entry",
  CSV_IMPORT: "CSV import",
  RESEARCH: "Research",
};

export const SERVICE_LABELS: Record<RecommendedService, string> = {
  WEBSITE: "Website redesign",
  SOFTWARE: "Custom software",
  KLEARQ: "KlearQ",
  COMBINED: "Combined",
  NONE: "None",
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  VERIFIED: "Verified",
  STRONG_INFERENCE: "Strong inference",
  WEAK_INFERENCE: "Weak inference",
  UNKNOWN: "Unknown",
};

/** A finding is a fact only when VERIFIED; everything else is an inference. */
export function isFactConfidence(c: Confidence): boolean {
  return c === Confidence.VERIFIED;
}

export const FINDING_CATEGORY_LABELS: Record<FindingCategory, string> = {
  WEBSITE: "Website",
  SOFTWARE: "Custom software",
  KLEARQ: "KlearQ",
  CONTACTABILITY: "Contactability",
  BUSINESS_FIT: "Business fit",
};

export const SCORE_CONFIDENCE_LABELS: Record<ScoreConfidence, string> = {
  HIGH: "High confidence",
  MEDIUM: "Medium confidence",
  LOW: "Low confidence",
};

export const SCORE_CONFIDENCE_TONES: Record<ScoreConfidence, BadgeTone> = {
  HIGH: "success",
  MEDIUM: "warning",
  LOW: "neutral",
};

export const SERVICE_TONES: Record<RecommendedService, BadgeTone> = {
  WEBSITE: "info",
  SOFTWARE: "info",
  KLEARQ: "info",
  COMBINED: "progress",
  NONE: "neutral",
};

export const AUDIT_LOG_ACTION_LABELS: Record<AuditLogAction, string> = {
  FINDING_DISMISSED: "Finding dismissed",
  FINDING_RESTORED: "Finding restored",
  FINDING_ADDED: "Manual finding added",
  SCORE_OVERRIDDEN: "Score overridden",
  SCORE_OVERRIDE_CLEARED: "Override cleared",
  SCORING_RULES_UPDATED: "Scoring rules updated",
  SCORE_RECALCULATED: "Score recalculated",
};

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  LEAD_CREATED: "Lead created",
  LEAD_UPDATED: "Lead updated",
  LEAD_IMPORTED: "Lead imported",
  RESEARCH_COMPLETED: "Research completed",
  DRAFT_GENERATED: "Draft generated",
  DRAFT_EDITED: "Draft edited",
  DRAFT_APPROVED: "Draft approved",
  DRAFT_REJECTED: "Draft rejected",
  GMAIL_DRAFT_CREATED: "Gmail draft created",
  GMAIL_DRAFT_FAILED: "Gmail draft failed",
  MARKED_CONTACTED: "Marked contacted",
  REPLY_RECORDED: "Reply recorded",
  MEETING_BOOKED: "Meeting booked",
  NOTE_ADDED: "Note added",
  STAGE_CHANGED: "Stage changed",
  FOLLOW_UP_SCHEDULED: "Follow-up scheduled",
  FOLLOW_UP_COMPLETED: "Follow-up completed",
  FOLLOW_UP_CANCELLED: "Follow-up cancelled",
  CALENDAR_EVENT_CREATED: "Calendar event created",
  GOOGLE_CONNECTED: "Google connected",
  GOOGLE_DISCONNECTED: "Google disconnected",
  DO_NOT_CONTACT_SET: "Do-not-contact set",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: "Draft",
  RUNNING: "Running",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const CAMPAIGN_STATUS_TONES: Record<CampaignStatus, BadgeTone> = {
  DRAFT: "neutral",
  RUNNING: "progress",
  PAUSED: "warning",
  COMPLETED: "success",
  CANCELLED: "danger",
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  PAUSED: "Paused",
  SUCCEEDED: "Completed",
  PARTIAL: "Partially completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export const JOB_STATUS_TONES: Record<JobStatus, BadgeTone> = {
  QUEUED: "neutral",
  RUNNING: "progress",
  PAUSED: "warning",
  SUCCEEDED: "success",
  PARTIAL: "warning",
  FAILED: "danger",
  CANCELLED: "danger",
};

/** Terminal job states no longer make progress. */
export const JOB_TERMINAL_STATES: JobStatus[] = [
  JobStatus.SUCCEEDED,
  JobStatus.PARTIAL,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
];

/** Target healthcare clinic categories from the requirements. */
export const CLINIC_CATEGORIES: string[] = [
  "Physiotherapy",
  "Chiropractic",
  "Pain clinic",
  "Optometry",
  "Ophthalmology",
  "Dental",
  "Orthodontic",
  "Medical clinic",
  "Walk-in clinic",
  "Family medicine",
  "Sports medicine",
  "Rehabilitation",
  "Massage therapy",
  "Psychology and counselling",
  "Dermatology",
  "ENT",
  "Audiology",
  "Podiatry",
  "Addiction treatment",
  "Fertility",
  "Cosmetic and medical aesthetics",
  "Other outpatient practice",
];

export const BOOKING_METHODS: string[] = [
  "Online booking",
  "Call to book",
  "Contact form",
  "Email",
  "Walk-in",
  "Unknown",
];
