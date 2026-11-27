import { useState } from "react";
import { Plus, Save, Trash2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert, Dialog, Switch, Table } from "@/components/ui/primitives";
import { FlowchartCanvas } from "@/features/flowchart-viewer/FlowchartViewerPage";
import type { RuleSetRecord } from "@/lib/api/types";
import { evaluateMatrixCell, STANDARD_MATRIX_PROFILES } from "./evaluator";
import {
  PeriodOverrideSchema,
  RuleConfigV31Schema,
  type PeriodOverride,
  type RuleConfigV31,
} from "./schema";

export function RuleMatrixPage({
  activeDraft,
  onSaveDraft,
  onCreateDraft,
  saving,
  saveMessage,
}: {
  activeDraft: RuleSetRecord | null;
  onSaveDraft: (config: RuleConfigV31) => Promise<void>;
  onCreateDraft: () => Promise<void>;
  saving: boolean;
  saveMessage: string | null;
}) {
  const [localConfig, setLocalConfig] = useState<RuleConfigV31 | null>(
    activeDraft ? activeDraft.config_json : null
  );
  const [maxYears, setMaxYears] = useState(5);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [newOverride, setNewOverride] = useState<PeriodOverride>({
    override_id: `committee-decision-${new Date().getFullYear()}-002`,
    profile_scope: "ISG1",
    academic_year_index: 2,
    period_type: "SUM",
    status: "REVIEW_REQUIRED",
    max_count_info: 2,
    reason: "Komisyon özel değerlendirmesi",
    effective_from: "2026-11-27",
    effective_until: null,
    source_reference: "Komisyon Kararı No: 2026/02",
  });
  const [overrideError, setOverrideError] = useState<string | null>(null);

  // Keep localConfig synced when draft changes
  const config = localConfig ?? activeDraft?.config_json;
  if (!activeDraft || !config) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Düzenlenebilir Taslak Bulunamadı</CardTitle>
          <CardDescription>
            Yayınlanmış sürümler değiştirilemez. Yeni bir taslak oluşturarak düzenlemeye başlayın.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onCreateDraft}>Aktif Sürümden Yeni Taslak Oluştur</Button>
        </CardContent>
      </Card>
    );
  }

  const updateConfig = (next: RuleConfigV31) => {
    setLocalConfig(next);
    const parsed = RuleConfigV31Schema.safeParse(next);
    if (!parsed.success) {
      setValidationErrors(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    } else {
      setValidationErrors([]);
    }
  };

  const handleSave = async () => {
    const parsed = RuleConfigV31Schema.safeParse(config);
    if (!parsed.success) {
      setValidationErrors(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
      return;
    }
    setValidationErrors([]);
    await onSaveDraft(parsed.data);
  };

  const handleAddOverride = () => {
    const single = PeriodOverrideSchema.safeParse(newOverride);
    if (!single.success) {
      setOverrideError(single.error.issues.map((i) => i.message).join(" | "));
      return;
    }
    const candidate: RuleConfigV31 = {
      ...config,
      period_overrides: [...config.period_overrides, single.data],
    };
    const fullCheck = RuleConfigV31Schema.safeParse(candidate);
    if (!fullCheck.success) {
      setOverrideError(fullCheck.error.issues.map((i) => i.message).join(" | "));
      return;
    }
    setOverrideError(null);
    updateConfig(candidate);
    setOverrideModalOpen(false);
  };

  const years = Array.from({ length: maxYears }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Dinamik Kural Matrisi ve `period_overrides` Editörü
          </h2>
          <p className="text-sm text-slate-500">
            Taslak: <strong>{activeDraft.version_tag}</strong> (lock_version: {activeDraft.lock_version})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="yearCount">Gösterilen Yıl:</Label>
          <Select
            id="yearCount"
            className="w-28"
            value={maxYears}
            onChange={(e) => setMaxYears(Number(e.target.value))}
          >
            <option value={4}>4 Yıl</option>
            <option value={5}>5 Yıl</option>
            <option value={6}>6 Yıl</option>
            <option value={7}>7 Yıl</option>
          </Select>
          <Button onClick={handleSave} disabled={saving || validationErrors.length > 0}>
            <Save className="h-4 w-4" />
            {saving ? "Kaydediliyor..." : "Taslağı Kaydet (PATCH)"}
          </Button>
        </div>
      </div>

      {saveMessage && <Alert variant="success">{saveMessage}</Alert>}
      {validationErrors.length > 0 && (
        <Alert variant="danger">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <ul className="list-disc pl-4">
              {validationErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Global Şalterler (`global_toggles`)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>İSG 1 Geçerlilik Süresi (Akademik Yıl)</Label>
              <Select
                className="w-24"
                value={config.global_toggles.isg1_validity_academic_years}
                onChange={(e) =>
                  updateConfig({
                    ...config,
                    global_toggles: {
                      ...config.global_toggles,
                      isg1_validity_academic_years: Number(e.target.value),
                    },
                  })
                }
              >
                <option value={1}>1 Yıl</option>
                <option value={2}>2 Yıl</option>
                <option value={3}>3 Yıl</option>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="t-holiday">Resmî ve Dinî Tatilleri Düş</Label>
              <Switch
                id="t-holiday"
                checked={config.global_toggles.exclude_public_holidays}
                onCheckedChange={(v) =>
                  updateConfig({
                    ...config,
                    global_toggles: { ...config.global_toggles, exclude_public_holidays: v },
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="t-sat">Cumartesi İş Günü Sayılabilsin</Label>
              <Switch
                id="t-sat"
                checked={config.global_toggles.allow_saturday_workday}
                onCheckedChange={(v) =>
                  updateConfig({
                    ...config,
                    global_toggles: { ...config.global_toggles, allow_saturday_workday: v },
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="t-half">Yarım Gün Resmî Tatilleri 1 Tam Gün Say (Arefe / 28 Ekim)</Label>
              <Switch
                id="t-half"
                checked={config.global_toggles.count_half_day_public_holidays_as_full_workday}
                onCheckedChange={(v) =>
                  updateConfig({
                    ...config,
                    global_toggles: {
                      ...config.global_toggles,
                      count_half_day_public_holidays_as_full_workday: v,
                    },
                  })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dönem Limitleri (Bilgilendirme Amaçlı)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div>
              <Label>Sömestr Max Staj</Label>
              <Input
                type="number"
                min={0}
                max={2}
                value={config.limits.semester_max_count}
                onChange={(e) =>
                  updateConfig({
                    ...config,
                    limits: { ...config.limits, semester_max_count: Number(e.target.value) },
                  })
                }
              />
            </div>
            <div>
              <Label>Yaz Max Staj</Label>
              <Input
                type="number"
                min={1}
                max={3}
                value={config.limits.summer_max_count}
                onChange={(e) =>
                  updateConfig({
                    ...config,
                    limits: { ...config.limits, summer_max_count: Number(e.target.value) },
                  })
                }
              />
            </div>
            <div>
              <Label>1. Sınıf Yaz (`Y1_SUM`) Max</Label>
              <Input
                type="number"
                min={0}
                max={2}
                value={config.limits.first_year_summer_max_count}
                onChange={(e) =>
                  updateConfig({
                    ...config,
                    limits: {
                      ...config.limits,
                      first_year_summer_max_count: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="flex flex-col justify-end">
              <Badge variant="danger">Y1_SEM: Mutlak Yasak (Değiştirilemez)</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Dönem İstisnaları (`period_overrides`)</CardTitle>
            <CardDescription>
              Profil özelindeki override (`ISG1`/`ISG2`), genel `ALL` override’ından üstündür. Çakışan aralıklar reddedilir.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setOverrideModalOpen(true)}>
            <Plus className="h-4 w-4" /> Override Ekle
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2 pr-3">ID</th>
                <th className="py-2 pr-3">Kapsam</th>
                <th className="py-2 pr-3">Dönem</th>
                <th className="py-2 pr-3">Durum</th>
                <th className="py-2 pr-3">Geçerlilik</th>
                <th className="py-2 pr-3">Referans</th>
                <th className="py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {config.period_overrides.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-sm text-slate-400">
                    Aktif dönem istisnası tanımlı değil.
                  </td>
                </tr>
              ) : (
                config.period_overrides.map((ov, idx) => (
                  <tr key={ov.override_id} className="border-b last:border-none">
                    <td className="py-2 pr-3 font-mono text-xs">{ov.override_id}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="info">{ov.profile_scope}</Badge>
                    </td>
                    <td className="py-2 pr-3 font-medium">
                      Y{ov.academic_year_index}_{ov.period_type}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge
                        variant={
                          ov.status === "ELIGIBLE"
                            ? "success"
                            : ov.status === "NOT_ELIGIBLE"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {ov.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {ov.effective_from} → {ov.effective_until ?? "Süresiz"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-600">{ov.source_reference}</td>
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updateConfig({
                            ...config,
                            period_overrides: config.period_overrides.filter((_, i) => i !== idx),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dinamik Akademik Yıl Matrisi (1–{maxYears}. Yıllar)</CardTitle>
          <CardDescription>
            Sabit 8 dönemle sınırlı değildir; 4. sınıf ve üzeri için 5+ yıl dinamik hesaplanır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2 pr-3">Öğrenci İSG Profili</th>
                {years.flatMap((y) => [
                  <th key={`y${y}-sem`} className="px-2 py-2 text-center">
                    Y{y}_SEM
                  </th>,
                  <th key={`y${y}-sum`} className="px-2 py-2 text-center">
                    Y{y}_SUM
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {STANDARD_MATRIX_PROFILES.map((profile) => (
                <tr key={profile.id} className="border-b last:border-none">
                  <td className="py-2 pr-3 text-xs font-medium text-slate-800">{profile.label}</td>
                  {years.flatMap((y) =>
                    (["SEM", "SUM"] as const).map((pt) => {
                      const cell = evaluateMatrixCell(config, profile, y, pt);
                      const variant =
                        cell.status === "ELIGIBLE"
                          ? "success"
                          : cell.status === "REVIEW_REQUIRED"
                            ? "warning"
                            : "danger";
                      return (
                        <td key={`${profile.id}-Y${y}_${pt}`} className="px-1.5 py-2 text-center" title={cell.note}>
                          <Badge variant={variant} className="text-[10px]">
                            {cell.status === "ELIGIBLE"
                              ? `Uygun (${cell.maxCount})`
                              : cell.status === "REVIEW_REQUIRED"
                                ? "İnceleme"
                                : "Yasak"}
                          </Badge>
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anlık Karar Akış Diyagramı (React Flow)</CardTitle>
        </CardHeader>
        <CardContent>
          <FlowchartCanvas config={config} heightClass="h-[440px]" />
        </CardContent>
      </Card>

      <Dialog
        open={overrideModalOpen}
        onClose={() => setOverrideModalOpen(false)}
        title="Yeni Dönem İstisnası (`period_override`)"
      >
        <div className="space-y-3">
          {overrideError && <Alert variant="danger">{overrideError}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Override ID</Label>
              <Input
                value={newOverride.override_id}
                onChange={(e) => setNewOverride({ ...newOverride, override_id: e.target.value })}
              />
            </div>
            <div>
              <Label>Profil Kapsamı</Label>
              <Select
                value={newOverride.profile_scope}
                onChange={(e) =>
                  setNewOverride({
                    ...newOverride,
                    profile_scope: e.target.value as PeriodOverride["profile_scope"],
                  })
                }
              >
                <option value="ALL">ALL</option>
                <option value="ISG1">ISG1</option>
                <option value="ISG2">ISG2</option>
              </Select>
            </div>
            <div>
              <Label>Akademik Yıl (N)</Label>
              <Input
                type="number"
                min={1}
                max={8}
                value={newOverride.academic_year_index}
                onChange={(e) =>
                  setNewOverride({ ...newOverride, academic_year_index: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label>Dönem Tipi</Label>
              <Select
                value={newOverride.period_type}
                onChange={(e) =>
                  setNewOverride({
                    ...newOverride,
                    period_type: e.target.value as PeriodOverride["period_type"],
                  })
                }
              >
                <option value="SEM">SEM (Sömestr)</option>
                <option value="SUM">SUM (Yaz)</option>
              </Select>
            </div>
            <div>
              <Label>Durum</Label>
              <Select
                value={newOverride.status}
                onChange={(e) =>
                  setNewOverride({
                    ...newOverride,
                    status: e.target.value as PeriodOverride["status"],
                  })
                }
              >
                <option value="ELIGIBLE">ELIGIBLE</option>
                <option value="NOT_ELIGIBLE">NOT_ELIGIBLE</option>
                <option value="REVIEW_REQUIRED">REVIEW_REQUIRED</option>
              </Select>
            </div>
            <div>
              <Label>Başlangıç Tarihi</Label>
              <Input
                type="date"
                value={newOverride.effective_from}
                onChange={(e) => setNewOverride({ ...newOverride, effective_from: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Gerekçe</Label>
            <Input
              value={newOverride.reason}
              onChange={(e) => setNewOverride({ ...newOverride, reason: e.target.value })}
            />
          </div>
          <div>
            <Label>Komisyon Referansı</Label>
            <Input
              value={newOverride.source_reference}
              onChange={(e) => setNewOverride({ ...newOverride, source_reference: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOverrideModalOpen(false)}>
              İptal
            </Button>
            <Button onClick={handleAddOverride}>Doğrula ve Ekle</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
