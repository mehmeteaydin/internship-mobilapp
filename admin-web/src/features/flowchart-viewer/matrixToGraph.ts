import type { Edge, Node } from "@xyflow/react";
import type { RuleConfigV31 } from "../rule-matrix/schema";

export interface FlowchartGraphResult {
  nodes: Node[];
  edges: Edge[];
}

const NODE_STYLES = {
  info: {
    background: "#dbeafe",
    border: "2px solid #2563eb",
    color: "#1e40af",
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "12px",
    fontWeight: 600,
  },
  success: {
    background: "#dcfce7",
    border: "2px solid #16a34a",
    color: "#166534",
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "12px",
    fontWeight: 600,
  },
  warning: {
    background: "#fef3c7",
    border: "2px solid #d97706",
    color: "#92400e",
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "12px",
    fontWeight: 600,
  },
  danger: {
    background: "#fde8e8",
    border: "2px solid #dc2626",
    color: "#991b1b",
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "12px",
    fontWeight: 600,
  },
} as const;

export function matrixToGraph(config: RuleConfigV31): FlowchartGraphResult {
  const validityYears = config.global_toggles.isg1_validity_academic_years;
  const semMax = config.limits.semester_max_count;
  const sumMax = config.limits.summer_max_count;
  const y1SumMax = config.limits.first_year_summer_max_count;
  const overrideCount = config.period_overrides.length;

  const hasOverrides = overrideCount > 0;
  const overrideLabel = hasOverrides
    ? `Aktif period_overrides (${overrideCount} adet): ${config.period_overrides
        .map((o) => `${o.profile_scope} Y${o.academic_year_index}_${o.period_type}->${o.status}`)
        .join(", ")}`
    : "Aktif period_overrides: Yok";

  const nodes: Node[] = [
    {
      id: "start",
      position: { x: 260, y: 10 },
      data: { label: `Transkript & Öğrenci Onayı (${config.title})` },
      style: { ...NODE_STYLES.info, width: 280 },
    },
    {
      id: "q_isg2",
      position: { x: 260, y: 100 },
      data: { label: "İSG 2 Kesin Başarılı mı? (AA–CC, G)" },
      style: { ...NODE_STYLES.info, width: 280 },
    },
    {
      id: "p_isg2",
      position: { x: 610, y: 100 },
      data: {
        label: `UYGUN (İSG 2): Geçiş sonrası süresiz (SEM max ${semMax} | SUM max ${sumMax})`,
      },
      style: { ...NODE_STYLES.success, width: 280 },
    },
    {
      id: "q_isg1",
      position: { x: 260, y: 205 },
      data: { label: `İSG 1 Kesin Başarılı mı? (${validityYears} Yıl Pencere)` },
      style: { ...NODE_STYLES.info, width: 280 },
    },
    {
      id: "r_y1f",
      position: { x: 20, y: 325 },
      data: {
        label: `1. Sınıf Güz: Y1_SEM YASAK | Y1_SUM Max ${y1SumMax} (Özel) | Y2_SEM ${semMax} | Y2_SUM ${sumMax}`,
      },
      style: { ...NODE_STYLES.warning, width: 240 },
    },
    {
      id: "r_nf",
      position: { x: 280, y: 325 },
      data: {
        label: `N >= 2 Güz/Bahar: N..N+${validityYears - 1} Yılları (SEM max ${semMax} | SUM max ${sumMax})`,
      },
      style: { ...NODE_STYLES.success, width: 255 },
    },
    {
      id: "q_cond",
      position: { x: 580, y: 230 },
      data: { label: "Devam Ediyor + Simülasyon Seçti mi?" },
      style: { ...NODE_STYLES.info, width: 260 },
    },
    {
      id: "r_cond",
      position: { x: 880, y: 230 },
      data: { label: "KOŞULLU: CONDITIONAL_ELIGIBLE (Belge Üretilemez)" },
      style: { ...NODE_STYLES.warning, width: 250 },
    },
    {
      id: "q_rev",
      position: { x: 580, y: 335 },
      data: { label: "DC/DD, Belirsiz MU veya Sadece Stajı Kalan mı?" },
      style: { ...NODE_STYLES.info, width: 260 },
    },
    {
      id: "r_rev",
      position: { x: 880, y: 335 },
      data: { label: "İNCELEME: REVIEW_REQUIRED (Komisyona Yönlendir)" },
      style: { ...NODE_STYLES.warning, width: 250 },
    },
    {
      id: "r_no",
      position: { x: 580, y: 445 },
      data: { label: `YASAK: ${config.undefined_period_policy} (Tüm Dönemler Kapalı)` },
      style: { ...NODE_STYLES.danger, width: 260 },
    },
    {
      id: "ov",
      position: { x: 180, y: 455 },
      data: { label: overrideLabel },
      style: {
        ...(hasOverrides ? NODE_STYLES.warning : NODE_STYLES.info),
        width: 340,
      },
    },
    {
      id: "out",
      position: { x: 220, y: 565 },
      data: {
        label: `Karar Çıktısı (Cumartesi=${config.global_toggles.allow_saturday_workday ? "Açık" : "Kapalı"}, YarımGün=${config.global_toggles.count_half_day_public_holidays_as_full_workday ? "1 Gün" : "0.5"})`,
      },
      style: { ...NODE_STYLES.success, width: 360 },
    },
  ];

  const edges: Edge[] = [
    { id: "e-start-isg2", source: "start", target: "q_isg2", animated: true },
    { id: "e-isg2-yes", source: "q_isg2", target: "p_isg2", label: "Evet" },
    { id: "e-isg2-no", source: "q_isg2", target: "q_isg1", label: "Hayır" },
    { id: "e-isg1-y1", source: "q_isg1", target: "r_y1f", label: "N = 1" },
    { id: "e-isg1-nf", source: "q_isg1", target: "r_nf", label: "N >= 2" },
    { id: "e-isg1-no", source: "q_isg1", target: "q_cond", label: "Hayır" },
    { id: "e-cond-yes", source: "q_cond", target: "r_cond", label: "Evet" },
    { id: "e-cond-no", source: "q_cond", target: "q_rev", label: "Hayır" },
    { id: "e-rev-yes", source: "q_rev", target: "r_rev", label: "Evet" },
    { id: "e-rev-no", source: "q_rev", target: "r_no", label: "Hayır" },
    { id: "e-p2-ov", source: "p_isg2", target: "ov" },
    { id: "e-y1-ov", source: "r_y1f", target: "ov" },
    { id: "e-nf-ov", source: "r_nf", target: "ov" },
    { id: "e-ov-out", source: "ov", target: "out", animated: true },
  ];

  return { nodes, edges };
}

