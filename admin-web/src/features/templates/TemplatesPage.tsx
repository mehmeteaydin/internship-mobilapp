import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download, Archive, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Alert, Table } from "@/components/ui/primitives";
import { adminApi } from "@/lib/api/client";
import { formatApiError } from "../auth/AuthContext";

export function TemplatesPage() {
  const query = useQuery({
    queryKey: ["document-templates"],
    queryFn: () => adminApi.listTemplates(),
  });

  const [name, setName] = useState("Zorunlu Staj Başvuru Formu");
  const [version, setVersion] = useState("3.2.0");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    setError(null);
    const fd = new FormData();
    fd.append("name", name);
    fd.append("version", version);
    if (file) fd.append("file", file);
    try {
      await adminApi.uploadTemplate(fd);
      setMessage("Yeni .docx şablon sürümü doğrulandı ve yüklendi.");
      setFile(null);
      await query.refetch();
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  return (
    <div className="space-y-6">
      {message && <Alert variant="success">{message}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Resmî `.docx` Başvuru Şablonu Yönetimi (`document_templates`)</CardTitle>
          <CardDescription>
            Her `template_key` için aynı anda yalnızca 1 aktif şablon bulunabilir (`PATCH /activate`). Aktif sürüm arşivlenemez.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-lg border bg-slate-50 p-3 md:grid-cols-4">
            <div>
              <Label>Şablon Adı</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Sürüm</Label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} />
            </div>
            <div>
              <Label>`.docx` Dosyası</Label>
              <Input
                type="file"
                accept=".docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={handleUpload}>
                <Upload className="h-4 w-4" /> Şablon Yükle
              </Button>
            </div>
          </div>

          <Table>
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2 pr-3">Ad / Sürüm</th>
                <th className="py-2 pr-3">Durum</th>
                <th className="py-2 pr-3">Placeholder Sayısı</th>
                <th className="py-2 pr-3">Checksum</th>
                <th className="py-2 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {(query.data ?? [])
                .filter((t) => !t.archived_at)
                .map((tpl) => (
                  <tr key={tpl.id} className="border-b last:border-none">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium">{tpl.name}</div>
                      <div className="font-mono text-xs text-slate-500">
                        {tpl.template_key} v{tpl.version}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge variant={tpl.is_active ? "success" : "outline"}>
                        {tpl.is_active ? "AKTİF ŞABLON" : "Pasif"}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">{tpl.placeholders_json.length} alan</td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-slate-500">
                      {tpl.checksum.slice(0, 22)}...
                    </td>
                    <td className="flex justify-end gap-2 py-2.5">
                      <a
                        href={adminApi.getTemplateDownloadUrl(tpl.id)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button variant="outline" size="sm">
                          <Download className="h-3.5 w-3.5" /> İndir
                        </Button>
                      </a>
                      {!tpl.is_active && (
                        <>
                          <Button
                            size="sm"
                            onClick={async () => {
                              setError(null);
                              await adminApi.activateTemplate(tpl.id);
                              setMessage(`${tpl.name} (v${tpl.version}) aktif şablon yapıldı.`);
                              await query.refetch();
                            }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Aktifleştir
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              setError(null);
                              try {
                                await adminApi.archiveTemplate(tpl.id);
                                await query.refetch();
                              } catch (err) {
                                setError(formatApiError(err));
                              }
                            }}
                          >
                            <Archive className="h-4 w-4 text-red-600" />
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
