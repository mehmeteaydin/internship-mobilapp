import { useMemo, useRef } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Download, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { configToMermaid, matrixToGraph } from "./matrixToGraph";
import type { RuleConfigV31 } from "../rule-matrix/schema";

export function FlowchartCanvas({
  config,
  heightClass = "h-[540px]",
}: {
  config: RuleConfigV31;
  heightClass?: string;
}) {
  const { nodes, edges } = useMemo(() => matrixToGraph(config), [config]);
  const mermaidText = useMemo(() => configToMermaid(config), [config]);
  const [copied, setCopied] = useState(false);
  const flowWrapperRef = useRef<HTMLDivElement>(null);

  const handleCopyMermaid = async () => {
    await navigator.clipboard?.writeText(mermaidText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadMermaid = () => {
    const blob = new Blob([mermaidText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staj-kurallari-v${config.schema_version}.mmd`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSvg = () => {
    const svg = flowWrapperRef.current?.querySelector("svg");
    if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staj-flowchart-v${config.schema_version}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-red-600 bg-red-100" /> Yasak (`NOT_ELIGIBLE`)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-amber-600 bg-amber-100" /> Özel / İnceleme (`REVIEW`)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-emerald-600 bg-emerald-100" /> Uygun (`ELIGIBLE`)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-blue-600 bg-blue-100" /> Karar Düğümü
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyMermaid}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Kopyalandı" : "Mermaid Kopyala"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadMermaid}>
            <Download className="h-3.5 w-3.5" /> .mmd İndir
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadSvg}>
            <Download className="h-3.5 w-3.5" /> SVG Dışa Aktar
          </Button>
        </div>
      </div>

      <div ref={flowWrapperRef} className={`${heightClass} w-full rounded-lg border border-slate-200 bg-slate-50`}>
        <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
}

export function FlowchartViewerPage({ config }: { config: RuleConfigV31 }) {
  const mermaid = useMemo(() => configToMermaid(config), [config]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Canlı Kural Motoru Flowchart Önizlemesi</CardTitle>
          <CardDescription>
            Kural matrisi, global şalterler veya `period_overrides` değiştiğinde diyagram anında güncellenir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FlowchartCanvas config={config} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Üretilen Mermaid Kaynağı</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
            {mermaid}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
