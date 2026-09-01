import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, X, Check, Trash2, Calendar, Clock, User, Building, Layers, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export interface AdminEditDealModalProps {
  isOpen: boolean;
  onClose: () => void;
  deal: any | null;
  deals: any[];
  customers: Array<{ id: string; name: string; company_name?: string }>;
  teamMembers: Array<{ id: string; display_name?: string | null; email?: string }>;
  currentUser: any;
  onSaveDeal: (updatedDeal: any) => Promise<void> | void;
  onDeleteDeal: (deal: any) => void;
}

const CRM_STAGES = [
  { id: "lead", title: "Tarefas" },
  { id: "qualification", title: "Orçamentos" },
  { id: "negotiation", title: "Negociações" },
  { id: "won", title: "Contratos" },
  { id: "completed", title: "Concluídos" },
  { id: "lost", title: "Perdidos" },
  { id: "archived", title: "Arquivados" },
];

const DURATION_OPTIONS = [
  { value: "", label: "SEM DURAÇÃO" },
  { value: "1h", label: "1 HORA (1h)" },
  { value: "2h", label: "2 HORAS (2h)" },
  { value: "3h", label: "3 HORAS (3h)" },
  { value: "4h", label: "4 HORAS (4h)" },
  { value: "5h", label: "5 HORAS (5h)" },
  { value: "6h", label: "6 HORAS (6h)" },
  { value: "7h", label: "7 HORAS (7h)" },
  { value: "8h", label: "8 HORAS (8h)" },
];