export function configToMermaid(config: RuleConfigV31): string {
  const validity = config.global_toggles.isg1_validity_academic_years;
  const semMax = config.limits.semester_max_count;
  const sumMax = config.limits.summer_max_count;
  const y1Sum = config.limits.first_year_summer_max_count;
  const overrideNodes =
    config.period_overrides.length > 0
      ? config.period_overrides
          .map(
            (o) =>
              `${o.profile_scope} Y${o.academic_year_index}_${o.period_type} -> ${o.status}`
          )
          .join("; ")
      : "Yok";

  return [
    "flowchart TD",
    `    Start(["${config.title} (v${config.schema_version})"]) --> Q_ISG2{"İSG 2 Kesin Başarılı mı?"}`,
    `    Q_ISG2 -- "Evet" --> P_ISG2["UYGUN: Süresiz (SEM max ${semMax} / SUM max ${sumMax})"]`,
    `    Q_ISG2 -- "Hayır" --> Q_ISG1{"İSG 1 Kesin Başarılı mı? (${validity} yıl)"}`,
    `    Q_ISG1 -- "N=1" --> R_Y1["Y1_SEM: YASAK | Y1_SUM: Max ${y1Sum} | Y2_SUM: Max ${sumMax}"]`,
    `    Q_ISG1 -- "N>=2" --> R_NF["N..N+${validity - 1} Penceresi (SEM ${semMax} / SUM ${sumMax})"]`,
    `    Q_ISG1 -- "Hayır" --> Q_Cond{"Devam Ediyor + Simülasyon?"}`,
    `    Q_Cond -- "Evet" --> R_Cond["CONDITIONAL_ELIGIBLE (Belge Yok)"]`,
    `    Q_Cond -- "Hayır" --> Q_Rev{"DC/DD veya Belirsiz MU?"}`,
    `    Q_Rev -- "Evet" --> R_Rev["REVIEW_REQUIRED (Komisyon)"]`,
    `    Q_Rev -- "Hayır" --> R_No["${config.undefined_period_policy} (Tüm Dönemler Kapalı)"]`,
    `    P_ISG2 --> Ov{"period_overrides: ${overrideNodes}"}`,
    "    R_Y1 --> Ov",
    "    R_NF --> Ov",
    '    Ov --> Out(["Kesin Dönem Raporu"])',
    "    classDef danger fill:#fde8e8,stroke:#dc2626,color:#991b1b",
    "    classDef warning fill:#fef3c7,stroke:#d97706,color:#92400e",
    "    classDef success fill:#dcfce7,stroke:#16a34a,color:#166534",
    "    classDef info fill:#dbeafe,stroke:#2563eb,color:#1e40af",
    "    class R_No danger",
    "    class R_Y1,R_Cond,R_Rev warning",
    "    class P_ISG2,R_NF success",
    "    class Q_ISG2,Q_ISG1,Q_Cond,Q_Rev,Ov info",
  ].join("\n");
}
