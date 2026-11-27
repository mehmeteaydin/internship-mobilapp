import React, { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/primitives";
import { adminApi } from "@/lib/api/client";
import { formatApiError, useAuth } from "./AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("komisyon.admin@univ.edu.tr");
  const [password, setPassword] = useState("admin1234");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-blue-600">
            <ShieldCheck className="h-6 w-6" />
            <span className="text-xs font-semibold uppercase tracking-wider">Staj Yardımcısı v3.1</span>
          </div>
          <CardTitle className="text-xl">Bölüm Staj Komisyonu Girişi</CardTitle>
          <CardDescription>
            Kural motoru, şablon aktivasyonu ve resmî RAG bilgi tabanını yönetmek için oturum açın.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {adminApi.isMockMode && (
              <Alert variant="info">
                <strong>Mock Geliştirme Modu Aktif:</strong> Backend beklemeden tüm ekranları test edebilirsiniz.
              </Alert>
            )}
            {error && <Alert variant="danger">{error}</Alert>}
            <div className="space-y-1">
              <Label htmlFor="email">Kurumsal E-posta</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Parola</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              <Lock className="h-4 w-4" />
              {submitting ? "Giriş yapılıyor..." : "Yönetim Paneline Gir"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