function getCleanTitle(title: string | undefined | null): string {
  return (title || "")
    .replace(/^\[.*?\]\s*/, "")
    .replace(/\s*-\s*REQUISITO\s*#?[0-9.]+/i, "")
    .trim();
}

function getDuration(deal: any | null): string {
  if (!deal?.notes || !deal.notes.includes("[ESTIMATED_DURATION:")) return "";
  const match = deal.notes.match(/\[ESTIMATED_DURATION:(.*?)\]/);
  return match ? match[1].trim() : "";
}

function getReqNumber(deal: any, allDeals?: any[]): string {
  if (deal?.req_number && deal.req_number.trim()) {
    return deal.req_number.trim().replace(/\//g, ".");
  }
  const d = new Date(deal?.created_at || Date.now());
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const prefix = `${yy}.${mm}`;

  if (!allDeals || allDeals.length === 0) return `${prefix}.01`;

  const sameMonthDeals = allDeals
    .filter((other) => {
      const otherDate = new Date(other.created_at || Date.now());
      const otherYY = String(otherDate.getFullYear()).slice(-2);
      const otherMM = String(otherDate.getMonth() + 1).padStart(2, "0");
      return `${otherYY}.${otherMM}` === prefix;
    })
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

  const index = sameMonthDeals.findIndex((other) => other.id === deal?.id);
  const seq = index >= 0 ? index + 1 : sameMonthDeals.length + 1;
  return `${prefix}.${String(seq).padStart(2, "0")}`;
}

export function AdminEditDealModal({
  isOpen,
  onClose,
  deal,
  deals,
  customers,
  teamMembers,
  currentUser,
  onSaveDeal,
  onDeleteDeal,
}: AdminEditDealModalProps) {
  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [stage, setStage] = useState("lead");
  const [deadlineValue, setDeadlineValue] = useState("");
  const [durationValue, setDurationValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && deal) {
      setTitle(getCleanTitle(deal.title));
      setCustomerId(deal.customer_id || "");
      setAssignedUserId(deal.assigned_user_id || "");
      setStage(deal.stage === "proposal" ? "negotiation" : deal.stage || "lead");
      setDeadlineValue(deal.expected_close_date || "");
      setDurationValue(getDuration(deal));
    }
  }, [isOpen, deal]);

  if (!isOpen || !deal) return null;

  const reqNum = getReqNumber(deal, deals);
  const isLinkedSubtask = Boolean(deal.notes?.includes("[PARENT_DEAL:"));
  const effectiveStage = isLinkedSubtask ? deal.stage : stage;
  const isCompletedStage = effectiveStage === "completed";

  const hasCustomDuration = Boolean(
    durationValue && !DURATION_OPTIONS.some((opt) => opt.value.toLowerCase() === durationValue.toLowerCase())
  );

  const handleSave = async () => {
    if (!title.trim()) {
      return toast.error("O título da atividade não pode ficar em branco.");
    }

    const cleanTitleUpper = title.trim().toUpperCase();
    const titleWords = cleanTitleUpper.split(/\s+/).filter(Boolean);
    if (titleWords.length > 6) {
      return toast.error(`O título deve conter no máximo 6 palavras (atualmente com ${titleWords.length} palavras).`);
    }

    setIsSaving(true);
    const nowIso = new Date().toISOString();
    const prefixMatch = (deal.title || "").match(/^\[[^\]]+\]\s*/i);
    const prefix = prefixMatch ? prefixMatch[0] : "";
    const finalTitle = `${prefix}${cleanTitleUpper}`;

    let cleanNotes = (deal.notes || "").replace(/\[ESTIMATED_DURATION:[\s\S]*?\]\s*/g, "").trim();
    if (durationValue.trim()) {
      const durTag = `[ESTIMATED_DURATION:${durationValue.trim()}]`;
      cleanNotes = cleanNotes ? `${durTag}\n${cleanNotes}` : durTag;
    }

    const assignedUser = teamMembers.find((m) => m.id === assignedUserId);
    const assignedUserName = assignedUser ? (assignedUser.display_name || assignedUser.email) : null;

    const newCustomer = customerId ? customers.find((c) => c.id === customerId) : null;
    const newCustomerName = newCustomer ? (newCustomer.company_name || newCustomer.name || "Cliente") : "Uso Interno / Empresa";

    const finalDeadline = isCompletedStage ? null : (deadlineValue || null);
    const finalStage = isLinkedSubtask ? deal.stage : stage;

    const changes: string[] = [];
    const oldTitleClean = getCleanTitle(deal.title);
    if (oldTitleClean !== cleanTitleUpper) changes.push(`Título de "${oldTitleClean}" para "${cleanTitleUpper}"`);
    if ((deal.customer_id || "") !== customerId) changes.push(`Cliente para "${newCustomerName}"`);
    if ((deal.assigned_user_id || "") !== assignedUserId) changes.push(`Responsável para "${assignedUserName || "Nenhum"}"`);
    if (!isLinkedSubtask && deal.stage !== finalStage) {
      const oldStageTitle = CRM_STAGES.find((s) => s.id === deal.stage)?.title || deal.stage;
      const newStageTitle = CRM_STAGES.find((s) => s.id === finalStage)?.title || finalStage;
      changes.push(`Etapa de "${oldStageTitle}" para "${newStageTitle}"`);
    }
    if ((deal.expected_close_date || null) !== finalDeadline) {
      const oldFmt = deal.expected_close_date ? deal.expected_close_date.split("-").reverse().join("/") : "Sem prazo";
      const newFmt = finalDeadline ? finalDeadline.split("-").reverse().join("/") : "Sem prazo (Desconsiderado)";
      changes.push(`Prazo de ${oldFmt} para ${newFmt}`);
    }
    const oldEstDur = getDuration(deal);
    if (oldEstDur !== durationValue.trim()) {
      changes.push(`Duração estimada de "${oldEstDur || "Sem duração"}" para "${durationValue.trim() || "Sem duração"}"`);
    }

    if (changes.length === 0) {
      onClose();
      setIsSaving(false);
      return;
    }

    try {
      const updatePayload: any = {
        title: finalTitle,
        customer_id: customerId || null,
        assigned_user_id: assignedUserId || null,
        stage: finalStage,
        expected_close_date: finalDeadline,
        notes: cleanNotes,
        updated_at: nowIso,
      };

      const { error } = await supabase
        .from("crm_deals")
        .update(updatePayload)
        .eq("id", deal.id);

      if (error) throw error;

      const desc = `Edição completa da atividade realizada pelo Administrador (${currentUser?.user_metadata?.display_name || currentUser?.email}): ${changes.join("; ")}.`;
      try {
        await supabase.from("crm_deal_history").insert({
          deal_id: deal.id,
          user_id: currentUser?.id,
          user_name: currentUser?.user_metadata?.display_name || currentUser?.email || "Administrador",
          action_type: "admin_edited",
          description: desc,
          created_at: nowIso,
        });
      } catch (hErr) {}

      const updatedDealObj = {
        ...deal,
        title: finalTitle,
        customer_id: customerId || null,
        customer_name: newCustomerName,
        crm_customers: newCustomer ? { name: newCustomer.name, company_name: newCustomer.company_name } : null,
        assigned_user_id: assignedUserId || null,
        assigned_user_name: assignedUserName || undefined,
        stage: finalStage,
        expected_close_date: finalDeadline,
        notes: cleanNotes,
        updated_at: nowIso,
      };

      await onSaveDeal(updatedDealObj);
      onClose();
      toast.success("Informações da atividade salvas com sucesso pelo Administrador!");
    } catch (err: any) {
      toast.error("Erro ao salvar edições: " + (err.message || "Tente novamente"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in select-none"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass max-w-2xl w-full p-6 rounded-3xl border border-sky-500/40 shadow-[0_0_50px_rgba(56,189,248,0.25)] space-y-5 animate-in zoom-in-95 max-h-[90vh] flex flex-col cursor-default"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/40 shadow-[0_0_15px_rgba(56,189,248,0.3)]">
              <Pencil className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-sky-400 uppercase tracking-wider">
                Editar Atividade (Administrador)
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Nº {reqNum} {isLinkedSubtask && "• VINCULADA"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form de Edição */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Título da Atividade */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
              Título da Atividade (máx. 6 palavras)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="DIGITE O TÍTULO..."
              className="w-full bg-slate-950/80 border border-white/15 focus:border-sky-400 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none uppercase font-semibold transition-all"
            />
          </div>

          {/* Cliente da Atividade */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Building className="h-3.5 w-3.5 text-sky-400" /> Cliente Vinculado
            </label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full bg-slate-950/80 border border-white/15 focus:border-sky-400 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none uppercase font-medium transition-all"
            >
              <option value="">USO INTERNO / EMPRESA (SEM CLIENTE)</option>
              {customers.map((cust) => (
                <option key={cust.id} value={cust.id}>
                  {(cust.company_name || cust.name || "CLIENTE").toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Grid 2 colunas: Responsável e Etapa */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-sky-400" /> Responsável da Atividade
              </label>
              <select
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
                className="w-full bg-slate-950/80 border border-white/15 focus:border-sky-400 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none uppercase font-medium transition-all"
              >
                <option value="">NENHUM RESPONSÁVEL</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {(m.display_name || m.email || "MEMBRO").toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-sky-400" /> Etapa / Coluna CRM
              </label>
              {isLinkedSubtask ? (
                <div className="w-full bg-slate-950/80 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-400 flex items-center justify-between">
                  <span className="font-bold text-sky-300 uppercase">
                    {CRM_STAGES.find((s) => s.id === deal.stage)?.title || deal.stage}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                    (ACOMPANHA ATIVIDADE PRIMÁRIA)
                  </span>
                </div>
              ) : (
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/15 focus:border-sky-400 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none uppercase font-medium transition-all"
                >
                  {CRM_STAGES.map((stg) => (
                    <option key={stg.id} value={stg.id}>
                      {stg.title.toUpperCase()}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Aviso se a Etapa for Concluídos */}
          {isCompletedStage && (
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-300 text-xs flex items-start gap-2.5 shadow-inner">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-black uppercase tracking-wider text-[11px] text-emerald-300">
                  Coluna de Concluídos
                </p>
                <p className="text-[11px] text-emerald-200/90 leading-relaxed font-medium">
                  Atividades endereçadas para a coluna <strong>CONCLUÍDOS</strong> têm qualquer prazo anterior automaticamente <strong>desconsiderado e encerrado</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Grid 2 colunas: Prazo de Conclusão e Duração Estimada (Menu 1h a 8h) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-sky-400" /> Prazo de Conclusão
                </label>
                {isCompletedStage && (
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">
                    Desconsiderado
                  </span>
                )}
              </div>
              {isCompletedStage ? (
                <div className="w-full bg-slate-950/80 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-slate-400 flex items-center justify-center">
                  SEM PRAZO (CONCLUÍDO)
                </div>
              ) : (
                <input
                  type="date"
                  value={deadlineValue}
                  onChange={(e) => setDeadlineValue(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/15 focus:border-sky-400 rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-mono transition-all"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-sky-400" /> Duração Estimada
              </label>
              <select
                value={durationValue}
                onChange={(e) => setDurationValue(e.target.value)}
                className="w-full bg-slate-950/80 border border-white/15 focus:border-sky-400 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none uppercase font-medium transition-all"
              >
                {hasCustomDuration && (
                  <option value={durationValue}>
                    {durationValue.toUpperCase()} (PERSONALIZADA)
                  </option>
                )}
                {DURATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Seção Perigosa: Exclusão Permanente da Atividade */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-between bg-red-950/20 p-3.5 rounded-2xl border border-red-500/30">
            <div className="space-y-0.5">
              <span className="text-xs font-black text-red-400 uppercase tracking-wider block">
                Excluir Permanentemente
              </span>
              <span className="text-[11px] text-slate-400 block">
                Remove a atividade, anexos e todo o seu histórico.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onDeleteDeal(deal);
              }}
              className="px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider text-red-400 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 hover:border-red-400 transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
              <span>Excluir</span>
            </button>
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/15 transition-all cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-slate-950 bg-sky-400 hover:bg-sky-300 shadow-[0_0_20px_rgba(56,189,248,0.4)] transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {isSaving ? (
              <span>Salvando...</span>
            ) : (
              <>
                <Check className="h-4 w-4" />
                <span>Salvar Alterações</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
