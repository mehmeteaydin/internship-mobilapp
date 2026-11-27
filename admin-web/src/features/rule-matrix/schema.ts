import { z } from "zod";

export const EligibilityStatusSchema = z.enum([
  "ELIGIBLE",
  "NOT_ELIGIBLE",
  "REVIEW_REQUIRED",
  "CONDITIONAL_ELIGIBLE",
]);

export const OverrideStatusSchema = z.enum([
  "ELIGIBLE",
  "NOT_ELIGIBLE",
  "REVIEW_REQUIRED",
]);

export const ProfileScopeSchema = z.enum(["ALL", "ISG1", "ISG2"]);
export const PeriodTypeSchema = z.enum(["SEM", "SUM"]);

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const PeriodOverrideSchema = z
  .object({
    override_id: z.string().min(2, "Override ID en az 2 karakter olmalıdır"),
    profile_scope: ProfileScopeSchema,
    academic_year_index: z.number().int().min(1).max(8),
    period_type: PeriodTypeSchema,
    status: OverrideStatusSchema,
    max_count_info: z.number().int().min(0).max(4).optional(),
    reason: z.string().min(3, "Gerekçe en az 3 karakter olmalıdır"),
    effective_from: z.string().regex(isoDateRegex, "YYYY-MM-DD biçiminde olmalıdır"),
    effective_until: z
      .string()
      .regex(isoDateRegex, "YYYY-MM-DD biçiminde olmalıdır")
      .nullable(),
    source_reference: z.string().min(2, "Komisyon karar referansı zorunludur"),
  })
  .superRefine((ov, ctx) => {
    // Hard constraint: Y1_SEM absolute prohibition cannot be lifted
    if (ov.academic_year_index === 1 && ov.period_type === "SEM" && ov.status === "ELIGIBLE") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message: "1. sınıf Sömestr (Y1_SEM) mutlak yasağı MVP'de override ile ELIGIBLE yapılamaz.",
      });
    }
    if (ov.effective_until && ov.effective_until < ov.effective_from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effective_until"],
        message: "Bitiş tarihi başlangıç tarihinden önce olamaz.",
      });
    }
  });

function rangesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null
): boolean {
  const endA = aEnd ?? "9999-12-31";
  const endB = bEnd ?? "9999-12-31";
  return aStart <= endB && bStart <= endA;
}

export const RuleConfigV31Schema = z
  .object({
    schema_version: z.literal("3.1"),
    title: z.string().min(3),
    global_toggles: z.object({
      isg1_validity_academic_years: z.number().int().min(1).max(4),
      exclude_public_holidays: z.boolean(),
      allow_saturday_workday: z.boolean(),
      count_half_day_public_holidays_as_full_workday: z.boolean(),
    }),
    limits: z
      .object({
        semester_max_count: z.number().int().min(0).max(2),
        summer_max_count: z.number().int().min(1).max(3),
        first_year_semester_allowed: z.boolean(),
        first_year_summer_max_count: z.number().int().min(0).max(2),
      })
      .superRefine((limits, ctx) => {
        if (limits.first_year_semester_allowed) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["first_year_semester_allowed"],
            message: "1. sınıf Sömestr (Y1_SEM) staj yasağı MVP'de değiştirilemez.",
          });
        }
      }),
    isg1_policy: z.object({
      validity_years: z.number().int().min(1).max(4),
      fall_pass_start: z.literal("same_academic_year_semester"),
      spring_pass_start: z.literal("same_academic_year_summer"),
      validity_end: z.literal("end_of_following_academic_year_summer"),
    }),
    isg2_policy: z.object({
      validity: z.literal("unlimited"),
      start: z.literal("first_eligible_internship_period_after_passed_term"),
      retroactive: z.literal(false),
    }),
    period_overrides: z.array(PeriodOverrideSchema),
    undefined_period_policy: z.literal("NOT_ELIGIBLE"),
    review_status: z.literal("REVIEW_REQUIRED"),
  })
  .superRefine((cfg, ctx) => {
    const seenIds = new Set<string>();
    for (let i = 0; i < cfg.period_overrides.length; i++) {
      const current = cfg.period_overrides[i];
      if (seenIds.has(current.override_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["period_overrides", i, "override_id"],
          message: `Yinelenen override_id: ${current.override_id}`,
        });
      }
      seenIds.add(current.override_id);

      for (let j = i + 1; j < cfg.period_overrides.length; j++) {
        const other = cfg.period_overrides[j];
        if (
          current.profile_scope === other.profile_scope &&
          current.academic_year_index === other.academic_year_index &&
          current.period_type === other.period_type &&
          rangesOverlap(
            current.effective_from,
            current.effective_until,
            other.effective_from,
            other.effective_until
          )
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["period_overrides", j],
            message: `Çakışan period_override: ${other.profile_scope} Y${other.academic_year_index}_${other.period_type} tarih aralığı ${current.override_id} ile çakışıyor.`,
          });
        }
      }
    }
  });

export type EligibilityStatus = z.infer<typeof EligibilityStatusSchema>;
export type OverrideStatus = z.infer<typeof OverrideStatusSchema>;
export type ProfileScope = z.infer<typeof ProfileScopeSchema>;
export type PeriodType = z.infer<typeof PeriodTypeSchema>;
export type PeriodOverride = z.infer<typeof PeriodOverrideSchema>;
export type RuleConfigV31 = z.infer<typeof RuleConfigV31Schema>;
