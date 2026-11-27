import type {
  EligibilityStatus,
  PeriodOverride,
  PeriodType,
  ProfileScope,
  RuleConfigV31,
} from "./schema";

export interface MatrixProfileRow {
  id: string;
  label: string;
  kind: "NO_ISG" | "ISG1" | "ISG2" | "REVIEW";
  passedYear?: number;
  passedTerm?: "FALL" | "SPRING";
}

export interface PeriodCellResult {
  periodCode: string;
  yearIndex: number;
  periodType: PeriodType;
  status: EligibilityStatus;
  maxCount: number;
  note: string;
  overriddenBy?: string;
}

export const STANDARD_MATRIX_PROFILES: MatrixProfileRow[] = [
  { id: "NO_ISG", label: "İSG Hiç Geçmedi", kind: "NO_ISG" },
  { id: "ISG1_Y1_FALL", label: "1. Sınıf Güz'de İSG 1 Geçti", kind: "ISG1", passedYear: 1, passedTerm: "FALL" },
  { id: "ISG1_Y1_SPRING", label: "1. Sınıf Bahar'da İSG 1 Geçti", kind: "ISG1", passedYear: 1, passedTerm: "SPRING" },
  { id: "ISG1_Y2_FALL", label: "2. Sınıf Güz'de İSG 1 Geçti", kind: "ISG1", passedYear: 2, passedTerm: "FALL" },
  { id: "ISG1_Y2_SPRING", label: "2. Sınıf Bahar'da İSG 1 Geçti", kind: "ISG1", passedYear: 2, passedTerm: "SPRING" },
  { id: "ISG1_Y3_FALL", label: "3. Sınıf Güz'de İSG 1 Geçti", kind: "ISG1", passedYear: 3, passedTerm: "FALL" },
  { id: "ISG1_Y3_SPRING", label: "3. Sınıf Bahar'da İSG 1 Geçti", kind: "ISG1", passedYear: 3, passedTerm: "SPRING" },
  { id: "ISG1_Y4_FALL", label: "4. Sınıf Güz'de İSG 1 Geçti", kind: "ISG1", passedYear: 4, passedTerm: "FALL" },
  { id: "ISG1_Y4_SPRING", label: "4. Sınıf Bahar'da İSG 1 Geçti", kind: "ISG1", passedYear: 4, passedTerm: "SPRING" },
  { id: "ISG2_Y3_SPRING", label: "İSG 2 Geçti (Örn: 3. Sınıf Bahar)", kind: "ISG2", passedYear: 3, passedTerm: "SPRING" },
  { id: "REVIEW_PROFILE", label: "Sadece Stajı Kalan / DC-DD / Belirsiz MU", kind: "REVIEW" },
];

function findApplicableOverride(
  overrides: PeriodOverride[],
  profileScope: ProfileScope,
  yearIndex: number,
  periodType: PeriodType
): PeriodOverride | undefined {
  const matching = overrides.filter(
    (ov) => ov.academic_year_index === yearIndex && ov.period_type === periodType
  );
  // Profile-specific override takes precedence over ALL
  return (
    matching.find((ov) => ov.profile_scope === profileScope) ??
    matching.find((ov) => ov.profile_scope === "ALL")
  );
}

function defaultMaxCount(config: RuleConfigV31, yearIndex: number, periodType: PeriodType): number {
  if (yearIndex === 1 && periodType === "SEM") return 0;
  if (yearIndex === 1 && periodType === "SUM") return config.limits.first_year_summer_max_count;
  return periodType === "SEM" ? config.limits.semester_max_count : config.limits.summer_max_count;
}

export function evaluateMatrixCell(
  config: RuleConfigV31,
  profile: MatrixProfileRow,
  yearIndex: number,
  periodType: PeriodType
): PeriodCellResult {
  const periodCode = `Y${yearIndex}_${periodType}`;
  const maxCount = defaultMaxCount(config, yearIndex, periodType);

  if (profile.kind === "NO_ISG") {
    return {
      periodCode,
      yearIndex,
      periodType,
      status: "NOT_ELIGIBLE",
      maxCount: 0,
      note: "İSG geçilmediği için tüm dönemler yasaktır.",
    };
  }

  if (profile.kind === "REVIEW") {
    return {
      periodCode,
      yearIndex,
      periodType,
      status: "REVIEW_REQUIRED",
      maxCount,
      note: "Komisyon incelemesi gerekir.",
    };
  }

  // Absolute Y1_SEM prohibition
  if (yearIndex === 1 && periodType === "SEM") {
    return {
      periodCode,
      yearIndex,
      periodType,
      status: "NOT_ELIGIBLE",
      maxCount: 0,
      note: "1. sınıf Sömestr mutlak yasak (Özel Kural).",
    };
  }

  let baseStatus: EligibilityStatus = "NOT_ELIGIBLE";
  let note = "Geçerlilik penceresi dışında.";

  if (profile.kind === "ISG2" && profile.passedYear) {
    const startYear = profile.passedYear;
    const isAfterStart =
      profile.passedTerm === "FALL"
        ? yearIndex >= startYear
        : yearIndex > startYear || (yearIndex === startYear && periodType === "SUM");

    if (isAfterStart) {
      baseStatus = "ELIGIBLE";
      note = "İSG 2 sonrası süresiz uygun (retroactive=false).";
    } else {
      note = "Geçiş öncesi dönem (geriye dönük açılmaz).";
    }
  } else if (profile.kind === "ISG1" && profile.passedYear && profile.passedTerm) {
    const n = profile.passedYear;
    const endYear = n + config.global_toggles.isg1_validity_academic_years - 1;
    const inStart =
      profile.passedTerm === "FALL"
        ? yearIndex >= n
        : yearIndex > n || (yearIndex === n && periodType === "SUM");
    const inEnd = yearIndex <= endYear;

    if (!inStart) {
      note = "Geçiş öncesi dönem.";
    } else if (!inEnd) {
      note = `İSG 1 (${config.global_toggles.isg1_validity_academic_years} yıllık) süre doldu.`;
    } else {
      baseStatus = "ELIGIBLE";
      note =
        yearIndex === 1 && periodType === "SUM"
          ? `Özel kural: Max ${maxCount} staj`
          : `Uygun (Bilgilendirme Max ${maxCount})`;
    }
  }

  const scope: ProfileScope = profile.kind === "ISG2" ? "ISG2" : "ISG1";
  const override = findApplicableOverride(config.period_overrides, scope, yearIndex, periodType);
  if (override && !(yearIndex === 1 && periodType === "SEM" && override.status === "ELIGIBLE")) {
    return {
      periodCode,
      yearIndex,
      periodType,
      status: override.status,
      maxCount: override.max_count_info ?? maxCount,
      note: `Override (${override.override_id}): ${override.reason}`,
      overriddenBy: override.override_id,
    };
  }

  return {
    periodCode,
    yearIndex,
    periodType,
    status: baseStatus,
    maxCount: baseStatus === "ELIGIBLE" ? maxCount : 0,
    note,
  };
}
