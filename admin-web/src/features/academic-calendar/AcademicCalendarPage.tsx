import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Switch, Table } from "@/components/ui/primitives";
import { adminApi } from "@/lib/api/client";

export function AcademicCalendarPage() {
  const periodsQuery = useQuery({
    queryKey: ["academic-periods"],
    queryFn: () => adminApi.listAcademicPeriods(),
  });
  const daysQuery = useQuery({
    queryKey: ["calendar-days"],
    queryFn: () => adminApi.listCalendarDays(),
  });

  const [newHoliday, setNewHoliday] = useState({
    date: "2027-05-01",
    name: "Emek ve Dayanışma Günü",
    day_type: "PUBLIC_HOLIDAY" as const,
    is_half_day: false,
    is_workday_override: false,
    source: "Resmî Gazete",
  });

  const handleAddHoliday = async () => {
    await adminApi.createCalendarDay(newHoliday);
    await daysQuery.refetch();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Akademik Staj Dönem Pencereleri (`academic_periods`)</CardTitle>
          <CardDescription>
            Öğrenci tarih doğrulama ve `eligible_period_ids` eşleşmeleri bu dönem kayıtlarını kullanır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2 pr-3">Dönem ID</th>
                <th className="py-2 pr-3">Akademik Yıl</th>
                <th className="py-2 pr-3">Tip</th>
                <th className="py-2 pr-3">Resmî Staj Aralığı</th>
              </tr>
            </thead>
            <tbody>
              {(periodsQuery.data ?? []).map((p) => (
                <tr key={p.id} className="border-b last:border-none">
                  <td className="py-2 pr-3 font-mono text-xs font-semibold">{p.id}</td>
                  <td className="py-2 pr-3 text-xs">{p.academic_year} (Y{p.academic_year_index})</td>
                  <td className="py-2 pr-3">
                    <Badge variant={p.period_type === "SUM" ? "success" : "info"}>{p.period_type}</Badge>
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {p.internship_start_date} → {p.internship_end_date}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resmî / Dinî / İdari Tatil Takvimi (`calendar_days`)</CardTitle>
          <CardDescription>
            Arefe ve 28 Ekim gibi yarım gün tatillerin iş günü sayılıp sayılmayacağı buradan yönetilir.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-lg border bg-slate-50 p-3 md:grid-cols-5">
            <div>
              <Label>Tarih</Label>
              <Input
                type="date"
                value={newHoliday.date}
                onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
              />
            </div>
            <div>
              <Label>Tatil Adı</Label>
              <Input
                value={newHoliday.name}
                onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Tür</Label>
              <Select
                value={newHoliday.day_type}
                onChange={(e) =>
                  setNewHoliday({
                    ...newHoliday,
                    day_type: e.target.value as typeof newHoliday.day_type,
                  })
                }
              >
                <option value="PUBLIC_HOLIDAY">Resmî Tatil</option>
                <option value="RELIGIOUS_HOLIDAY">Dinî Bayram</option>
                <option value="UNIVERSITY_ADMIN_HOLIDAY">Üniversite İdari Tatili</option>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch
                checked={newHoliday.is_half_day}
                onCheckedChange={(v) => setNewHoliday({ ...newHoliday, is_half_day: v })}
              />
              <Label>Yarım Gün</Label>
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={handleAddHoliday}>
                <Plus className="h-4 w-4" /> Tatil Ekle
              </Button>
            </div>
          </div>

          <Table>
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2 pr-3">Tarih</th>
                <th className="py-2 pr-3">Tatil</th>
                <th className="py-2 pr-3">Tür</th>
                <th className="py-2 pr-3">Yarım Gün / İş Günü</th>
                <th className="py-2 pr-3">Kaynak</th>
                <th className="py-2 text-right">Sil</th>
              </tr>
            </thead>
            <tbody>
              {(daysQuery.data ?? []).map((d) => (
                <tr key={d.id} className="border-b last:border-none">
                  <td className="py-2 pr-3 font-mono text-xs">{d.date}</td>
                  <td className="py-2 pr-3 font-medium">{d.name}</td>
                  <td className="py-2 pr-3 text-xs">{d.day_type}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={d.is_half_day ? "warning" : "outline"}>
                      {d.is_half_day ? "Yarım Gün (1 İş Günü)" : "Tam Tatil (0)"}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-600">{d.source}</td>
                  <td className="py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await adminApi.deleteCalendarDay(d.id);
                        await daysQuery.refetch();
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
    </div>
  );
}
