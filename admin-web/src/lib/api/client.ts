import type { RuleConfigV31 } from "@/features/rule-matrix/schema";
import { mockStore } from "./mockStore";
import type {
  AcademicPeriodRecord,
  AdminUser,
  ApiErrorEnvelope,
  AssistantAskResponse,
  CalendarDayRecord,
  CourseAliasRecord,
  DocumentTemplateRecord,
  LoginResponse,
  RagReindexJobRecord,
  RagSourceRecord,
  RuleSetRecord,
  SimulateDiffResponse,
} from "./types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
const USE_MOCK = ((import.meta.env.VITE_USE_MOCK_API as string | undefined) ?? "true") !== "false";

let accessToken: string | null = null;
let mockAuthenticated = false;

export class ApiClientError extends Error {
  status: number;
  envelope: ApiErrorEnvelope;

  constructor(status: number, envelope: ApiErrorEnvelope) {
    super(envelope.message);
    this.status = status;
    this.envelope = envelope;
  }
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function tryRefreshAccessToken(): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    accessToken = null;
    return false;
  }
  const data = (await res.json()) as { access_token: string };
  accessToken = data.access_token;
  return true;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && retry && !path.includes("/admin/auth/login")) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      return request<T>(path, init, false);
    }
  }

  if (!res.ok) {
    let envelope: ApiErrorEnvelope = {
      code: `HTTP_${res.status}`,
      message: res.statusText || "İstek başarısız oldu",
    };
    try {
      const body = (await res.json()) as { detail?: ApiErrorEnvelope } & Partial<ApiErrorEnvelope>;
      if (body.detail && typeof body.detail === "object") {
        envelope = body.detail;
      } else if (body.code && body.message) {
        envelope = body as ApiErrorEnvelope;
      }
    } catch {
      // ignore non-json body
    }
    throw new ApiClientError(res.status, envelope);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const adminApi = {
  isMockMode: USE_MOCK,

  async login(email: string, password: string): Promise<LoginResponse> {
    if (USE_MOCK) {
      if (!email.includes("@") || password.length < 4) {
        throw new ApiClientError(401, {
          code: "INVALID_CREDENTIALS",
          message: "Geçersiz e-posta veya parola.",
        });
      }
      mockAuthenticated = true;
      accessToken = "mock-jwt-access-token";
      return {
        access_token: accessToken,
        token_type: "bearer",
        admin: { ...mockStore.admin, email },
      };
    }
    const data = await request<LoginResponse>("/api/v1/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    accessToken = data.access_token;
    return data;
  },

  async me(): Promise<AdminUser> {
    if (USE_MOCK) {
      if (!mockAuthenticated) {
        throw new ApiClientError(401, { code: "UNAUTHORIZED", message: "Oturum gerekli." });
      }
      return mockStore.admin;
    }
    return request<AdminUser>("/api/v1/admin/auth/me");
  },

  async logout(): Promise<void> {
    if (USE_MOCK) {
      mockAuthenticated = false;
      accessToken = null;
      return;
    }
    await request<void>("/api/v1/admin/auth/logout", { method: "POST" });
    accessToken = null;
  },

  // Rule sets
  async listRuleSets(): Promise<RuleSetRecord[]> {
    if (USE_MOCK) return [...mockStore.ruleSets];
    return request<RuleSetRecord[]>("/api/v1/admin/rules");
  },

  async updateRuleDraft(
    id: string,
    payload: { config_json: RuleConfigV31; lock_version: number }
  ): Promise<RuleSetRecord> {
    if (USE_MOCK) {
      const target = mockStore.ruleSets.find((r) => r.id === id);
      if (!target) {
        throw new ApiClientError(404, { code: "RULE_NOT_FOUND", message: "Kural seti bulunamadı." });
      }
      if (target.status !== "DRAFT") {
        throw new ApiClientError(409, {
          code: "RULE_NOT_DRAFT",
          message: "Yayınlanmış kural sürümleri değiştirilemez; yeni taslak oluşturun.",
        });
      }
      if (target.lock_version !== payload.lock_version) {
        throw new ApiClientError(409, {
          code: "LOCK_VERSION_CONFLICT",
          message: "Kural seti başka bir yönetici tarafından güncellendi.",
        });
      }
      target.config_json = JSON.parse(JSON.stringify(payload.config_json)) as RuleConfigV31;
      target.lock_version += 1;
      return { ...target };
    }
    return request<RuleSetRecord>(`/api/v1/admin/rules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async createDraftFrom(sourceId: string, versionTag: string): Promise<RuleSetRecord> {
    if (USE_MOCK) {
      const base = mockStore.ruleSets.find((r) => r.id === sourceId) ?? mockStore.ruleSets[0];
      const draft: RuleSetRecord = {
        id: `ruleset-${Date.now()}`,
        version_tag: versionTag,
        academic_year: base.academic_year,
        status: "DRAFT",
        lock_version: 1,
        effective_from: new Date().toISOString().slice(0, 10),
        effective_until: null,
        created_by: mockStore.admin.email,
        approved_by: null,
        created_at: new Date().toISOString(),
        config_json: JSON.parse(JSON.stringify(base.config_json)) as RuleConfigV31,
      };
      mockStore.ruleSets.unshift(draft);
      return draft;
    }
    return request<RuleSetRecord>("/api/v1/admin/rules", {
      method: "POST",
      body: JSON.stringify({ source_id: sourceId, version_tag: versionTag }),
    });
  },

  async simulateRuleSet(id: string): Promise<SimulateDiffResponse> {
    if (USE_MOCK) return mockStore.simulateAgainstPublished(id);
    return request<SimulateDiffResponse>(`/api/v1/admin/rules/${id}/simulate`, { method: "POST" });
  },

  async publishRuleSet(id: string, approvedBy: string): Promise<RuleSetRecord> {
    if (USE_MOCK) {
      const target = mockStore.ruleSets.find((r) => r.id === id);
      if (!target) {
        throw new ApiClientError(404, { code: "RULE_NOT_FOUND", message: "Kural seti bulunamadı." });
      }
      for (const r of mockStore.ruleSets) {
        if (r.status === "PUBLISHED") r.status = "ARCHIVED";
      }
      target.status = "PUBLISHED";
      target.approved_by = approvedBy;
      return { ...target };
    }
    return request<RuleSetRecord>(`/api/v1/admin/rules/${id}/publish`, {
      method: "POST",
      body: JSON.stringify({ approved_by: approvedBy }),
    });
  },

  async rollbackRuleSet(id: string): Promise<RuleSetRecord> {
    if (USE_MOCK) {
      const old = mockStore.ruleSets.find((r) => r.id === id);
      if (!old) {
        throw new ApiClientError(404, { code: "RULE_NOT_FOUND", message: "Kural seti bulunamadı." });
      }
      for (const r of mockStore.ruleSets) {
        if (r.status === "PUBLISHED") r.status = "ARCHIVED";
      }
      const rolledBack: RuleSetRecord = {
        id: `ruleset-rb-${Date.now()}`,
        version_tag: `${old.version_tag}-rb`,
        academic_year: old.academic_year,
        status: "PUBLISHED",
        lock_version: 1,
        effective_from: new Date().toISOString().slice(0, 10),
        effective_until: null,
        created_by: mockStore.admin.email,
        approved_by: `Rollback (${old.version_tag})`,
        created_at: new Date().toISOString(),
        config_json: JSON.parse(JSON.stringify(old.config_json)) as RuleConfigV31,
      };
      mockStore.ruleSets.unshift(rolledBack);
      return rolledBack;
    }
    return request<RuleSetRecord>(`/api/v1/admin/rules/${id}/rollback`, { method: "POST" });
  },

  // Course aliases
  async listCourseAliases(): Promise<CourseAliasRecord[]> {
    if (USE_MOCK) return [...mockStore.courseAliases];
    return request<CourseAliasRecord[]>("/api/v1/admin/course-aliases");
  },

  async createCourseAlias(
    payload: Omit<CourseAliasRecord, "id" | "updated_by" | "updated_at">
  ): Promise<CourseAliasRecord> {
    if (USE_MOCK) {
      const item: CourseAliasRecord = {
        ...payload,
        id: `alias-${Date.now()}`,
        updated_by: mockStore.admin.email,
        updated_at: new Date().toISOString(),
      };
      mockStore.courseAliases.push(item);
      return item;
    }
    return request<CourseAliasRecord>("/api/v1/admin/course-aliases", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async deleteCourseAlias(id: string): Promise<void> {
    if (USE_MOCK) {
      mockStore.courseAliases = mockStore.courseAliases.filter((a) => a.id !== id);
      return;
    }
    await request<void>(`/api/v1/admin/course-aliases/${id}`, { method: "DELETE" });
  },

  // Academic periods & calendar days
  async listAcademicPeriods(): Promise<AcademicPeriodRecord[]> {
    if (USE_MOCK) return [...mockStore.academicPeriods];
    return request<AcademicPeriodRecord[]>("/api/v1/admin/academic-periods");
  },

  async createAcademicPeriod(payload: AcademicPeriodRecord): Promise<AcademicPeriodRecord> {
    if (USE_MOCK) {
      mockStore.academicPeriods.push(payload);
      return payload;
    }
    return request<AcademicPeriodRecord>("/api/v1/admin/academic-periods", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async listCalendarDays(): Promise<CalendarDayRecord[]> {
    if (USE_MOCK) return [...mockStore.calendarDays];
    return request<CalendarDayRecord[]>("/api/v1/admin/calendar-days");
  },

  async createCalendarDay(payload: Omit<CalendarDayRecord, "id">): Promise<CalendarDayRecord> {
    if (USE_MOCK) {
      const item: CalendarDayRecord = { ...payload, id: `cal-${Date.now()}` };
      mockStore.calendarDays.push(item);
      return item;
    }
    return request<CalendarDayRecord>("/api/v1/admin/calendar-days", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async deleteCalendarDay(id: string): Promise<void> {
    if (USE_MOCK) {
      mockStore.calendarDays = mockStore.calendarDays.filter((c) => c.id !== id);
      return;
    }
    await request<void>(`/api/v1/admin/calendar-days/${id}`, { method: "DELETE" });
  },

  // Templates
  async listTemplates(): Promise<DocumentTemplateRecord[]> {
    if (USE_MOCK) return [...mockStore.templates];
    return request<DocumentTemplateRecord[]>("/api/v1/admin/templates");
  },

  async uploadTemplate(formData: FormData): Promise<DocumentTemplateRecord> {
    if (USE_MOCK) {
      const name = String(formData.get("name") || "Yeni Staj Şablonu");
      const version = String(formData.get("version") || "3.2.0");
      const tpl: DocumentTemplateRecord = {
        id: `tpl-${Date.now()}`,
        template_key: "internship_application_form",
        name,
        version,
        file_path: `assets/templates/${name.toLowerCase().replace(/\s+/g, "_")}.docx`,
        checksum: `sha256:${Math.random().toString(16).slice(2, 18)}`,
        placeholders_json: ["student_name", "student_no", "start_date", "end_date", "work_days", "company_name"],
        is_active: false,
        uploaded_by: mockStore.admin.email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
      };
      mockStore.templates.unshift(tpl);
      return tpl;
    }
    return request<DocumentTemplateRecord>("/api/v1/admin/templates", {
      method: "POST",
      body: formData,
    });
  },

  async activateTemplate(id: string): Promise<DocumentTemplateRecord> {
    if (USE_MOCK) {
      const target = mockStore.templates.find((t) => t.id === id);
      if (!target) {
        throw new ApiClientError(404, { code: "TEMPLATE_NOT_FOUND", message: "Şablon bulunamadı." });
      }
      for (const t of mockStore.templates) {
        if (t.template_key === target.template_key) t.is_active = false;
      }
      target.is_active = true;
      target.updated_at = new Date().toISOString();
      return { ...target };
    }
    return request<DocumentTemplateRecord>(`/api/v1/admin/templates/${id}/activate`, {
      method: "PATCH",
    });
  },

  async archiveTemplate(id: string): Promise<void> {
    if (USE_MOCK) {
      const target = mockStore.templates.find((t) => t.id === id);
      if (target?.is_active) {
        throw new ApiClientError(409, {
          code: "ACTIVE_TEMPLATE_CANNOT_ARCHIVE",
          message: "Aktif şablon arşivlenemez.",
        });
      }
      if (target) target.archived_at = new Date().toISOString();
      return;
    }
    await request<void>(`/api/v1/admin/templates/${id}`, { method: "DELETE" });
  },

  getTemplateDownloadUrl(id: string): string {
    return `${API_BASE_URL}/api/v1/admin/templates/${id}/download`;
  },

  // RAG sources & jobs
  async listRagSources(): Promise<RagSourceRecord[]> {
    if (USE_MOCK) return [...mockStore.ragSources];
    return request<RagSourceRecord[]>("/api/v1/admin/rag/sources");
  },

  async createRagSource(payload: {
    source_title: string;
    source_url: string;
    source_type: "DIRECTIVE" | "COMMITTEE_RULE" | "FAQ";
    priority: 1 | 2 | 3;
    published_at: string;
    source_version: string;
    raw_content: string;
  }): Promise<RagSourceRecord> {
    if (USE_MOCK) {
      const src: RagSourceRecord = {
        id: `src-${Date.now()}`,
        ...payload,
        content_hash: `sha256-${Date.now()}`,
        status: "ACTIVE",
        uploaded_by: mockStore.admin.email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
      };
      mockStore.ragSources.unshift(src);
      return src;
    }
    return request<RagSourceRecord>("/api/v1/admin/rag/sources", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async archiveRagSource(id: string): Promise<RagSourceRecord> {
    if (USE_MOCK) {
      const target = mockStore.ragSources.find((s) => s.id === id);
      if (!target) {
        throw new ApiClientError(404, { code: "RAG_SOURCE_NOT_FOUND", message: "Kaynak bulunamadı." });
      }
      target.status = "ARCHIVED";
      target.archived_at = new Date().toISOString();
      return { ...target };
    }
    return request<RagSourceRecord>(`/api/v1/admin/rag/sources/${id}`, { method: "DELETE" });
  },

  async listRagJobs(): Promise<RagReindexJobRecord[]> {
    if (USE_MOCK) return [...mockStore.ragJobs];
    return request<RagReindexJobRecord[]>("/api/v1/admin/rag/reindex");
  },

  async enqueueRagReindex(sourceIds?: string[]): Promise<RagReindexJobRecord> {
    if (USE_MOCK) {
      const active = mockStore.ragJobs.find((j) => j.status === "QUEUED" || j.status === "RUNNING");
      if (active) {
        throw new ApiClientError(409, {
          code: "RAG_REINDEX_ALREADY_ACTIVE",
          message: "Aktif bir reindex işi zaten kuyrukta veya çalışıyor.",
        });
      }
      const activeCount = mockStore.ragSources.filter((s) => s.status === "ACTIVE").length;
      const job: RagReindexJobRecord = {
        id: `job-${Date.now()}`,
        status: "RUNNING",
        requested_by: mockStore.admin.email,
        requested_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        completed_at: null,
        source_scope_json: sourceIds?.length ? { scope: "SELECTED", source_ids: sourceIds } : { scope: "ALL_ACTIVE" },
        total_items: activeCount,
        processed_items: 1,
        attempt_count: 1,
        worker_id: "rag-worker-mock",
        heartbeat_at: new Date().toISOString(),
        lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        error_code: null,
        error_summary: null,
        result_summary: null,
      };
      mockStore.ragJobs.unshift(job);
      setTimeout(() => {
        job.status = "SUCCEEDED";
        job.processed_items = activeCount;
        job.completed_at = new Date().toISOString();
        job.heartbeat_at = job.completed_at;
        job.result_summary = { indexed_sources: activeCount, indexed_chunks: activeCount * 10 };
      }, 1500);
      return job;
    }
    return request<RagReindexJobRecord>("/api/v1/admin/rag/reindex", {
      method: "POST",
      body: JSON.stringify(sourceIds?.length ? { source_ids: sourceIds } : {}),
    });
  },

  async askAssistant(question: string): Promise<AssistantAskResponse> {
    if (USE_MOCK) return mockStore.mockAskAssistant(question);
    return request<AssistantAskResponse>("/api/v1/assistant/ask", {
      method: "POST",
      body: JSON.stringify({ question }),
    });
  },
};
