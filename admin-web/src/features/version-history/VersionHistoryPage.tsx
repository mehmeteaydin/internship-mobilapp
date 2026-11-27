import { useState } from "react";
import { Play, CheckCircle2, RotateCcw, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Alert, Dialog, Table } from "@/components/ui/primitives";
import { adminApi } from "@/lib/api/client";
import type { RuleSetRecord, SimulateDiffResponse } from "@/lib/api/types";
import { formatApiError } from "../auth/AuthContext";

export function VersionHistoryPage({
  ruleSets,
  onRefresh,
}: {
  ruleSets: RuleSetRecord[];
  onRefresh: () => Promise<void>;
}) {
  const [simResult, setSimResult] = useState<SimulateDiffResponse | null>(null);
  const [publishTarget, setPublishTarget] = useState<RuleSetRecord | null>(null);
  const [approvedBy, setApprovedBy] = useState("Bölüm Staj Komisyonu (Yazılı Onay)");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSimulate = async (id: string) => {
    setErrorMsg(null);
    try {
      const res = await adminApi.simulateRuleSet(id);
      setSimResult(res);
    } catch (err) {
      setErrorMsg(formatApiError(err));
    }
  };

  const handlePublish = async () => {
    if (!publishTarget) return;
    setErrorMsg(null);
    try {
      await adminApi.publishRuleSet(publishTarget.id, approvedBy);
      setStatusMsg(`${publishTarget.version_tag} sürümü yayınlandı.`);
      setPublishTarget(null);
      await onRefresh();
    } catch (err) {
      setErrorMsg(formatApiError(err));
    }
  };

  const handleRollback = async (rs: RuleSetRecord) => {
    setErrorMsg(null);
    try {
      const created = await adminApi.rollbackRuleSet(rs.id);
      setStatusMsg(`Eski sürüm silinmeden yeni rollback sürümü (${created.version_tag}) yayınlandı.`);
      await onRefresh();
    } catch (err) {
      setErrorMsg(formatApiError(err));
    }
  };

  const handleCreateDraft = async (rs: RuleSetRecord) => {
    setErrorMsg(null);
    try {
      const tag = `v3.${ruleSets.length + 1}.0-draft`;
      const created = await adminApi.createDraftFrom(rs.id, tag);
      setStatusMsg(`Yeni taslak oluşturuldu: ${created.version_tag}`);
      await onRefresh();
    } catch (err) {
      setErrorMsg(formatApiError(err));
    }
  };

  return (
    <div className="space-y-6">
      {statusMsg && <Alert variant="success">{statusMsg}</Alert>}
      {errorMsg && <Alert variant="danger">{errorMsg}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Kural Sürüm Geçmişi, Simülasyon ve Rollback</CardTitle>
          <CardDescription>
            Yayınlanmış sürümler değiştirilemez veya silinemez. Rollback işlemi yeni bir sürüm kaydı oluşturur.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2 pr-3">Sürüm</th>
                <th className="py-2 pr-3">Durum</th>
                <th className="py-2 pr-3">Geçerlilik</th>
                <th className="py-2 pr-3">Onaylayan</th>
                <th className="py-2 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {ruleSets.map((rs) => (
                <tr key={rs.id} className="border-b last:border-none">
                  <td className="py-2.5 pr-3 font-medium">{rs.version_tag}</td>
                  <td className="py-2.5 pr-3">
                    <Badge
                      variant={
                        rs.status === "PUBLISHED"
                          ? "success"
                          : rs.status === "DRAFT"
                            ? "warning"
                            : "outline"
                      }
                    >
                      {rs.status}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-slate-600">
                    {rs.effective_from} → {rs.effective_until ?? "Aktif"}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-slate-600">{rs.approved_by ?? "Taslak"}</td>
                  <td className="flex justify-end gap-2 py-2.5">
                    <Button variant="outline" size="sm" onClick={() => handleSimulate(rs.id)}>
                      <Play className="h-3.5 w-3.5" /> Simulate & Diff
                    </Button>
                    {rs.status === "DRAFT" ? (
                      <Button size="sm" onClick={() => setPublishTarget(rs)}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Yayınla
                      </Button>
                    ) : (
                      <>
                        <Button variant="secondary" size="sm" onClick={() => handleCreateDraft(rs)}>
                          <Plus className="h-3.5 w-3.5" /> Taslak Türet
                        </Button>
                        {rs.status === "ARCHIVED" && (
                          <Button variant="outline" size="sm" onClick={() => handleRollback(rs)}>
                            <RotateCcw className="h-3.5 w-3.5" /> Rollback
                          </Button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      {simResult && (
        <Card>
          <CardHeader>
            <CardTitle>
              Simülasyon & Diff Sonucu ({simResult.summary.changed_profiles}/{simResult.summary.total_profiles} Profil Değişti)
            </CardTitle>
            <CardDescription>
              Baz alınan aktif sürüm: {simResult.baseline_rule_set_id} → Test edilen: {simResult.draft_rule_set_id}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="py-2 pr-3">Profil</th>
                  <th className="py-2 pr-3">Önceki</th>
                  <th className="py-2 pr-3">Sonraki</th>
                  <th className="py-2 pr-3">Etkilenen Dönemler</th>
                </tr>
              </thead>
              <tbody>
                {simResult.profile_diffs.map((row) => (
                  <tr key={row.profile_id} className="border-b last:border-none">
                    <td className="py-2 pr-3 text-xs font-medium">{row.profile_label}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline">{row.before_status}</Badge>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant={row.changed ? "warning" : "success"}>{row.after_status}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-600">
                      {row.affected_periods.length === 0
                        ? "Değişiklik yok"
                        : row.affected_periods
                            .map((p) => `${p.period}: ${p.before} → ${p.after}`)
                            .join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={Boolean(publishTarget)}
        onClose={() => setPublishTarget(null)}
        title={`Kural Sürümünü Yayınla (${publishTarget?.version_tag})`}
      >
        <div className="space-y-4">
          <Alert variant="warning">
            Yayınlama sonrası yeni HMAC belgeleri bu sürümle imzalanır; önceki taslak tokenlar 409 RULE_VERSION_CHANGED alacaktır.
          </Alert>
          <div>
            <Label>Komisyon Onay Referansı</Label>
            <Input value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPublishTarget(null)}>
              İptal
            </Button>
            <Button onClick={handlePublish}>Onayla ve Yayınla</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
