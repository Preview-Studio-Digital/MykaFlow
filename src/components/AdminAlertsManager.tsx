import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  Bell,
  AlertTriangle,
  RotateCcw,
  Clock,
  UserCheck,
  Building2,
  Calendar,
  Search,
  Filter,
  Eye,
  Paperclip,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  UserX,
  History,
  TrendingDown,
  ExternalLink,
  Wifi,
  Shield,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { fetchAllowedIps, saveAllowedIps } from "@/lib/network-security";

interface Deal {
  id: string;
  title: string;
  stage: "lead" | "qualification" | "negotiation" | "won" | "lost" | string;
  customer_id?: string | null;
  customer_name?: string | null;
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
  expected_close_date?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  req_number?: string;
  creator_name?: string;
  quote_file_url?: string | null;
  quote_file_name?: string | null;
}

interface DealHistoryItem {
  id: string;
  deal_id: string;
  user_id?: string;
  user_name?: string;
  action_type?: string;
  description: string;
  created_at: string;
}

const STAGE_LABELS: Record<string, string> = {
  lead: "TAREFAS",
  qualification: "ORÇAMENTOS",
  negotiation: "NEGOCIAÇÕES",
  won: "CONTRATOS",
  lost: "PERDIDOS",
};

export function AdminAlertsManager() {
  const navigate = useNavigate();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [historyList, setHistoryList] = useState<DealHistoryItem[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAlertTab, setActiveAlertTab] = useState<"all" | "overdue" | "returned" | "audit" | "security">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterUser, setFilterUser] = useState<string>("ALL");
  const [selectedDealForModal, setSelectedDealForModal] = useState<Deal | null>(null);

  // Segurança de Rede / IPs Autorizados
  const [allowedIps, setAllowedIps] = useState<string[]>([]);
  const [newIpInput, setNewIpInput] = useState("");
  const [isSavingIps, setIsSavingIps] = useState(false);

  useEffect(() => {
    fetchAllowedIps().then(setAllowedIps);
  }, []);

  async function handleAddIp(ipToAdd?: string) {
    const ip = (ipToAdd || newIpInput).trim();
    if (!ip) return;
    if (allowedIps.includes(ip)) {
      return toast.info("Este IP já está na lista de autorizados.");
    }
    setIsSavingIps(true);
    const updated = [...allowedIps, ip];
    await saveAllowedIps(updated);
    setAllowedIps(updated);
    setNewIpInput("");
    setIsSavingIps(false);
    toast.success(`IP ${ip} autorizado com sucesso!`);
  }

  async function handleRemoveIp(ipToRemove: string) {
    if (allowedIps.length <= 1) {
      return toast.error("É necessário manter ao menos 1 IP autorizado.");
    }
    setIsSavingIps(true);
    const updated = allowedIps.filter((ip) => ip !== ipToRemove);
    await saveAllowedIps(updated);
    setAllowedIps(updated);
    setIsSavingIps(false);
    toast.success(`IP ${ipToRemove} removido.`);
  }

  function handleOpenDeal(dealId?: string) {
    if (!dealId) return;
    sessionStorage.setItem("mykaflow_open_deal_id", dealId);
    navigate({ to: "/crm", search: { dealId } as any });
  }

  useEffect(() => {
    fetchAlertsData();
  }, []);

  async function fetchAlertsData() {
    setLoading(true);
    try {
      const [dealsRes, custRes, profRes, histRes] = await Promise.all([
        supabase.from("crm_deals").select("*").order("created_at", { ascending: false }),
        supabase.from("customers").select("id, name, company_name"),
        supabase.from("profiles").select("id, display_name, email"),
        supabase.from("crm_deal_history").select("*").order("created_at", { ascending: false }).limit(150),
      ]);

      if (dealsRes.error) throw dealsRes.error;

      const custMap = new Map((custRes.data || []).map((c) => [c.id, c.company_name || c.name]));
      const profMap = new Map((profRes.data || []).map((p) => [p.id, p.display_name || p.email]));

      const enrichedDeals: Deal[] = (dealsRes.data || []).map((d: any) => ({
        ...d,
        customer_name: custMap.get(d.customer_id) || d.customer_name || "Cliente não informado",
        assigned_user_name: profMap.get(d.assigned_user_id) || "Sem responsável",
        creator_name: profMap.get(d.user_id) || "Usuário",
      }));

      setDeals(enrichedDeals);
      setProfiles(profRes.data || []);
      setHistoryList(histRes.data || []);
    } catch (err: any) {
      console.error("Erro ao carregar auditoria de alertas:", err);
      toast.error("Erro ao carregar alertas do CRM");
    } finally {
      setLoading(false);
    }
  }

  // 1. Alertas de Prazos Ultrapassados
  const overdueAlerts = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return deals.filter((d) => {
      if (!d.expected_close_date || d.stage === "won" || d.stage === "lost" || d.stage === "archived") {
        return false;
      }
      const deadDate = new Date(d.expected_close_date + "T00:00:00");
      const diffDays = Math.ceil((deadDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays < 0;
    });
  }, [deals]);

  // 2. Alertas de Devoluções ao Criador
  const returnedAlerts = useMemo(() => {
    const returnedDealIds = new Set(
      historyList.filter((h) => h.action_type === "returned_to_creator").map((h) => h.deal_id)
    );
    return deals.filter(
      (d) =>
        (returnedDealIds.has(d.id) ||
          (d.user_id && d.assigned_user_id === d.user_id && d.notes?.includes("[DEVOLVIDA]"))) &&
        d.stage !== "won" &&
        d.stage !== "lost" &&
        d.stage !== "archived"
    );
  }, [deals, historyList]);

  // 3. Auditoria de Histórico Recente
  const recentAuditEntries = useMemo(() => {
    return historyList.filter(
      (h) =>
        h.action_type === "returned_to_creator" ||
        h.action_type === "status_changed" ||
        h.action_type === "reassigned" ||
        h.description.includes("Devolvido ao criador") ||
        h.description.includes("ALERTA ADM")
    );
  }, [historyList]);

  // 4. Alertas de Segurança de Rede (Tentativas de Acesso Externo)
  const securityAlertEntries = useMemo(() => {
    return historyList.filter(
      (h) =>
        h.action_type === "security_unauthorized_ip" ||
        h.description?.includes("ALERTA DE SEGURANÇA")
    );
  }, [historyList]);

  // Filtros combinados
  const displayedOverdue = useMemo(() => {
    return overdueAlerts.filter((d) => {
      if (filterUser !== "ALL" && d.assigned_user_id !== filterUser) return false;
      if (
        searchTerm &&
        !d.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !d.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !d.assigned_user_name?.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [overdueAlerts, filterUser, searchTerm]);

  const displayedReturned = useMemo(() => {
    return returnedAlerts.filter((d) => {
      if (filterUser !== "ALL" && d.assigned_user_id !== filterUser) return false;
      if (
        searchTerm &&
        !d.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !d.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !d.creator_name?.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [returnedAlerts, filterUser, searchTerm]);

  const totalAlertsCount = overdueAlerts.length + returnedAlerts.length + securityAlertEntries.length;

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground uppercase tracking-widest text-xs">
        Carregando Central de Alertas e Auditoria ADM...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Principal da Central de Alertas */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-950 via-amber-950/20 to-slate-950 border border-amber-500/30 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.3)]">
              <Bell className="h-7 w-7 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-black uppercase tracking-wider text-white">
                  Central de Alertas & Auditoria ADM
                </h2>
                {totalAlertsCount > 0 ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-500 text-white font-mono font-black text-xs shadow-md animate-pulse">
                    {totalAlertsCount} {totalAlertsCount === 1 ? "crítico" : "críticos"}
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold text-xs">
                    Tudo em Dia
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auditoria permanente de prazos vencidos, devoluções de atividades e logs operacionais
              </p>
            </div>
          </div>

          {/* Cards Rápidos de Status */}
          <div className="flex items-center gap-2.5">
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center min-w-[110px]">
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-400 block">
                Prazos Vencidos
              </span>
              <span className="text-xl font-black font-mono text-rose-300">
                {overdueAlerts.length}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center min-w-[110px]">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block">
                Devolvidas
              </span>
              <span className="text-xl font-black font-mono text-amber-300">
                {returnedAlerts.length}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-center min-w-[110px]">
              <span className="text-[10px] font-black uppercase tracking-widest text-sky-400 block">
                Logs Auditoria
              </span>
              <span className="text-xl font-black font-mono text-sky-300">
                {recentAuditEntries.length}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-center min-w-[110px]">
              <span className="text-[10px] font-black uppercase tracking-widest text-purple-400 block">
                Tentativas IP
              </span>
              <span className="text-xl font-black font-mono text-purple-300">
                {securityAlertEntries.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
        {/* Navegação de Abas Internas da Central */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/60 border border-white/10 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveAlertTab("all")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeAlertTab === "all"
                ? "bg-amber-500 text-black shadow-md"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            Todos ({totalAlertsCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveAlertTab("overdue")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
              activeAlertTab === "overdue"
                ? "bg-rose-500 text-white shadow-md"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" /> Prazos Vencidos ({overdueAlerts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveAlertTab("returned")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
              activeAlertTab === "returned"
                ? "bg-amber-500/30 text-amber-300 border border-amber-500/50 shadow-md"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Devolvidas ({returnedAlerts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveAlertTab("audit")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
              activeAlertTab === "audit"
                ? "bg-sky-500/30 text-sky-300 border border-sky-500/50 shadow-md"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            <History className="h-3.5 w-3.5" /> Log Auditoria ({recentAuditEntries.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveAlertTab("security")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
              activeAlertTab === "security"
                ? "bg-purple-500 text-white shadow-md"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            <Shield className="h-3.5 w-3.5" /> Segurança / IPs ({securityAlertEntries.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Busca por Texto */}
          <div className="flex items-center gap-1.5 bg-black/80 border border-white/15 rounded-xl px-3 py-1.5 shadow-inner">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por título, cliente ou usuário..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent text-xs text-white outline-none w-[200px] placeholder:text-muted-foreground/60 font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="text-xs text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filtro por Responsável */}
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="input-futuristic rounded-xl px-3 py-1.5 text-xs outline-none bg-black text-white font-bold border border-white/15 cursor-pointer"
          >
            <option value="ALL">Todos os Responsáveis</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id} className="bg-slate-900">
                {p.display_name || p.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CONTEÚDO DA CENTRAL DE ALERTAS CONFORME ABA SELECIONADA                   */}
      {/* ========================================================================= */}
      {activeAlertTab === "security" ? (
        /* ABA DE SEGURANÇA DE REDE / IPs AUTORIZADOS E TENTATIVAS BLOQUEADAS */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Coluna 1: Gerenciamento de IPs Autorizados */}
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-purple-500/30 backdrop-blur-xl shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-purple-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-white">
                  IPs Públicos Autorizados da Empresa
                </h3>
              </div>
              <span className="text-[10px] text-purple-300 font-mono">
                {allowedIps.length} {allowedIps.length === 1 ? "rede cadastrada" : "redes cadastradas"}
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Usuários e colaboradores só conseguem acessar o MykaFlow se estiverem conectados à internet com algum dos IPs abaixo.
            </p>

            {/* Adicionar Novo IP */}
            <div className="flex items-center gap-2 pt-2">
              <input
                type="text"
                placeholder="Ex: 177.212.224.153"
                value={newIpInput}
                onChange={(e) => setNewIpInput(e.target.value)}
                className="input-futuristic flex-1 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
              />
              <button
                type="button"
                onClick={() => handleAddIp()}
                disabled={isSavingIps || !newIpInput.trim()}
                className="btn-futuristic rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                <span>Adicionar IP</span>
              </button>
            </div>

            {/* Lista de IPs */}
            <div className="space-y-2 pt-3">
              {allowedIps.map((ip) => (
                <div
                  key={ip}
                  className="p-3 rounded-xl bg-black/60 border border-purple-500/20 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    <span className="font-mono text-sm font-bold text-white tracking-wider">
                      {ip}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveIp(ip)}
                    className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 transition-all cursor-pointer"
                    title="Remover este IP autorizado"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Coluna 2: Alertas de Tentativas de Acesso Externo */}
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-rose-500/30 backdrop-blur-xl shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-rose-300">
                  Tentativas de Acesso Bloqueadas ({securityAlertEntries.length})
                </h3>
              </div>
              <span className="text-[10px] text-rose-400 uppercase font-bold tracking-wider">
                Auditoria em Tempo Real
              </span>
            </div>

            {securityAlertEntries.length === 0 ? (
              <div className="p-8 text-center text-xs uppercase font-bold text-muted-foreground/50">
                Nenhuma tentativa de acesso externo registrada.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto custom-scrollbar pr-1">
                {securityAlertEntries.map((item) => {
                  const ipMatch = item.description?.match(/IP:\s*([0-9.]+)/i);
                  const attemptedIp = ipMatch?.[1];

                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/30 flex flex-col gap-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white uppercase">{item.user_name || "Usuário"}</span>
                        <span className="text-[10px] text-rose-300 font-mono">
                          {new Date(item.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-slate-200 text-xs leading-relaxed whitespace-pre-wrap">
                        {item.description}
                      </p>
                      {attemptedIp && !allowedIps.includes(attemptedIp) && (
                        <div className="pt-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleAddIp(attemptedIp)}
                            className="btn-ghost-neon px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/20 flex items-center gap-1 cursor-pointer"
                            title="Autorizar este IP imediatamente como rede da empresa"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Autorizar IP {attemptedIp}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : activeAlertTab === "audit" ? (
        /* ABA DE AUDITORIA E LOGS OPERACIONAIS */
        <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-sky-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-white">
                Logs de Auditoria e Movimentações Críticas
              </h3>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">
              Últimos {recentAuditEntries.length} eventos
            </span>
          </div>

          {recentAuditEntries.length === 0 ? (
            <div className="p-8 text-center text-xs uppercase font-bold text-muted-foreground/50">
              Nenhum log crítico registrado recentemente.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
              {recentAuditEntries.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleOpenDeal(item.deal_id)}
                  className={`p-3.5 rounded-xl bg-black/40 border border-white/10 transition-all flex items-center justify-between gap-3 text-xs ${
                    item.deal_id
                      ? "hover:border-sky-400/60 hover:bg-sky-950/20 cursor-pointer group shadow-sm"
                      : ""
                  }`}
                  title={item.deal_id ? "Clique para abrir a atividade no CRM" : undefined}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400 shrink-0">
                      <ShieldAlert className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white uppercase">{item.user_name || "Sistema"}</span>
                        <span className="text-[10px] text-muted-foreground">•</span>
                        <span className="text-[10px] text-sky-300 font-mono">
                          {new Date(item.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-white/90 text-xs mt-0.5 whitespace-pre-wrap leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>
                  {item.deal_id && (
                    <div className="shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-sky-400 group-hover:text-sky-300 group-hover:translate-x-0.5 transition-all">
                      <span>Ver Atividade</span>
                      <ArrowRight className="h-3 w-3" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ABA DE CARDS DE ALERTAS (VENCIDOS E/OU DEVOLVIDOS) */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Seção 1: Prazos Ultrapassados */}
          {(activeAlertTab === "all" || activeAlertTab === "overdue") && (
            <div
              className={`p-6 rounded-2xl bg-white/[0.02] border border-rose-500/30 backdrop-blur-xl shadow-xl space-y-4 ${
                activeAlertTab === "overdue" ? "lg:col-span-2" : ""
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-400" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-rose-300">
                    Atividades com Prazos Vencidos ({displayedOverdue.length})
                  </h3>
                </div>
                <span className="text-[10px] text-rose-400 uppercase font-bold tracking-wider">
                  Clique no card para abrir
                </span>
              </div>

              {displayedOverdue.length === 0 ? (
                <div className="p-8 text-center text-xs uppercase font-bold text-muted-foreground/50">
                  Nenhum prazo vencido encontrado.
                </div>
              ) : (
                <div className="space-y-3 max-h-[460px] overflow-y-auto custom-scrollbar pr-1">
                  {displayedOverdue.map((deal) => {
                    const now = new Date();
                    now.setHours(0, 0, 0, 0);
                    const deadDate = new Date(deal.expected_close_date + "T00:00:00");
                    const diffDays = Math.abs(
                      Math.ceil((deadDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                    );

                    return (
                      <div
                        key={deal.id}
                        onClick={() => handleOpenDeal(deal.id)}
                        className="group p-4 rounded-2xl bg-gradient-to-r from-rose-950/40 via-slate-950 to-slate-950 border border-rose-500/50 hover:border-rose-400 hover:shadow-lg hover:shadow-rose-950/50 hover:scale-[1.005] transition-all cursor-pointer flex flex-col justify-between gap-3 shadow-md"
                        title="Clique para abrir e gerenciar esta atividade no CRM"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[9px] font-black px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                {STAGE_LABELS[deal.stage] || deal.stage.toUpperCase()}
                              </span>
                              <span className="font-bold text-xs text-white truncate block uppercase group-hover:text-rose-200">
                                {deal.title.replace(/^\[(REQ\.\s*INTERNA|TAREFA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "")}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                              <Building2 className="h-3 w-3 text-sky-400 shrink-0" />
                              <span className="text-sky-300 font-semibold truncate">{deal.customer_name}</span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xs font-black text-rose-400 font-mono bg-rose-500/20 border border-rose-500/50 px-2 py-1 rounded-xl block">
                              Vencida há {diffDays} {diffDays === 1 ? "dia" : "dias"}
                            </span>
                          </div>
                        </div>

                        {deal.notes && (
                          <div className="p-2.5 rounded-xl bg-black/60 border border-white/5 text-[11px] text-white/80 line-clamp-2 leading-relaxed">
                            {deal.notes.replace(/\[.*?\]\s*/g, "").trim()}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px]">
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="h-3 w-3 text-emerald-400 shrink-0" />
                            <span>Responsável: <strong className="text-white">{deal.assigned_user_name}</strong></span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="hidden sm:inline text-muted-foreground">Autor: <strong className="text-slate-300">{deal.creator_name}</strong></span>
                            <span className="text-rose-300 font-bold uppercase tracking-wider flex items-center gap-1 group-hover:underline">
                              Abrir no CRM <ArrowRight className="h-3 w-3" />
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Seção 2: Atividades Devolvidas ao Criador */}
          {(activeAlertTab === "all" || activeAlertTab === "returned") && (
            <div
              className={`p-6 rounded-2xl bg-white/[0.02] border border-amber-500/30 backdrop-blur-xl shadow-xl space-y-4 ${
                activeAlertTab === "returned" ? "lg:col-span-2" : ""
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-amber-400" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-amber-300">
                    Atividades Devolvidas ao Criador ({displayedReturned.length})
                  </h3>
                </div>
                <span className="text-[10px] text-amber-400 uppercase font-bold tracking-wider">
                  Clique no card para abrir
                </span>
              </div>

              {displayedReturned.length === 0 ? (
                <div className="p-8 text-center text-xs uppercase font-bold text-muted-foreground/50">
                  Nenhuma atividade devolvida no momento.
                </div>
              ) : (
                <div className="space-y-3 max-h-[460px] overflow-y-auto custom-scrollbar pr-1">
                  {displayedReturned.map((deal) => (
                    <div
                      key={deal.id}
                      onClick={() => handleOpenDeal(deal.id)}
                      className="group p-4 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-950 to-slate-950 border border-amber-500/50 hover:border-amber-400 hover:shadow-lg hover:shadow-amber-950/50 hover:scale-[1.005] transition-all cursor-pointer flex flex-col justify-between gap-3 shadow-md"
                      title="Clique para abrir e gerenciar esta atividade no CRM"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[9px] font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              {STAGE_LABELS[deal.stage] || deal.stage.toUpperCase()}
                            </span>
                            <span className="font-bold text-xs text-white truncate block uppercase group-hover:text-amber-200">
                              {deal.title.replace(/^\[(REQ\.\s*INTERNA|TAREFA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "")}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                            <Building2 className="h-3 w-3 text-sky-400 shrink-0" />
                            <span className="text-sky-300 font-semibold truncate">{deal.customer_name}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[10px] font-black text-amber-300 uppercase bg-amber-500/20 border border-amber-500/40 px-2 py-1 rounded-xl block">
                            Devolvida ao Criador
                          </span>
                        </div>
                      </div>

                      {deal.notes && (
                        <div className="p-2.5 rounded-xl bg-black/60 border border-white/5 text-[11px] text-white/80 line-clamp-2 leading-relaxed">
                          {deal.notes.replace(/\[.*?\]\s*/g, "").trim()}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <UserCheck className="h-3 w-3 text-amber-400 shrink-0" />
                          <span>Criador & Responsável: <strong className="text-white">{deal.creator_name}</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                          {deal.expected_close_date && (
                            <div className="hidden sm:flex items-center gap-1 text-emerald-400 font-mono">
                              <Calendar className="h-3 w-3" />
                              <span>{deal.expected_close_date.split("-").reverse().join("/")}</span>
                            </div>
                          )}
                          <span className="text-amber-300 font-bold uppercase tracking-wider flex items-center gap-1 group-hover:underline">
                            Abrir no CRM <ArrowRight className="h-3 w-3" />
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
