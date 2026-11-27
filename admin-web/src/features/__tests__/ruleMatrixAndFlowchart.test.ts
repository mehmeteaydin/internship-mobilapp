import { describe, expect, it } from "vitest";
import { configToMermaid, matrixToGraph } from "@/features/flowchart-viewer/matrixToGraph";
import { evaluateMatrixCell, STANDARD_MATRIX_PROFILES } from "@/features/rule-matrix/evaluator";
import { RuleConfigV31Schema, type RuleConfigV31 } from "@/features/rule-matrix/schema";

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
      override_id: "ov-1",
      profile_scope: "ISG1",
      academic_year_index: 2,
      period_type: "SUM",
      status: "REVIEW_REQUIRED",
      max_count_info: 2,
      reason: "Komisyon incelemesi",
      effective_from: "2026-11-24",
      effective_until: null,
      source_reference: "Karar 2026/01",
    },
  ],
  undefined_period_policy: "NOT_ELIGIBLE",
  review_status: "REVIEW_REQUIRED",
};

describe("v3.1 RuleConfig Zod Schema & Matrix Evaluator", () => {
  it("accepts a valid v3.1 configuration", () => {
    const parsed = RuleConfigV31Schema.safeParse(BASE_CONFIG);
    expect(parsed.success).toBe(true);
  });

  it("rejects Y1_SEM ELIGIBLE hard-constraint override", () => {
    const bad: RuleConfigV31 = {
      ...BASE_CONFIG,
      period_overrides: [
        {
          override_id: "ov-y1sem",
          profile_scope: "ALL",
          academic_year_index: 1,
          period_type: "SEM",
          status: "ELIGIBLE",
          reason: "Yasak kaldırma denemesi",
          effective_from: "2026-11-24",
          effective_until: null,
          source_reference: "Geçersiz",
        },
      ],
    };
    const parsed = RuleConfigV31Schema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });

  it("rejects overlapping period_overrides on identical scope and period", () => {
    const bad: RuleConfigV31 = {
      ...BASE_CONFIG,
      period_overrides: [
        ...BASE_CONFIG.period_overrides,
        {
          override_id: "ov-2",
          profile_scope: "ISG1",
          academic_year_index: 2,
          period_type: "SUM",
          status: "NOT_ELIGIBLE",
          reason: "Çakışan karar",
          effective_from: "2026-12-01",
          effective_until: "2027-06-01",
          source_reference: "Karar 2026/09",
        },
      ],
    };
    const parsed = RuleConfigV31Schema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });

  it("evaluates 5th academic year dynamically and gives ISG1/ISG2 override precedence over ALL", () => {
    const cfg: RuleConfigV31 = {
      ...BASE_CONFIG,
      period_overrides: [
        {
          override_id: "ov-all",
          profile_scope: "ALL",
          academic_year_index: 2,
          period_type: "SUM",
          status: "NOT_ELIGIBLE",
          reason: "Genel kapatma",
          effective_from: "2026-11-24",
          effective_until: null,
          source_reference: "Genel",
        },
        {
          override_id: "ov-isg1",
          profile_scope: "ISG1",
          academic_year_index: 2,
          period_type: "SUM",
          status: "REVIEW_REQUIRED",
          reason: "ISG1 özel",
          effective_from: "2026-11-24",
          effective_until: null,
          source_reference: "Özel",
        },
      ],
    };
    const isg1Y1Fall = STANDARD_MATRIX_PROFILES.find((p) => p.id === "ISG1_Y1_FALL")!;
    const isg1Y4Spring = STANDARD_MATRIX_PROFILES.find((p) => p.id === "ISG1_Y4_SPRING")!;

    expect(evaluateMatrixCell(cfg, isg1Y1Fall, 1, "SEM").status).toBe("NOT_ELIGIBLE");
    expect(evaluateMatrixCell(cfg, isg1Y1Fall, 1, "SUM").maxCount).toBe(1);
    expect(evaluateMatrixCell(cfg, isg1Y1Fall, 2, "SUM").status).toBe("REVIEW_REQUIRED");
    expect(evaluateMatrixCell(cfg, isg1Y4Spring, 5, "SUM").status).toBe("ELIGIBLE");
  });

  it("updates React Flow graph & Mermaid output reactively when config changes", () => {
    const graph1 = matrixToGraph(BASE_CONFIG);
    expect(graph1.nodes.length).toBeGreaterThanOrEqual(12);
    expect(graph1.edges.length).toBeGreaterThanOrEqual(12);

    const updated: RuleConfigV31 = {
      ...BASE_CONFIG,
      global_toggles: { ...BASE_CONFIG.global_toggles, allow_saturday_workday: true },
    };
    const graph2 = matrixToGraph(updated);
    const outNode = graph2.nodes.find((n) => n.id === "out");
    expect(String(outNode?.data.label)).toContain("Cumartesi=Açık");

    const mermaid = configToMermaid(updated);
    expect(mermaid).toContain("flowchart TD");
    expect(mermaid).toContain("ISG1 Y2_SUM -> REVIEW_REQUIRED");
  });
});
