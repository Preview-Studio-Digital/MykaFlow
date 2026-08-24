import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sparkles,
  TrendingUp,
  Briefcase,
  CheckCircle2,
  Clock,
  Users,
  Copy,
  Check,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

interface Deal {
  id: string;
  title: string;
  stage: string;
  value?: number | null;
  customer_name?: string | null;
  customer_id?: string | null;
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
  created_at?: string;
  updated_at?: string;
  notes?: string | null;
  req_number?: string | null;
}

interface DealTimeSession {
  id: string;
  deal_id: string;
  user_id: string;
  user_name: string;
  started_at: string;
  ended_at?: string | null;
  duration_seconds?: number;
}

interface DailySnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function fmtCurrency(val: number) {
  return Number(val || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDuration(totalSeconds: number) {
  if (!totalSeconds || totalSeconds <= 0) return "0h 00m";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function DailySnapshotModal({ isOpen, onClose }: DailySnapshotModalProps) {
  const [period, setPeriod] = useState<"today" | "yesterday" | "week">("today");
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    async function loadSnapshotData() {
      setLoading(true);
      try {
        const [dealsRes, custRes, profRes] = await Promise.all([
          supabase.from("crm_deals").select("*"),
          supabase.from("customers").select("id, name, company_name"),
          supabase.from("profiles").select("id, display_name, email"),
        ]);

        const custMap = new Map((custRes.data || []).map((c) => [c.id, c.company_name || c.name]));
        const profMap = new Map((profRes.data || []).map((p) => [p.id, p.display_name || p.email]));

        const enriched: Deal[] = (dealsRes.data || []).map((d: any) => ({
          ...d,
          customer_name: custMap.get(d.customer_id) || d.customer_name || "Cliente não vinculado",
          assigned_user_name: profMap.get(d.assigned_user_id) || "Sem responsável",
        }));

        setDeals(enriched);
      } catch (err: any) {
        console.error("Erro ao carregar Snapshot:", err);
        toast.error("Erro ao carregar dados do Snapshot Comercial.");
      } finally {
        setLoading(false);
      }
    }

    loadSnapshotData();
  }, [isOpen]);

  // Intervalo de Datas do Período
  const dateRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    if (period === "today") {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (period === "yesterday") {
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    } else if (period === "week") {
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    return { start, end };
  }, [period]);

  // Métricas do Período
  const snapshotData = useMemo(() => {
    const { start, end } = dateRange;

    // 1. Propostas Criadas no período
    const createdInPeriod = deals.filter((d) => {
      if (!d.created_at) return false;
      const t = new Date(d.created_at).getTime();
      return t >= start.getTime() && t <= end.getTime();
    });

    const createdTotalValue = createdInPeriod.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

    // 2. Propostas Fechadas/Ganhas (Won) no período
    const wonInPeriod = deals.filter((d) => {
      if (d.stage !== "won") return false;
      const t = new Date(d.updated_at || d.created_at || "").getTime();
      return t >= start.getTime() && t <= end.getTime();
    });

    const wonTotalValue = wonInPeriod.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

    // 3. Atividades Concluídas no período
    const completedInPeriod = deals.filter((d) => {
      if (d.stage !== "completed") return false;
      const t = new Date(d.updated_at || d.created_at || "").getTime();
      return t >= start.getTime() && t <= end.getTime();
    });

    // 4. Sessões de Trabalho / Horas Produtivas no período
    const workSessions: DealTimeSession[] = [];
    deals.forEach((d) => {
      if (!d.notes) return;
      const regex = /\[WORK_LOG:(.*?)\]/g;
      let match;
      while ((match = regex.exec(d.notes)) !== null) {
        try {
          if (match[1]) {
            const parsed = JSON.parse(match[1]);
            const sTime = new Date(parsed.started_at).getTime();
            if (sTime >= start.getTime() && sTime <= end.getTime()) {
              workSessions.push(parsed);
            }
          }
        } catch (e) {}
      }
    });

    const totalWorkSeconds = workSessions.reduce(
      (sum, s) => sum + (Number(s.duration_seconds) || 0),
      0
    );

    // Produtividade por Usuário
    const userWorkMap = new Map<string, { name: string; seconds: number; tasks: number }>();
    workSessions.forEach((s) => {
      const uName = s.user_name || "Usuário";
      const uId = s.user_id || uName;
      const existing = userWorkMap.get(uId) || { name: uName, seconds: 0, tasks: 0 };
      existing.seconds += Number(s.duration_seconds) || 0;
      userWorkMap.set(uId, existing);
    });

    // Contagem de atividades criadas/geridas por usuário no período
    createdInPeriod.forEach((d) => {
      const uName = d.assigned_user_name || "Sem responsável";
      const uId = d.assigned_user_id || uName;
      const existing = userWorkMap.get(uId) || { name: uName, seconds: 0, tasks: 0 };
      existing.tasks += 1;
      userWorkMap.set(uId, existing);
    });

    const teamBreakdown = Array.from(userWorkMap.values()).sort((a, b) => b.seconds - a.seconds);

    return {
      createdCount: createdInPeriod.length,
      createdTotalValue,
      createdDeals: createdInPeriod,
      wonCount: wonInPeriod.length,
      wonTotalValue,
      wonDeals: wonInPeriod,
      completedCount: completedInPeriod.length,
      completedDeals: completedInPeriod,
      totalWorkSeconds,
      workSessionsCount: workSessions.length,
      teamBreakdown,
    };
  }, [deals, dateRange]);

  // Formatação para Copiar Resumo
  const handleCopySummary = () => {
    const periodLabel =
      period === "today"
        ? "Hoje"
        : period === "yesterday"
        ? "Ontem"
        : "Últimos 7 Dias";

    const text = `📊 *MYKAFLOW - SNAPSHOT COMERCIAL (${periodLabel.toUpperCase()})*
📅 Data: ${new Date().toLocaleDateString("pt-BR")}

💼 *OPERAÇÃO COMERCIAL:*
• Novas Propostas: ${snapshotData.createdCount} (${fmtCurrency(snapshotData.createdTotalValue)})
• Contratos Fechados: ${snapshotData.wonCount} (${fmtCurrency(snapshotData.wonTotalValue)})
• Atividades Concluídas: ${snapshotData.completedCount}
• Horas Produtivas Acumuladas: ${formatDuration(snapshotData.totalWorkSeconds)}

👥 *DESTAQUES DA EQUIPE:*
${
  snapshotData.teamBreakdown.length > 0
    ? snapshotData.teamBreakdown
        .map(
          (m, idx) =>
            `${idx + 1}. *${m.name}*: ${formatDuration(m.seconds)} logados`
        )
        .join("\n")
    : "• Nenhuma sessão registrada no período."
}

${
  snapshotData.wonDeals.length > 0
    ? `🏆 *CONTRATOS FECHADOS:* \n${snapshotData.wonDeals
        .map(
          (w) =>
            `• ${w.title} - ${w.customer_name} (${fmtCurrency(w.value || 0)})`
        )
        .join("\n")}`
    : ""
}
`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Resumo executivo copiado para a área de transferência!");
    setTimeout(() => setCopied(false), 3000);
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass relative max-w-4xl w-full max-h-[92vh] flex flex-col rounded-3xl border border-sky-400/40 bg-slate-950/95 shadow-[0_0_60px_rgba(56,189,248,0.25)] overflow-hidden animate-in zoom-in-95"
      >
        {/* Header do Snapshot */}
        <div className="shrink-0 p-5 sm:p-6 border-b border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-sky-950/50 via-slate-900/40 to-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-sky-500/20 border border-sky-400/40 text-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.3)]">
              <Sparkles className="h-6 w-6 text-sky-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black uppercase tracking-wider text-white">
                  Snapshot Comercial
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/40 text-[10px] font-black uppercase tracking-widest">
                  DIRETORIA
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Visão consolidada de vendas, entregas e tempo produtivo em tempo real.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            {/* Seletor de Período */}
            <div className="flex items-center p-1 rounded-xl bg-white/5 border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setPeriod("today")}
                className={`px-3 py-1 rounded-lg font-bold uppercase transition-all cursor-pointer ${
                  period === "today"
                    ? "bg-sky-500 text-white shadow-sm font-black"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => setPeriod("yesterday")}
                className={`px-3 py-1 rounded-lg font-bold uppercase transition-all cursor-pointer ${
                  period === "yesterday"
                    ? "bg-sky-500 text-white shadow-sm font-black"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                Ontem
              </button>
              <button
                type="button"
                onClick={() => setPeriod("week")}
                className={`px-3 py-1 rounded-lg font-bold uppercase transition-all cursor-pointer ${
                  period === "week"
                    ? "bg-sky-500 text-white shadow-sm font-black"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                7 Dias
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl border border-white/10 hover:border-white/20 text-muted-foreground hover:text-white bg-white/5 cursor-pointer transition-colors"
              title="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo com Rolagem */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 no-scrollbar">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
              <Sparkles className="h-8 w-8 text-sky-400 animate-spin" />
              <p className="text-xs uppercase font-bold tracking-widest text-muted-foreground">
                Consolidando métricas comerciais...
              </p>
            </div>
          ) : (
            <>
              {/* 4 Cards de Métricas Principais */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* 1. Propostas Criadas */}
                <div className="p-4 rounded-2xl bg-sky-950/40 border border-sky-500/30 backdrop-blur-md shadow-lg flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-sky-300">
                      Novas Propostas
                    </span>
                    <Briefcase className="h-4 w-4 text-sky-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-white font-mono leading-none">
                      {snapshotData.createdCount}
                    </p>
                    <p className="text-[11px] font-black text-sky-400 font-mono mt-1">
                      {fmtCurrency(snapshotData.createdTotalValue)}
                    </p>
                  </div>
                </div>

                {/* 2. Contratos Fechados */}
                <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 backdrop-blur-md shadow-lg flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                      Contratos Fechados
                    </span>
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-white font-mono leading-none">
                      {snapshotData.wonCount}
                    </p>
                    <p className="text-[11px] font-black text-emerald-400 font-mono mt-1">
                      {fmtCurrency(snapshotData.wonTotalValue)}
                    </p>
                  </div>
                </div>

                {/* 3. Atividades Concluídas */}
                <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 backdrop-blur-md shadow-lg flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-cyan-300">
                      Entregas Concluídas
                    </span>
                    <CheckCircle2 className="h-4 w-4 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-white font-mono leading-none">
                      {snapshotData.completedCount}
                    </p>
                    <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mt-1">
                      {snapshotData.completedCount === 1 ? "Atividade finalizada" : "Atividades finalizadas"}
                    </p>
                  </div>
                </div>

                {/* 4. Horas Produtivas Acumuladas */}
                <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 backdrop-blur-md shadow-lg flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300">
                      Horas Produtivas
                    </span>
                    <Clock className="h-4 w-4 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-white font-mono leading-none">
                      {formatDuration(snapshotData.totalWorkSeconds)}
                    </p>
                    <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mt-1">
                      {snapshotData.workSessionsCount} sessões ativas
                    </p>
                  </div>
                </div>
              </div>

              {/* Seção Central Dividida: Destaques da Equipe & Fechamentos */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Ranking de Produtividade da Equipe */}
                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex flex-col space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-sky-400" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-white">
                        Produtividade da Equipe
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground uppercase">
                      {snapshotData.teamBreakdown.length} colaboradores
                    </span>
                  </div>

                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1 no-scrollbar">
                    {snapshotData.teamBreakdown.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-6 text-center uppercase tracking-wider">
                        Nenhuma sessão de trabalho registrada no período.
                      </p>
                    ) : (
                      snapshotData.teamBreakdown.map((member, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/5 hover:border-sky-400/30 transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[10px] font-black flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <p className="text-xs font-bold text-white truncate">
                              {member.name}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-mono font-black text-sky-300 bg-sky-950/60 px-2 py-0.5 rounded-md border border-sky-400/30">
                              {formatDuration(member.seconds)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Contratos Fechados no Período */}
                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex flex-col space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-400" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-white">
                        Contratos Fechados
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">
                      {fmtCurrency(snapshotData.wonTotalValue)}
                    </span>
                  </div>

                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1 no-scrollbar">
                    {snapshotData.wonDeals.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-6 text-center uppercase tracking-wider">
                        Nenhum contrato fechado no período selecionado.
                      </p>
                    ) : (
                      snapshotData.wonDeals.map((deal) => (
                        <div
                          key={deal.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 hover:border-emerald-400/40 transition-all"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="text-xs font-black text-white truncate">
                              {deal.title}
                            </p>
                            <p className="text-[10px] text-emerald-300/80 truncate">
                              {deal.customer_name} • Resp: {deal.assigned_user_name}
                            </p>
                          </div>
                          <span className="text-xs font-mono font-black text-emerald-400 shrink-0">
                            {fmtCurrency(deal.value || 0)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Rodapé com Ação de Copiar Resumo */}
        <div className="shrink-0 p-4 border-t border-white/10 bg-black/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap className="h-4 w-4 text-sky-400" />
            <span className="hidden sm:inline">
              Copie o relatório pronto para envio via WhatsApp ou E-mail da diretoria.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopySummary}
              className="btn-futuristic px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-300">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>Copiar Resumo Executivo</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="btn-ghost-neon px-4 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:text-white cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
