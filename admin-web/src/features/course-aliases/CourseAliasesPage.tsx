import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Table } from "@/components/ui/primitives";
import { adminApi } from "@/lib/api/client";

export function CourseAliasesPage() {
  const query = useQuery({
    queryKey: ["course-aliases"],
    queryFn: () => adminApi.listCourseAliases(),
  });

  const [courseType, setCourseType] = useState<"ISG1" | "ISG2">("ISG1");
  const [courseCode, setCourseCode] = useState("");
  const [courseNameAlias, setCourseNameAlias] = useState("");

  const handleAdd = async () => {
    if (!courseCode.trim() || !courseNameAlias.trim()) return;
    await adminApi.createCourseAlias({
      course_type: courseType,
      course_code: courseCode.trim().toUpperCase(),
      course_name_alias: courseNameAlias.trim(),
      is_active: true,
    });
    setCourseCode("");
    setCourseNameAlias("");
    await query.refetch();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>İSG Ders Kodu Takma Adları (`course_aliases`)</CardTitle>
        <CardDescription>
          Transkript parser’ın eşleştireceği alternatif İSG 1 ve İSG 2 ders kodlarını yönetin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-lg border bg-slate-50 p-3 md:grid-cols-4">
          <div>
            <Label>Ders Tipi</Label>
            <Select
              value={courseType}
              onChange={(e) => setCourseType(e.target.value as "ISG1" | "ISG2")}
            >
              <option value="ISG1">İSG 1</option>
              <option value="ISG2">İSG 2</option>
            </Select>
          </div>
          <div>
            <Label>Ders Kodu</Label>
            <Input
              placeholder="Örn: ISG103"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
            />
          </div>
          <div>
            <Label>Transkript Ders Adı</Label>
            <Input
              placeholder="Örn: İş Sağlığı ve Güvenliği I"
              value={courseNameAlias}
              onChange={(e) => setCourseNameAlias(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={handleAdd}>
              <Plus className="h-4 w-4" /> Takma Ad Ekle
            </Button>
          </div>
        </div>

        <Table>
          <thead>
            <tr className="border-b text-left text-xs text-slate-500">
              <th className="py-2 pr-3">Tip</th>
              <th className="py-2 pr-3">Kod</th>
              <th className="py-2 pr-3">Ders Adı</th>
              <th className="py-2 pr-3">Güncelleyen</th>
              <th className="py-2 text-right">Sil</th>
            </tr>
          </thead>
          <tbody>
            {(query.data ?? []).map((item) => (
              <tr key={item.id} className="border-b last:border-none">
                <td className="py-2 pr-3">
                  <Badge variant={item.course_type === "ISG1" ? "info" : "success"}>
                    {item.course_type}
                  </Badge>
                </td>
                <td className="py-2 pr-3 font-mono text-xs font-semibold">{item.course_code}</td>
                <td className="py-2 pr-3">{item.course_name_alias}</td>
                <td className="py-2 pr-3 text-xs text-slate-500">{item.updated_by}</td>
                <td className="py-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await adminApi.deleteCourseAlias(item.id);
                      await query.refetch();
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </CardContent>
    </Card>
  );
}
