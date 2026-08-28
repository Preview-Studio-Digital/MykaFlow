import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  extractDealCostAnalysis,
  formatSecondsDetailed,
  DealCostAnalysis,
  syncSalaryConfigsFromSupabase,
} from "@/lib/salary-cost-tracker";
import {
  DollarSign,
  Clock,
  Users,
  GitFork,
  X,
  TrendingUp,
  Activity,
  Layers,
  FileSpreadsheet,
  User,
  Calculator,
  Zap,
} from "lucide-react";

interface DealCostModalProps {
  isOpen: boolean;
  onClose: () => void;
  deal: any | null;
  allDeals: any[];
}

function getUserSessionTheme(role?: string | null, userName?: string | null) {
  const cleanName = (userName || "").toUpperCase();
  const isAdm = role === "admin" || cleanName.includes("DIÓGENES") || cleanName.includes("DIOGENES") || cleanName.includes("ADMIN");
  if (isAdm) {
    return {
      activeCard: "bg-amber-950/30 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.25)]",
      activeIcon: "bg-amber-500/25 text-amber-400 border border-amber-500/40 animate-pulse",
      activeBadge: "bg-amber-500/25 text-amber-300 border border-amber-400/50",
      activeName: "text-amber-300",
    };
  }
  const isFin = role === "financeiro" || cleanName.includes("FINANCEIRO");
  if (isFin) {
    return {
      activeCard: "bg-emerald-950/30 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.25)]",
      activeIcon: "bg-emerald-500/25 text-emerald-400 border border-emerald-500/40 animate-pulse",
      activeBadge: "bg-emerald-500/25 text-emerald-300 border border-emerald-400/50",
      activeName: "text-emerald-300",
    };
  }
  // Padrão Comercial / CRM (ex: DIEGO)
  return {
    activeCard: "bg-sky-950/30 border-sky-500/50 shadow-[0_0_15px_rgba(56,189,248,0.25)]",
    activeIcon: "bg-sky-500/25 text-sky-400 border border-sky-500/40 animate-pulse",
    activeBadge: "bg-sky-500/25 text-sky-300 border border-sky-400/50",
    activeName: "text-sky-300",
  };
}

