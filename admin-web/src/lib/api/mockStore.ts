import type { RuleConfigV31 } from "@/features/rule-matrix/schema";
import { evaluateMatrixCell, STANDARD_MATRIX_PROFILES } from "@/features/rule-matrix/evaluator";
import type {
  AcademicPeriodRecord,
  AdminUser,
  AssistantAskResponse,
  CalendarDayRecord,
  CourseAliasRecord,
  DocumentTemplateRecord,
  RagReindexJobRecord,
  RagSourceRecord,
  RuleSetRecord,
  SimulateDiffResponse,
} from "./types";

const BASE_CONFIG: RuleConfigV31 = {
  schema_version: "3.1",
  title: "Staj Uygunluk Kuralları",
  global_toggles: {
    isg1_validity_academic_years: 2,
    exclude_public_holidays: true,
    allow_saturday_workday: false,
    count_half_day_public_holidays_as_full_workday: true,
  },
  limits: {
    semester_max_count: 1,
    summer_max_count: 2,
    first_year_semester_allowed: false,
    first_year_summer_max_count: 1,
  },
  isg1_policy: {
    validity_years: 2,
    fall_pass_start: "same_academic_year_semester",
    spring_pass_start: "same_academic_year_summer",
    validity_end: "end_of_following_academic_year_summer",
  },
  isg2_policy: {
    validity: "unlimited",
    start: "first_eligible_internship_period_after_passed_term",
    retroactive: false,
  },
  period_overrides: [
    {
      override_id: "committee-decision-2026-001",
      profile_scope: "ISG1",
      academic_year_index: 2,
      period_type: "SUM",
      status: "REVIEW_REQUIRED",
      max_count_info: 2,
      reason: "Komisyon kararıyla özel inceleme",
      effective_from: "2026-11-24",
      effective_until: null,
      source_reference: "Komisyon Kararı No: 2026/01",
    },
  ],
  undefined_period_policy: "NOT_ELIGIBLE",
  review_status: "REVIEW_REQUIRED",
};

const cloned = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

interface MockStoreState {
  admin: AdminUser;
  ruleSets: RuleSetRecord[];
  academicPeriods: AcademicPeriodRecord[];
  calendarDays: CalendarDayRecord[];
  courseAliases: CourseAliasRecord[];
  templates: DocumentTemplateRecord[];
  ragSources: RagSourceRecord[];
  ragJobs: RagReindexJobRecord[];
  simulateAgainstPublished: (draftId: string) => SimulateDiffResponse;
  mockAskAssistant: (question: string) => AssistantAskResponse;
}

