import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Archive, MessageSquare, Plus, RefreshCw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Alert, Table } from "@/components/ui/primitives";
import { adminApi } from "@/lib/api/client";
import type { AssistantAskResponse } from "@/lib/api/types";
import { formatApiError } from "../auth/AuthContext";

export function RagKnowledgePage() {
  const sourcesQuery = useQuery({
    queryKey: ["rag-sources"],
    queryFn: () => adminApi.listRagSources(),
  });
  const jobsQuery = useQuery({
    queryKey: ["rag-jobs"],
    queryFn: () => adminApi.listRagJobs(),
    refetchInterval: 2500,
  });

  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("https://bilgisayar.univ.edu.tr/duyuru");
  const [sourceType, setSourceType] = useState<"DIRECTIVE" | "COMMITTEE_RULE" | "FAQ">("COMMITTEE_RULE");
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [sourceVersion, setSourceVersion] = useState("2026.3");
  const [rawContent, setRawContent] = useState("");

  const [question, setQuestion] = useState("Cumartesi günleri staj iş günü sayılır mı?");
  const [askResult, setAskResult] = useState<AssistantAskResponse | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const handleCreateSource = async () => {
    setErr(null);
    if (!sourceTitle.trim() || rawContent.trim().length < 10) {
      setErr("Kaynak başlığı ve en az 10 karakter içerik zorunludur.");
      return;
    }
    try {
      await adminApi.createRagSource({
        source_title: sourceTitle,
        source_url: sourceUrl,
        source_type: sourceType,
        priority,
        published_at: new Date().toISOString(),
        source_version: sourceVersion,
        raw_content: rawContent,
      });
      setSourceTitle("");
      setRawContent("");
      setMsg("Yeni resmî RAG kaynağı eklendi. Değişikliklerin yansıması için Reindex başlatın.");
      await sourcesQuery.refetch();
    } catch (e) {
      setErr(formatApiError(e));
    }
  };

  const handleTriggerReindex = async () => {
    setErr(null);
    try {
      const job = await adminApi.enqueueRagReindex();
      setMsg(`Reindex işi kuyruğa alındı (202 Accepted): ${job.id}`);
      await jobsQuery.refetch();
    } catch (e) {
      setErr(formatApiError(e));
    }
  };

  const handleAsk = async () => {
    setErr(null);
    try {
      const res = await adminApi.askAssistant(question);
      setAskResult(res);
    } catch (e) {
      setErr(formatApiError(e));
    }
  };

  return (
    <div className="space-y-6">
      {msg && <Alert variant="success">{msg}</Alert>}
      {err && <Alert variant="danger">{err}</Alert>}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Resmî RAG Bilgi Tabanı (`rag_sources`)</CardTitle>
            <CardDescription>
              Öncelik sırası: 1 = Yönerge, 2 = Komisyon Esasları, 3 = Web SSS. Transkript verisine erişim yoktur.
            </CardDescription>
          </div>
          <Button onClick={handleTriggerReindex}>
            <RefreshCw className="h-4 w-4" /> Manuel Reindex Başlat (`202`)
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-lg border bg-slate-50 p-4 md:grid-cols-3">
            <div>
              <Label>Kaynak Başlığı</Label>
              <Input
                placeholder="Örn: 2026 Yaz Stajı Komisyon Duyurusu"
                value={sourceTitle}
                onChange={(e) => setSourceTitle(e.target.value)}
              />
            </div>
            <div>
              <Label>Resmî URL</Label>
              <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Tür</Label>
                <Select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value as typeof sourceType)}
                >
                  <option value="DIRECTIVE">Yönerge</option>
                  <option value="COMMITTEE_RULE">Komisyon</option>
                  <option value="FAQ">SSS</option>
                </Select>
              </div>
              <div>
                <Label>Öncelik</Label>
                <Select
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value) as 1 | 2 | 3)}
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </Select>
              </div>
              <div>
                <Label>Sürüm</Label>
                <Input value={sourceVersion} onChange={(e) => setSourceVersion(e.target.value)} />
              </div>
            </div>
            <div className="md:col-span-3">
              <Label>Madde / Karar Metni (Markdown)</Label>
              <Textarea
                placeholder="## Karar 2026/09 — ..."
                value={rawContent}
                onChange={(e) => setRawContent(e.target.value)}
              />
            </div>
            <div className="md:col-span-3 flex justify-end">
              <Button onClick={handleCreateSource}>
                <Plus className="h-4 w-4" /> Kaynak Ekle
              </Button>
            </div>
          </div>

          <Table>
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2 pr-3">Öncelik</th>
                <th className="py-2 pr-3">Kaynak Adı & URL</th>
                <th className="py-2 pr-3">Sürüm</th>
                <th className="py-2 pr-3">Durum</th>
                <th className="py-2 text-right">Arşivle</th>
              </tr>
            </thead>
            <tbody>
              {(sourcesQuery.data ?? []).map((src) => (
                <tr key={src.id} className="border-b last:border-none">
                  <td className="py-2.5 pr-3">
                    <Badge variant={src.priority === 1 ? "default" : src.priority === 2 ? "info" : "outline"}>
                      Öncelik {src.priority}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="font-medium">{src.source_title}</div>
                    <div className="text-xs text-blue-600">{src.source_url}</div>
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs">{src.source_version}</td>
                  <td className="py-2.5 pr-3">
                    <Badge variant={src.status === "ACTIVE" ? "success" : "outline"}>{src.status}</Badge>
                  </td>
                  <td className="py-2.5 text-right">
                    {src.status === "ACTIVE" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await adminApi.archiveRagSource(src.id);
                          await sourcesQuery.refetch();
                        }}
                      >
                        <Archive className="h-4 w-4 text-red-600" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kalıcı Reindex İş Kuyruğu (`rag_reindex_jobs` — SKIP LOCKED)</CardTitle>
          <CardDescription>
            Worker lease, heartbeat ve yeniden deneme durumlarını canlı izleyin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2 pr-3">Job ID</th>
                <th className="py-2 pr-3">Durum</th>
                <th className="py-2 pr-3">İlerleme</th>
                <th className="py-2 pr-3">Worker & Deneme</th>
                <th className="py-2 pr-3">Sonuç / Hata Özeti</th>
              </tr>
            </thead>
            <tbody>
              {(jobsQuery.data ?? []).map((job) => (
                <tr key={job.id} className="border-b last:border-none">
                  <td className="py-2 pr-3 font-mono text-xs">{job.id}</td>
                  <td className="py-2 pr-3">
                    <Badge
                      variant={
                        job.status === "SUCCEEDED"
                          ? "success"
                          : job.status === "FAILED"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {job.status}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {job.processed_items} / {job.total_items} kaynak
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-600">
                    {job.worker_id ?? "-"} (deneme: {job.attempt_count})
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {job.error_summary
                      ? job.error_summary
                      : job.result_summary
                        ? JSON.stringify(job.result_summary)
                        : "İşleniyor..."}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> RAG Guardrail Test Konsolu (`POST /api/v1/assistant/ask`)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Örn: Cumartesi günleri staj iş günü sayılır mı?"
            />
            <Button onClick={handleAsk}>
              <Send className="h-4 w-4" /> Test Et
            </Button>
          </div>
          {askResult && (
            <div className="space-y-2 rounded-lg border bg-slate-50 p-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={askResult.conflict_detected ? "warning" : "info"}>{askResult.status}</Badge>
                {askResult.pii_masked && <Badge variant="warning">PII Maskelendi</Badge>}
                {askResult.redirect_target && (
                  <Badge variant="outline">Yönlendirme: {askResult.redirect_target}</Badge>
                )}
              </div>
              <p className="whitespace-pre-line text-slate-800">{askResult.answer}</p>
              {askResult.citations.length > 0 && (
                <div className="space-y-1 pt-2">
                  <div className="text-xs font-semibold text-slate-500">Kaynak Atıfları:</div>
                  {askResult.citations.map((c, idx) => (
                    <div key={idx} className="rounded border bg-white px-3 py-1.5 text-xs">
                      <strong>{c.source_title}</strong> — {c.article_no} (Öncelik {c.priority}) |{" "}
                      <a href={c.source_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                        {c.source_url}
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
