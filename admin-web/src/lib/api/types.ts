import type { EligibilityStatus, RuleConfigV31 } from "@/features/rule-matrix/schema";

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  request_id?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  role: "ADMIN";
  full_name?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
  admin: AdminUser;
}

export interface RuleSetRecord {
  id: string;
  version_tag: string;
  academic_year: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  lock_version: number;
  effective_from: string;
  effective_until: string | null;
  created_by: string;
  approved_by: string | null;
  created_at: string;
  config_json: RuleConfigV31;
}

export interface SimulateProfileDiff {
  profile_id: string;
  profile_label: string;
  before_status: EligibilityStatus;
  after_status: EligibilityStatus;
  changed: boolean;
  affected_periods: Array<{
    period: string;
    before: EligibilityStatus;
    after: EligibilityStatus;
  }>;
}

export interface SimulateDiffResponse {
  draft_rule_set_id: string;
  baseline_rule_set_id: string;
  summary: {
    total_profiles: number;
    changed_profiles: number;
    unchanged_profiles: number;
  };
  profile_diffs: SimulateProfileDiff[];
}

export interface AcademicPeriodRecord {
  id: string;
  academic_year: string;
  academic_year_index: number;
  period_type: "SEM" | "SUM";
  start_date: string;
  end_date: string;
  internship_start_date: string;
  internship_end_date: string;
}

export interface CalendarDayRecord {
  id: string;
  date: string;
  name: string;
  day_type: "PUBLIC_HOLIDAY" | "RELIGIOUS_HOLIDAY" | "UNIVERSITY_ADMIN_HOLIDAY";
  is_half_day: boolean;
  is_workday_override: boolean;
  source: string;
}

export interface CourseAliasRecord {
  id: string;
  course_type: "ISG1" | "ISG2";
  course_code: string;
  course_name_alias: string;
  is_active: boolean;
  updated_by: string;
  updated_at: string;
}

export interface DocumentTemplateRecord {
  id: string;
  template_key: string;
  name: string;
  version: string;
  file_path: string;
  checksum: string;
  placeholders_json: string[];
  is_active: boolean;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface RagSourceRecord {
  id: string;
  source_title: string;
  source_url: string;
  source_type: "DIRECTIVE" | "COMMITTEE_RULE" | "FAQ";
  priority: 1 | 2 | 3;
  published_at: string;
  source_version: string;
  content_hash: string;
  raw_content?: string;
  status: "ACTIVE" | "ARCHIVED";
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface RagReindexJobRecord {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  requested_by: string;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  source_scope_json: Record<string, unknown>;
  total_items: number;
  processed_items: number;
  attempt_count: number;
  worker_id: string | null;
  heartbeat_at: string | null;
  lease_expires_at: string | null;
  error_code: string | null;
  error_summary: string | null;
  result_summary: Record<string, unknown> | null;
}

export interface AssistantCitation {
  source_id: string;
  source_title: string;
  article_no: string;
  source_url: string;
  priority: number;
  source_version: string;
}

export interface AssistantAskResponse {
  status:
    | "ANSWERED"
    | "CONFLICT_DETECTED"
    | "OUT_OF_SCOPE"
    | "ELIGIBILITY_REDIRECT"
    | "PROMPT_INJECTION_BLOCKED";
  answer: string;
  citations: AssistantCitation[];
  conflict_detected: boolean;
  redirect_target: string | null;
  pii_masked: boolean;
}
