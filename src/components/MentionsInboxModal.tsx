import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { 
  ChevronLeft, 
  AtSign, 
  Search, 
  Inbox, 
  MessageSquare, 
  ExternalLink 
} from "lucide-react";

export interface DealMentionReply {
  id: string;
  mention_id: string;
  deal_id: string;
  user_id: string;
  user_name: string;
  reply_text: string;
  created_at: string;
}

export interface DealMention {
  id: string;
  deal_id: string;
  author_id: string;
  author_name: string;
  mentioned_user_id: string;
  mentioned_user_name: string;
  content: string;
  created_at: string;
  read_by_user?: boolean;
  replies?: DealMentionReply[];
}

export interface MentionDeal {
  id: string;
  title: string;
  stage: string;
  notes?: string | null;
  req_number?: string | null;
  created_at?: string;
}

const STAGE_NAMES: Record<string, string> = {
  lead: "Tarefas",
  qualification: "Orçamento",
  proposal: "Aguardando Resp.",
  negotiation: "Em Produção",
  completed: "Concluído",
  won: "Aprovado",
  lost: "Perdido",
  archived: "Arquivado",
};

export function getDealMentions(deal: MentionDeal | null): DealMention[] {
  if (!deal || !deal.notes) return [];
  const mentions: DealMention[] = [];
  try {
    const regex = /\[MENTION:(.*?)\]/g;
    let match;
    while ((match = regex.exec(deal.notes)) !== null) {
      if (match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed && parsed.id && parsed.mentioned_user_id) {
            mentions.push(parsed);
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    console.warn("Erro ao fazer parse de menções em deal:", deal.id, e);
  }
  return mentions;
}

export function getDealMentionReplies(deal: MentionDeal | null): DealMentionReply[] {
  if (!deal || !deal.notes) return [];
  const replies: DealMentionReply[] = [];
  try {
    const regex = /\[MENTION_REPLY:(.*?)\]/g;
    let match;
    while ((match = regex.exec(deal.notes)) !== null) {
      if (match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed && parsed.id && parsed.mention_id) {
            replies.push(parsed);
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    console.warn("Erro ao fazer parse de respostas de menções em deal:", deal.id, e);
  }
  return replies;
}

export function getDealReqNumber(deal: MentionDeal, allDeals?: MentionDeal[]): string {
  if (deal.req_number && deal.req_number.trim()) {
    return deal.req_number.trim().replace(/\//g, ".");
  }

  const d = new Date(deal.created_at || Date.now());
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const prefix = `${yy}.${mm}`;

  if (!allDeals || allDeals.length === 0) {
    return `${prefix}.01`;
  }

  const sameMonthDeals = allDeals
    .filter((other) => {
      const otherDate = new Date(other.created_at || Date.now());
      const otherYY = String(otherDate.getFullYear()).slice(-2);
      const otherMM = String(otherDate.getMonth() + 1).padStart(2, "0");
      return `${otherYY}.${otherMM}` === prefix;
    })
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

  const index = sameMonthDeals.findIndex((other) => other.id === deal.id);
  const seq = index >= 0 ? index + 1 : sameMonthDeals.length + 1;
  return `${prefix}.${String(seq).padStart(2, "0")}`;
}

export function getCleanDealTitle(title: string): string {
  return title
    .replace(/^\[.*?\]\s*/, "")
    .replace(/\s*-\s*REQUISITO\s*#?[0-9.]+/i, "")
    .trim();
}

interface MentionsInboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  deals?: MentionDeal[];
  onOpenDeal?: (deal: MentionDeal) => void;
}

export function MentionsInboxModal({
  isOpen,
  onClose,
  currentUser,
  deals: propDeals,
  onOpenDeal,
}: MentionsInboxModalProps) {
  const navigate = useNavigate();
  const [internalDeals, setInternalDeals] = useState<MentionDeal[]>([]);
  const [mentionsFilterTab, setMentionsFilterTab] = useState<"all" | "unread" | "read">("all");
  const [mentionsSearchTerm, setMentionsSearchTerm] = useState("");

  const deals = propDeals || internalDeals;

  useEffect(() => {
    if (!isOpen) return;
    if (propDeals && propDeals.length > 0) return;

    let isMounted = true;
    const fetchDeals = async () => {
      const { data } = await supabase
        .from("crm_deals")
        .select("id, title, stage, notes, req_number, created_at");
      if (data && isMounted) {
        setInternalDeals(data as MentionDeal[]);
      }
    };

    fetchDeals();
    return () => {
      isMounted = false;
    };
  }, [isOpen, propDeals]);

  const userMentionsData = useMemo(() => {
    if (!currentUser) return { all: [], unreadCount: 0 };
    const myId = currentUser.id;
    const allMentions: Array<{ mention: DealMention; deal: MentionDeal; replies: DealMentionReply[] }> = [];

    deals.forEach((deal) => {
      const mentions = getDealMentions(deal);
      const allReplies = getDealMentionReplies(deal);

      mentions.forEach((m) => {
        if (m.mentioned_user_id === myId) {
          const repliesForThis = allReplies.filter((r) => r.mention_id === m.id);
          allMentions.push({
            mention: m,
            deal,
            replies: repliesForThis,
          });
        }
      });
    });

    allMentions.sort(
      (a, b) => new Date(b.mention.created_at).getTime() - new Date(a.mention.created_at).getTime()
    );

    const unreadCount = allMentions.filter((item) => !item.mention.read_by_user).length;

    return {
      all: allMentions,
      unreadCount,
    };
  }, [deals, currentUser]);

  const handleSelectMention = (deal: MentionDeal) => {
    onClose();
    if (onOpenDeal) {
      onOpenDeal(deal);
    } else {
      sessionStorage.setItem("mykaflow_open_deal_id", deal.id);
      navigate({ to: "/crm", search: { dealId: deal.id } as any });
    }
  };

  if (!isOpen) return null;

  const filteredMentions = userMentionsData.all.filter((item) => {
    if (mentionsFilterTab === "unread" && item.mention.read_by_user) return false;
    if (mentionsFilterTab === "read" && !item.mention.read_by_user) return false;
    if (mentionsSearchTerm.trim()) {
      const term = mentionsSearchTerm.toLowerCase();
      const matchAuthor = item.mention.author_name?.toLowerCase().includes(term);
      const matchTitle = item.deal.title?.toLowerCase().includes(term);
      const matchContent = item.mention.content?.toLowerCase().includes(term);
      const matchReq = getDealReqNumber(item.deal, deals)?.toLowerCase().includes(term);
      if (!matchAuthor && !matchTitle && !matchContent && !matchReq) return false;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-[85] flex flex-col bg-[#020617] text-white animate-in fade-in select-none">
      {/* 1. Cabeçalho Superior da Página */}
      <header className="shrink-0 bg-slate-950/80 backdrop-blur-xl border-b border-sky-500/20 px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4 shadow-2xl">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost-neon h-9 w-9 rounded-xl flex items-center justify-center text-accent hover:text-white border-primary/20 shrink-0 cursor-pointer transition-all hover:scale-105"
            title="Voltar"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex flex-col select-none justify-center focus:outline-none shrink-0">
            <svg
              className="w-[210px] sm:w-[245px] h-[26px] overflow-visible select-none drop-shadow-[0_0_12px_rgba(34,211,238,0.3)]"
              viewBox="0 0 245 26"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <text
                x="0"
                y="21"
                className="font-saira-stencil"
                fontSize="22"
                fill="#22d3ee"
                textLength="245"
                lengthAdjust="spacing"
              >
                CAIXA DE MENÇÕES
              </text>
            </svg>
          </div>

          <div className="h-6 w-px bg-white/15 hidden md:block shrink-0" />

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/30 shadow-[0_0_15px_rgba(56,189,248,0.25)] shrink-0">
              <AtSign className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black font-mono uppercase text-sky-300">
                  @{currentUser?.user_metadata?.display_name || currentUser?.email}
                </span>
                {userMentionsData.unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white font-mono text-[10px] font-black animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]">
                    {userMentionsData.unreadCount} novas
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground hidden lg:block truncate">
                Atividades em que você foi citado por colegas de equipe.
              </p>
            </div>
          </div>
        </div>

        {/* Badges de Contagem e Pesquisa */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={mentionsSearchTerm}
              onChange={(e) => setMentionsSearchTerm(e.target.value)}
              placeholder="Pesquisar menções..."
              className="w-full bg-slate-900 border border-white/15 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-sky-400/60 font-mono"
            />
          </div>

          {/* Abas Rápidas de Filtro */}
          <div className="flex items-center gap-1 bg-slate-900/90 border border-white/10 p-1 rounded-xl font-mono text-xs shrink-0">
            <button
              type="button"
              onClick={() => setMentionsFilterTab("all")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                mentionsFilterTab === "all"
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Todas ({userMentionsData.all.length})
            </button>
            <button
              type="button"
              onClick={() => setMentionsFilterTab("unread")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                mentionsFilterTab === "unread"
                  ? "bg-rose-500 text-white shadow-sm"
                  : "text-rose-400 hover:text-rose-300"
              }`}
            >
              Não Lidas ({userMentionsData.unreadCount})
            </button>
            <button
              type="button"
              onClick={() => setMentionsFilterTab("read")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                mentionsFilterTab === "read"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-emerald-400 hover:text-emerald-300"
              }`}
            >
              Lidas ({userMentionsData.all.length - userMentionsData.unreadCount})
            </button>
          </div>
        </div>
      </header>

      {/* 2. Conteúdo da Página: Tabela / Lista em Tela Cheia */}
      <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-8 max-w-7xl w-full mx-auto flex flex-col space-y-3 custom-scrollbar">
        {filteredMentions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 border border-dashed border-white/10 rounded-3xl bg-white/[0.01]">
            <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 mb-3">
              <Inbox className="h-10 w-10 opacity-60" />
            </div>
            <h4 className="text-sm font-black uppercase tracking-widest text-slate-300 font-mono">
              Nenhuma menção encontrada no filtro selecionado
            </h4>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              Todas as menções recebidas aparecem organizadas nesta tela para facilitar o acompanhamento direto.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredMentions.map(({ mention, deal, replies }, idx) => {
              const isUnread = !mention.read_by_user;
              const itemNumber = userMentionsData.all.length - idx;
              const formattedNumber = String(itemNumber).padStart(2, "0");
              const cleanTitle = getCleanDealTitle(deal.title);
              const dealReqNumber = getDealReqNumber(deal, deals);
              const stageName = STAGE_NAMES[deal.stage] || deal.stage;

              return (
                <div
                  key={mention.id}
                  onClick={() => handleSelectMention(deal)}
                  className={`group p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shadow-lg ${
                    isUnread
                      ? "bg-rose-950/25 hover:bg-rose-950/40 border-rose-500/40 shadow-rose-950/20 hover:border-rose-400 hover:shadow-[0_0_25px_rgba(244,63,94,0.2)]"
                      : "bg-slate-900/60 hover:bg-slate-900/90 border-white/10 hover:border-sky-400/40 shadow-black/40 hover:shadow-[0_0_25px_rgba(56,189,248,0.15)]"
                  }`}
                  title="Clique para abrir esta atividade no CRM"
                >
                  {/* Coluna 1: Número Sequencial + Status + Autor + Atividade + Mensagem */}
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                    {/* Número Sequencial Organizado */}
                    <span className={`font-mono text-xs sm:text-sm font-black px-2.5 py-1 rounded-xl border shrink-0 ${
                      isUnread
                        ? "bg-rose-950/80 text-rose-300 border-rose-500/40"
                        : "bg-slate-800/90 text-slate-300 border-white/10"
                    }`}>
                      #{formattedNumber}
                    </span>

                    {/* Status Lida / Não Lida */}
                    <span className={`font-mono text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border shrink-0 flex items-center gap-1 ${
                      isUnread
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse"
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${isUnread ? "bg-rose-400" : "bg-emerald-400"}`} />
                      {isUnread ? "NOVA" : "LIDA"}
                    </span>

                    {/* Informações da Mensagem e Atividade */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-black uppercase font-mono text-sky-400">
                          @{mention.author_name}
                        </span>
                        <span className="text-xs text-muted-foreground">mencionou você em</span>
                        <span className="text-xs font-bold uppercase text-white group-hover:text-sky-300 transition-colors truncate">
                          {cleanTitle}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
                          Nº {dealReqNumber}
                        </span>
                      </div>

                      {/* Trecho do conteúdo da mensagem */}
                      {mention.content && (
                        <p className="text-xs text-slate-300 line-clamp-2 italic font-sans bg-black/30 px-2.5 py-1 rounded-lg border border-white/5">
                          "{mention.content}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Coluna 2: Etapa, Respostas, Data e Ação */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                    {/* Quantidade de respostas se houver */}
                    {replies && replies.length > 0 && (
                      <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1">
                        <MessageSquare className="h-3 w-3 text-emerald-400" />
                        {replies.length} {replies.length === 1 ? "resposta" : "respostas"}
                      </span>
                    )}

                    {/* Coluna do Kanban */}
                    <span className="font-mono text-[10px] uppercase font-bold px-2.5 py-1 rounded-lg bg-slate-800/80 border border-white/10 text-slate-300 shrink-0">
                      {stageName}
                    </span>

                    {/* Data e Hora */}
                    <span className="font-mono text-xs text-slate-400 shrink-0">
                      {new Date(mention.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às {new Date(mention.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>

                    {/* Botão de Ação */}
                    <div className="p-2 rounded-xl bg-sky-500/10 group-hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 transition-all flex items-center gap-1 text-xs font-mono font-bold">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