export function DealCostModal({
  isOpen,
  onClose,
  deal,
  allDeals,
}: DealCostModalProps) {
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [activeView, setActiveView] = useState<"collaborators" | "sessions">("collaborators");
  const [userRolesMap, setUserRolesMap] = useState<Record<string, string>>({});

  // Sincronizar salários salvos na nuvem e buscar papéis de usuários
  useEffect(() => {
    if (isOpen) {
      syncSalaryConfigsFromSupabase();
      supabase.from("user_roles").select("user_id, role").then(({ data }) => {
        if (data) {
          const map: Record<string, string> = {};
          data.forEach((r: any) => {
            if (r.user_id) map[r.user_id] = r.role;
          });
          setUserRolesMap(map);
        }
      });
    }
  }, [isOpen]);

  // Ticker de 1 segundo para atualizar sessões ativas e custos em tempo real
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  const costData: DealCostAnalysis = useMemo(() => {
    if (!deal) {
      return {
        dealId: "",
        dealTitle: "",
        reqNumber: "",
        totalCost: 0,
        totalSeconds: 0,
        totalHoursFormatted: "0s",
        mainDealCost: 0,
        mainDealSeconds: 0,
        subtasksCost: 0,
        subtasksSeconds: 0,
        subtasksCount: 0,
        collaboratorsCount: 0,
        userSummaries: [],
        allSessions: [],
        hasActiveSession: false,
      };
    }
    return extractDealCostAnalysis(deal, allDeals, nowMs);
  }, [deal, allDeals, nowMs]);

  if (!isOpen || !deal) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-5 animate-in fade-in overflow-hidden"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[98vh] h-[98vh] rounded-2xl border border-amber-500/40 p-4 sm:p-6 shadow-2xl flex flex-col backdrop-blur-2xl bg-gradient-to-b from-slate-950 via-black to-slate-950 text-white transition-all overflow-hidden relative"
      >
        {/* Glow Superior Dourado */}
        <div className="absolute top-0 left-1/4 right-1/4 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_20px_rgba(245,158,11,0.8)]" />

        {/* CABEÇALHO DO MODAL */}
        <div className="shrink-0 flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.3)] shrink-0">
              <DollarSign className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-500/25 text-amber-300 border border-amber-400/50 uppercase tracking-widest inline-flex items-center gap-1 shadow-sm">
                  <Calculator className="h-3 w-3" /> CUSTO EM TEMPO REAL
                </span>
                {costData.isSubtaskDeal ? (
                  <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded-md bg-sky-500/25 text-sky-300 border border-sky-400/50 uppercase tracking-widest inline-flex items-center gap-1 shadow-sm">
                    ATIVIDADE VINCULADA
                  </span>
                ) : costData.subtasksCount > 0 ? (
                  <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-500/25 text-emerald-300 border border-emerald-400/50 uppercase tracking-widest inline-flex items-center gap-1 shadow-sm">
                    ATIVIDADE PRIMÁRIA (CONSOLIDADA)
                  </span>
                ) : null}
                <span className="font-mono text-xs font-bold text-slate-400">
                  Nº {costData.reqNumber}
                </span>
                {costData.hasActiveSession && (
                  <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-500/25 text-emerald-300 border border-emerald-400/50 uppercase tracking-widest inline-flex items-center gap-1 animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.4)]">
                    <Zap className="h-3 w-3 text-emerald-400" /> SESSÃO ATIVA AGORA
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-black uppercase tracking-wide text-white truncate mt-1">
                {deal.title.replace(/^\[TAREFA\]\s*/i, "").replace(/^\[VINCULADA\]\s*/i, "").trim()}
              </h2>
              {costData.parentDealInfo?.title && (
                <p className="text-xs text-sky-300 font-bold mt-0.5 flex items-center gap-1">
                  <span>↳ Vinculada à Atividade Primária:</span>
                  <span className="text-white underline">{costData.parentDealInfo.title}</span>
                  {costData.parentDealInfo.reqNumber && (
                    <span className="font-mono text-[10px] text-slate-400">({costData.parentDealInfo.reqNumber})</span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Botão Fechar Dourado */}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 hover:border-amber-400/60 shadow-[0_0_15px_rgba(245,158,11,0.25)] hover:shadow-[0_0_20px_rgba(245,158,11,0.45)] transition-all cursor-pointer flex items-center justify-center gap-1.5 hover:scale-105 shrink-0"
            title="Fechar extrato de custos"
          >
            <X className="h-4 w-4 text-amber-400" />
            <span>Fechar</span>
          </button>
        </div>

        {/* HERO BANNER: MÉTRICAS DE CUSTO E TEMPO EM DESTAQUE */}
        <div className="shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
          {/* 1. CUSTO TOTAL CONSOLIDADO */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/20 via-amber-950/30 to-black border border-amber-500/50 shadow-[0_0_25px_rgba(245,158,11,0.2)] flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-amber-300">
              <span>{costData.isSubtaskDeal ? "CUSTO DESTA VINCULADA" : "CUSTO TOTAL CONSOLIDADO"}</span>
              <TrendingUp className="h-4 w-4 text-amber-400" />
            </div>
            <div className="my-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-amber-300 drop-shadow-[0_0_15px_rgba(245,158,11,0.6)]">
                R$ {costData.totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <p className="text-[10px] text-amber-200/80 font-bold uppercase tracking-wider">
              {costData.isSubtaskDeal
                ? "Horas e custos próprios (somados à Primária)"
                : costData.subtasksCount > 0
                ? `Principal + ${costData.subtasksCount} ${costData.subtasksCount === 1 ? "vinculada" : "vinculadas"}`
                : "Atividade Única"}
            </p>
          </div>

          {/* 2. TEMPO TOTAL INVESTIDO */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-sky-500/15 via-sky-950/25 to-black border border-sky-500/40 shadow-[0_0_20px_rgba(56,189,248,0.15)] flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-sky-300">
              <span>{costData.isSubtaskDeal ? "TEMPO DESTA VINCULADA" : "TEMPO TOTAL INVESTIDO"}</span>
              <Clock className="h-4 w-4 text-sky-400" />
            </div>
            <div className="my-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-sky-300 drop-shadow-[0_0_15px_rgba(56,189,248,0.5)]">
                {costData.totalHoursFormatted}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-sky-200/80 font-mono font-bold">
              {costData.isSubtaskDeal ? (
                <span>Sessões diretas deste card</span>
              ) : (
                <>
                  <span>Principal: {formatSecondsDetailed(costData.mainDealSeconds)}</span>
                  {costData.subtasksCount > 0 && (
                    <span>Vinc: {formatSecondsDetailed(costData.subtasksSeconds)}</span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 3. COLABORADORES & SESSÕES */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/15 via-emerald-950/25 to-black border border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)] flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-emerald-300">
              <span>EQUIPE & SESSÕES</span>
              <Users className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="my-2 flex items-baseline gap-3">
              <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-300 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]">
                {costData.collaboratorsCount}
              </span>
              <span className="text-xs text-muted-foreground font-bold uppercase">
                {costData.collaboratorsCount === 1 ? "Colaborador" : "Colaboradores"}
              </span>
            </div>
            <p className="text-[10px] text-emerald-200/80 font-bold uppercase tracking-wider">
              {costData.allSessions.length} {costData.allSessions.length === 1 ? "sessão de trabalho" : "sessões de trabalho"}
            </p>
          </div>
        </div>

        {/* NAVEGAÇÃO DE ABAS */}
        <div className="shrink-0 flex items-center gap-2 border-b border-white/10 pb-2 mb-3">
          <button
            type="button"
            onClick={() => setActiveView("collaborators")}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeView === "collaborators"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                : "bg-white/5 text-muted-foreground hover:text-white border border-transparent"
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Por Colaborador ({costData.userSummaries.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView("sessions")}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeView === "sessions"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                : "bg-white/5 text-muted-foreground hover:text-white border border-transparent"
            }`}
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Extrato de Sessões ({costData.allSessions.length})</span>
          </button>
        </div>

        {/* CORPO DO EXTRATO COM SCROLL */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-3">
          {costData.allSessions.length === 0 ? (
            <div className="p-10 text-center rounded-2xl bg-black/40 border border-white/5 space-y-2">
              <Activity className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Nenhuma sessão de trabalho registrada para esta atividade até o momento.
              </p>
              <p className="text-[11px] text-muted-foreground/60 max-w-md mx-auto">
                Assim que um colaborador iniciar a atividade pelo botão "INICIAR ATIVIDADE", o tempo e o custo serão calculados automaticamente.
              </p>
            </div>
          ) : activeView === "collaborators" ? (
            /* VISÃO POR COLABORADOR */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {costData.userSummaries.map((u) => {
                const percentOfTotal = costData.totalCost > 0 ? (u.totalCost / costData.totalCost) * 100 : 0;

                return (
                  <div
                    key={u.userId}
                    className="p-4 rounded-2xl bg-black/50 border border-white/10 hover:border-amber-500/40 transition-all flex flex-col justify-between gap-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-white/5 pb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                          <User className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-sm uppercase text-white truncate block">
                            {u.userName}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {u.sessionsCount} {u.sessionsCount === 1 ? "sessão" : "sessões"}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-mono text-base font-black text-amber-300 block">
                          R$ {u.totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] font-mono text-amber-400/80 font-bold">
                          {percentOfTotal.toFixed(1)}% do total
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-center text-xs font-mono">
                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-sans">
                          Salário Base
                        </span>
                        <span className="font-bold text-slate-200">
                          {u.baseSalary > 0
                            ? `R$ ${u.baseSalary.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                            : "Não def."}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-sans">
                          Taxa / Hora
                        </span>
                        <span className="font-bold text-amber-400">
                          R$ {u.hourlyRate.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/h
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-sans">
                          Tempo Gasto
                        </span>
                        <span className="font-bold text-sky-300">
                          {u.totalHoursFormatted}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* EXTRATO CRONOLÓGICO DE TODAS AS SESSÕES */
            <div className="space-y-2">
              {costData.allSessions.map((sess, idx) => {
                const userRole = userRolesMap[sess.userId] || null;
                const userTheme = getUserSessionTheme(userRole, sess.userName);

                return (
                  <div
                    key={sess.sessionId || idx}
                    className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                      sess.isActive
                        ? userTheme.activeCard
                        : sess.isSubtask
                        ? "bg-black/50 border-sky-500/25"
                        : "bg-black/50 border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`p-2 rounded-xl shrink-0 ${
                          sess.isActive
                            ? userTheme.activeIcon
                            : sess.isSubtask
                            ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {sess.isSubtask ? <GitFork className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`font-bold uppercase tracking-wide ${sess.isActive ? userTheme.activeName : "text-white"}`}>
                            {sess.userName}
                          </span>
                          {sess.isSubtask ? (
                            <span className="font-mono text-[9px] font-black px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30 uppercase">
                              VINCULADA #{sess.reqNumber}
                            </span>
                          ) : (
                            <span className="font-mono text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 uppercase">
                              PRINCIPAL
                            </span>
                          )}
                          {sess.isActive && (
                            <span className={`font-mono text-[9px] font-black px-1.5 py-0.5 rounded uppercase animate-pulse ${userTheme.activeBadge}`}>
                              AO VIVO
                            </span>
                          )}
                        </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground font-mono text-[11px] mt-0.5">
                        <span>
                          Início: {new Date(sess.startedAt).toLocaleString("pt-BR")}
                        </span>
                        {sess.endedAt && (
                          <span>
                            Fim: {new Date(sess.endedAt).toLocaleTimeString("pt-BR")}
                          </span>
                        )}
                        {sess.subtaskTitle && (
                          <span className="text-slate-300 truncate max-w-[250px]">
                            • {sess.subtaskTitle}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 border-white/5 pt-2 sm:pt-0 shrink-0 font-mono">
                    <div className="text-left sm:text-right">
                      <span className="text-[10px] uppercase text-muted-foreground block font-sans">
                        Duração
                      </span>
                      <span className="font-bold text-sky-300">
                        {formatSecondsDetailed(sess.durationSeconds)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] uppercase text-muted-foreground block font-sans">
                        Custo da Sessão
                      </span>
                      <span className="font-bold text-sm text-amber-300">
                        R$ {sess.sessionCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>

        {/* RODAPÉ DO MODAL COM RESUMO CONSOLIDADO */}
        <div className="shrink-0 pt-3 mt-3 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground font-mono text-[11px]">
            <Layers className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              Cálculo baseado no salário base mensal e multiplicador de encargos cadastrados na equipe.
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs uppercase font-bold text-slate-300">
              Somatório Final:
            </span>
            <span className="font-mono text-base font-black text-amber-300 bg-amber-500/20 px-3 py-1 rounded-xl border border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
              R$ {costData.totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
