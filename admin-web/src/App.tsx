import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Calendar,
  FileText,
  GitBranch,
  History,
  LogOut,
  Sliders,
  Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { AcademicCalendarPage } from "@/features/academic-calendar/AcademicCalendarPage";
import { AuthProvider, formatApiError, useAuth } from "@/features/auth/AuthContext";
import { LoginPage } from "@/features/auth/LoginPage";
import { CourseAliasesPage } from "@/features/course-aliases/CourseAliasesPage";
import { FlowchartViewerPage } from "@/features/flowchart-viewer/FlowchartViewerPage";
import { RagKnowledgePage } from "@/features/rag-knowledge/RagKnowledgePage";
import { RuleMatrixPage } from "@/features/rule-matrix/RuleMatrixPage";
import type { RuleConfigV31 } from "@/features/rule-matrix/schema";
import { TemplatesPage } from "@/features/templates/TemplatesPage";
import { VersionHistoryPage } from "@/features/version-history/VersionHistoryPage";
import { adminApi } from "@/lib/api/client";

type TabId =
  | "matrix"
  | "flowchart"
  | "versions"
  | "calendar"
  | "aliases"
  | "templates"
  | "rag";

const NAV_ITEMS: Array<{ id: TabId; label: string; icon: typeof Sliders }> = [
  { id: "matrix", label: "Kural Matrisi & Overrides", icon: Sliders },
  { id: "flowchart", label: "Canlı Flowchart", icon: GitBranch },
  { id: "versions", label: "Simülasyon & Sürümler", icon: History },
  { id: "calendar", label: "Takvim & Tatiller", icon: Calendar },
  { id: "aliases", label: "İSG Takma Adları", icon: Tag },
  { id: "templates", label: "DOCX Şablonları", icon: FileText },
  { id: "rag", label: "RAG Bilgi Tabanı", icon: BookOpen },
];

function AdminShell() {
  const { admin, loading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("matrix");
  const [savingDraft, setSavingDraft] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const ruleSetsQuery = useQuery({
    queryKey: ["rule-sets"],
    queryFn: () => adminApi.listRuleSets(),
    enabled: Boolean(admin),
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Oturum doğrulanıyor...
      </div>
    );
  }

  if (!admin) {
    return <LoginPage />;
  }

  const ruleSets = ruleSetsQuery.data ?? [];
  const activeDraft = ruleSets.find((r) => r.status === "DRAFT") ?? null;
  const activePublished = ruleSets.find((r) => r.status === "PUBLISHED") ?? ruleSets[0] ?? null;
  const previewConfig = (activeDraft ?? activePublished)?.config_json;

  const handleSaveDraft = async (config: RuleConfigV31) => {
    if (!activeDraft) return;
    setSavingDraft(true);
    setGlobalError(null);
    setSaveMessage(null);
    try {
      const updated = await adminApi.updateRuleDraft(activeDraft.id, {
        config_json: config,
        lock_version: activeDraft.lock_version,
      });
      setSaveMessage(`Taslak kaydedildi (${updated.version_tag}, lock_version: ${updated.lock_version}).`);
      await ruleSetsQuery.refetch();
    } catch (err) {
      setGlobalError(formatApiError(err));
    } finally {
      setSavingDraft(false);
    }
  };

  const handleCreateDraft = async () => {
    if (!activePublished) return;
    await adminApi.createDraftFrom(activePublished.id, `v3.${ruleSets.length + 1}.0-draft`);
    await ruleSetsQuery.refetch();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-slate-900">Staj Yardımcısı Admin</span>
            <Badge variant="info">v3.1</Badge>
            {activePublished && <Badge variant="success">Aktif: {activePublished.version_tag}</Badge>}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-600">{admin.email}</span>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="h-3.5 w-3.5" /> Çıkış
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        {globalError && <Alert variant="danger" className="mb-4">{globalError}</Alert>}

        {activeTab === "matrix" && (
          <RuleMatrixPage
            activeDraft={activeDraft}
            onSaveDraft={handleSaveDraft}
            onCreateDraft={handleCreateDraft}
            saving={savingDraft}
            saveMessage={saveMessage}
          />
        )}
        {activeTab === "flowchart" && previewConfig && (
          <FlowchartViewerPage config={previewConfig} />
        )}
        {activeTab === "versions" && (
          <VersionHistoryPage
            ruleSets={ruleSets}
            onRefresh={async () => {
              await ruleSetsQuery.refetch();
            }}
          />
        )}
        {activeTab === "calendar" && <AcademicCalendarPage />}
        {activeTab === "aliases" && <CourseAliasesPage />}
        {activeTab === "templates" && <TemplatesPage />}
        {activeTab === "rag" && <RagKnowledgePage />}
      </main>
    </div>
  );
}

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AdminShell />
      </AuthProvider>
    </QueryClientProvider>
  );
}