export const mockStore: MockStoreState = {
  admin: {
    id: "adm-001",
    email: "komisyon.admin@univ.edu.tr",
    role: "ADMIN",
    full_name: "Bölüm Staj Komisyonu",
  },

  ruleSets: [
    {
      id: "ruleset-2026-v31",
      version_tag: "v3.1.0",
      academic_year: "2026-2027",
      status: "PUBLISHED",
      lock_version: 1,
      effective_from: "2026-11-24",
      effective_until: null,
      created_by: "komisyon.admin@univ.edu.tr",
      approved_by: "Bölüm Staj Komisyonu (Karar 2026/01)",
      created_at: "2026-11-24T09:00:00Z",
      config_json: cloned(BASE_CONFIG),
    },
    {
      id: "ruleset-2026-v32-draft",
      version_tag: "v3.2.0-draft",
      academic_year: "2026-2027",
      status: "DRAFT",
      lock_version: 1,
      effective_from: "2026-12-01",
      effective_until: null,
      created_by: "komisyon.admin@univ.edu.tr",
      approved_by: null,
      created_at: "2026-11-26T14:30:00Z",
      config_json: cloned(BASE_CONFIG),
    },
    {
      id: "ruleset-2026-v30",
      version_tag: "v3.0.0",
      academic_year: "2026-2027",
      status: "ARCHIVED",
      lock_version: 3,
      effective_from: "2026-09-01",
      effective_until: "2026-11-23",
      created_by: "komisyon.admin@univ.edu.tr",
      approved_by: "Fakülte Yönetim Kurulu",
      created_at: "2026-09-01T10:15:00Z",
      config_json: {
        ...cloned(BASE_CONFIG),
        period_overrides: [],
      },
    },
  ],

  academicPeriods: [
    {
      id: "Y1_SEM",
      academic_year: "2026-2027",
      academic_year_index: 1,
      period_type: "SEM",
      start_date: "2027-01-18",
      end_date: "2027-02-12",
      internship_start_date: "2027-01-18",
      internship_end_date: "2027-02-12",
    },
    {
      id: "Y1_SUM",
      academic_year: "2026-2027",
      academic_year_index: 1,
      period_type: "SUM",
      start_date: "2027-06-14",
      end_date: "2027-09-10",
      internship_start_date: "2027-06-21",
      internship_end_date: "2027-09-04",
    },
    {
      id: "Y2_SUM",
      academic_year: "2026-2027",
      academic_year_index: 2,
      period_type: "SUM",
      start_date: "2027-06-14",
      end_date: "2027-09-10",
      internship_start_date: "2027-06-21",
      internship_end_date: "2027-09-04",
    },
    {
      id: "Y3_SUM",
      academic_year: "2026-2027",
      academic_year_index: 3,
      period_type: "SUM",
      start_date: "2027-06-14",
      end_date: "2027-09-10",
      internship_start_date: "2027-06-21",
      internship_end_date: "2027-09-04",
    },
    {
      id: "Y5_SUM",
      academic_year: "2026-2027",
      academic_year_index: 5,
      period_type: "SUM",
      start_date: "2027-06-14",
      end_date: "2027-09-10",
      internship_start_date: "2027-06-21",
      internship_end_date: "2027-09-04",
    },
  ],

  calendarDays: [
    {
      id: "cal-2027-01-01",
      date: "2027-01-01",
      name: "Yılbaşı",
      day_type: "PUBLIC_HOLIDAY",
      is_half_day: false,
      is_workday_override: false,
      source: "Resmî Gazete",
    },
    {
      id: "cal-2027-03-08",
      date: "2027-03-08",
      name: "Ramazan Bayramı Arifesi",
      day_type: "RELIGIOUS_HOLIDAY",
      is_half_day: true,
      is_workday_override: true,
      source: "Komisyon Kararı 2026/03",
    },
    {
      id: "cal-2027-10-28",
      date: "2027-10-28",
      name: "Cumhuriyet Bayramı Arifesi",
      day_type: "PUBLIC_HOLIDAY",
      is_half_day: true,
      is_workday_override: true,
      source: "Komisyon Kararı 2026/03",
    },
    {
      id: "cal-2027-10-29",
      date: "2027-10-29",
      name: "Cumhuriyet Bayramı",
      day_type: "PUBLIC_HOLIDAY",
      is_half_day: false,
      is_workday_override: false,
      source: "Resmî Gazete",
    },
  ],

  courseAliases: [
    {
      id: "alias-isg1-101",
      course_type: "ISG1",
      course_code: "ISG101",
      course_name_alias: "İş Sağlığı ve Güvenliği I",
      is_active: true,
      updated_by: "komisyon.admin@univ.edu.tr",
      updated_at: "2026-11-24T09:00:00Z",
    },
    {
      id: "alias-isg1-ohs",
      course_type: "ISG1",
      course_code: "OHS101",
      course_name_alias: "Occupational Health and Safety I",
      is_active: true,
      updated_by: "komisyon.admin@univ.edu.tr",
      updated_at: "2026-11-24T09:00:00Z",
    },
    {
      id: "alias-isg2-302",
      course_type: "ISG2",
      course_code: "ISG302",
      course_name_alias: "İş Sağlığı ve Güvenliği II",
      is_active: true,
      updated_by: "komisyon.admin@univ.edu.tr",
      updated_at: "2026-11-24T09:00:00Z",
    },
  ],

  templates: [
    {
      id: "tpl-2026-v31",
      template_key: "internship_application_form",
      name: "Zorunlu Staj Başvuru ve SGK Talep Formu",
      version: "3.1.0",
      file_path: "assets/templates/staj_basvuru_formu_v3_1.docx",
      checksum: "sha256:9f84b2c1a03e7d5f4a8b90c2123e4f56",
      placeholders_json: [
        "student_name",
        "student_no",
        "department",
        "class_year",
        "phone",
        "email",
        "address",
        "period_id",
        "period_name",
        "start_date",
        "end_date",
        "work_days",
        "workday_mode",
        "company_name",
        "company_tax_no",
        "company_phone",
        "company_address",
        "supervisor_name",
        "application_date",
        "rule_version",
      ],
      is_active: true,
      uploaded_by: "komisyon.admin@univ.edu.tr",
      created_at: "2026-11-24T10:00:00Z",
      updated_at: "2026-11-24T10:05:00Z",
      archived_at: null,
    },
    {
      id: "tpl-2026-v30",
      template_key: "internship_application_form",
      name: "Zorunlu Staj Başvuru Formu (Eski Sürüm)",
      version: "3.0.0",
      file_path: "assets/templates/staj_basvuru_formu_v3_0.docx",
      checksum: "sha256:4d12e8f9a12b3c4d5e6f708192a3b4c5",
      placeholders_json: ["student_name", "student_no", "start_date", "end_date", "work_days"],
      is_active: false,
      uploaded_by: "komisyon.admin@univ.edu.tr",
      created_at: "2026-09-01T08:30:00Z",
      updated_at: "2026-11-24T10:05:00Z",
      archived_at: null,
    },
  ],

  ragSources: [
    {
      id: "src-yonerge-2026",
      source_title: "Üniversite / Mühendislik Fakültesi Staj Yönergesi",
      source_url: "https://muhendislik.univ.edu.tr/staj-yonergesi",
      source_type: "DIRECTIVE",
      priority: 1,
      published_at: "2026-09-01T00:00:00Z",
      source_version: "2026.1",
      content_hash: "a1b2c3d4e5f60123456789abcdef0123",
      status: "ACTIVE",
      uploaded_by: "komisyon.admin@univ.edu.tr",
      created_at: "2026-11-24T09:10:00Z",
      updated_at: "2026-11-24T09:10:00Z",
      archived_at: null,
    },
    {
      id: "src-komisyon-2026",
      source_title: "Bilgisayar Mühendisliği Bölümü Staj Komisyonu Esasları",
      source_url: "https://bilgisayar.univ.edu.tr/staj-komisyonu-esaslari",
      source_type: "COMMITTEE_RULE",
      priority: 2,
      published_at: "2026-10-15T00:00:00Z",
      source_version: "2026.2",
      content_hash: "b2c3d4e5f607123456789abcdef01234",
      status: "ACTIVE",
      uploaded_by: "komisyon.admin@univ.edu.tr",
      created_at: "2026-11-24T09:12:00Z",
      updated_at: "2026-11-24T09:12:00Z",
      archived_at: null,
    },
    {
      id: "src-sss-2026",
      source_title: "Bölüm Web Sitesi Staj SSS",
      source_url: "https://bilgisayar.univ.edu.tr/staj-sss",
      source_type: "FAQ",
      priority: 3,
      published_at: "2026-10-20T00:00:00Z",
      source_version: "2026.1",
      content_hash: "c3d4e5f6071823456789abcdef012345",
      status: "ACTIVE",
      uploaded_by: "komisyon.admin@univ.edu.tr",
      created_at: "2026-11-24T09:15:00Z",
      updated_at: "2026-11-24T09:15:00Z",
      archived_at: null,
    },
  ],

  ragJobs: [
    {
      id: "job-20261126-001",
      status: "SUCCEEDED",
      requested_by: "komisyon.admin@univ.edu.tr",
      requested_at: "2026-11-26T15:00:00Z",
      started_at: "2026-11-26T15:00:02Z",
      completed_at: "2026-11-26T15:00:09Z",
      source_scope_json: { scope: "ALL_ACTIVE" },
      total_items: 3,
      processed_items: 3,
      attempt_count: 1,
      worker_id: "rag-worker-1",
      heartbeat_at: "2026-11-26T15:00:09Z",
      lease_expires_at: "2026-11-26T15:01:09Z",
      error_code: null,
      error_summary: null,
      result_summary: { indexed_sources: 3, indexed_chunks: 32 },
    },
  ],

  simulateAgainstPublished(draftId: string): SimulateDiffResponse {
    const published =
      this.ruleSets.find((r) => r.status === "PUBLISHED") ?? this.ruleSets[0];
    const draft = this.ruleSets.find((r) => r.id === draftId) ?? published;

    const diffs = STANDARD_MATRIX_PROFILES.map((profile) => {
      const affected: Array<{
        period: string;
        before: ReturnType<typeof evaluateMatrixCell>["status"];
        after: ReturnType<typeof evaluateMatrixCell>["status"];
      }> = [];
      for (let y = 1; y <= 5; y++) {
        for (const pt of ["SEM", "SUM"] as const) {
          const b = evaluateMatrixCell(published.config_json, profile, y, pt);
          const a = evaluateMatrixCell(draft.config_json, profile, y, pt);
          if (b.status !== a.status) {
            affected.push({ period: b.periodCode, before: b.status, after: a.status });
          }
        }
      }
      const beforeSummary = affected[0]?.before ?? evaluateMatrixCell(published.config_json, profile, 2, "SUM").status;
      const afterSummary = affected[0]?.after ?? evaluateMatrixCell(draft.config_json, profile, 2, "SUM").status;
      return {
        profile_id: profile.id,
        profile_label: profile.label,
        before_status: beforeSummary,
        after_status: afterSummary,
        changed: affected.length > 0,
        affected_periods: affected,
      };
    });

    const changedCount = diffs.filter((d) => d.changed).length;
    return {
      draft_rule_set_id: draft.id,
      baseline_rule_set_id: published.id,
      summary: {
        total_profiles: diffs.length,
        changed_profiles: changedCount,
        unchanged_profiles: diffs.length - changedCount,
      },
      profile_diffs: diffs,
    };
  },

  mockAskAssistant(question: string): AssistantAskResponse {
    const lower = question.toLowerCase();
    if (lower.includes("cumartesi")) {
      return {
        status: "CONFLICT_DETECTED",
        answer:
          "Fakülte Staj Yönergesi (Madde 7) işletmenin çalışması hâlinde Cumartesi günlerinin sayılabileceğini belirtirken, Bölüm Staj Komisyonu Esasları (Karar 2026/04) varsayılan 5 günlük haftayı esas alır ve Cumartesi için komisyon ön onayı ister. Kesin uygulama için Bölüm Staj Komisyonu ile teyit ediniz.",
        citations: [
          {
            source_id: "src-yonerge-2026",
            source_title: "Üniversite / Mühendislik Fakültesi Staj Yönergesi",
            article_no: "Madde 7",
            source_url: "https://muhendislik.univ.edu.tr/staj-yonergesi",
            priority: 1,
            source_version: "2026.1",
          },
          {
            source_id: "src-komisyon-2026",
            source_title: "Bilgisayar Mühendisliği Bölümü Staj Komisyonu Esasları",
            article_no: "Karar 2026/04",
            source_url: "https://bilgisayar.univ.edu.tr/staj-komisyonu-esaslari",
            priority: 2,
            source_version: "2026.2",
          },
        ],
        conflict_detected: true,
        redirect_target: null,
        pii_masked: false,
      };
    }
    if (lower.includes("transkript") || lower.includes("aldım") || lower.includes("dc")) {
      return {
        status: "ELIGIBILITY_REDIRECT",
        answer:
          "Bireysel transkript durumunuza göre staj uygunluğu deterministik kural motoru tarafından hesaplanır. Lütfen Transkript Analiz ekranına gidiniz.",
        citations: [],
        conflict_detected: false,
        redirect_target: "TRANSCRIPT_ANALYSIS",
        pii_masked: false,
      };
    }
    if (lower.includes("sgk") || lower.includes("sigorta")) {
      return {
        status: "ANSWERED",
        answer:
          "5510 sayılı kanun gereğince zorunlu staj yapan öğrencilerin İş Kazası ve Meslek Hastalığı sigorta primleri Üniversite tarafından ödenir. (Kaynak: Üniversite / Mühendislik Fakültesi Staj Yönergesi, Madde 8)",
        citations: [
          {
            source_id: "src-yonerge-2026",
            source_title: "Üniversite / Mühendislik Fakültesi Staj Yönergesi",
            article_no: "Madde 8",
            source_url: "https://muhendislik.univ.edu.tr/staj-yonergesi",
            priority: 1,
            source_version: "2026.1",
          },
        ],
        conflict_detected: false,
        redirect_target: null,
        pii_masked: false,
      };
    }
    return {
      status: "OUT_OF_SCOPE",
      answer:
        "Bu bilgi mevcut resmî staj yönergesi ve SSS kayıtlarında yer almıyor. Kesin bilgi için Bölüm Staj Komisyonuna danışmalısınız.",
      citations: [],
      conflict_detected: false,
      redirect_target: null,
      pii_masked: false,
    };
  },
};
