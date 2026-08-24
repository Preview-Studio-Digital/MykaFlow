import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { MONTHS_PT } from "@/lib/finance-constants";
import { ConfirmModal } from "./ConfirmModal";

interface Props {
  onCreated: () => void;
  defaultMonth?: number;
  defaultYear?: number;
  onMonthShift?: (delta: number) => void;
  onMonthYearChange?: (month: number, year: number) => void;
  initialType?: "income" | "expense";
}

export function TransactionForm({
  onCreated,
  defaultMonth,
  defaultYear,
  onMonthShift,
  onMonthYearChange,
  initialType,
}: Props) {
  const { user, role } = useAuth();
  const [type] = useState<"income" | "expense">(initialType || "expense");
  const [nature, setNature] = useState<"fixed" | "variable" | "">("");

  const [dbCategories, setDbCategories] = useState<any[]>([]);
  const [dbSubCategories, setDbSubCategories] = useState<any[]>([]);
  const [selectedParentId, setSelectedParentId] = useState("");
  const [selectedSubId, setSelectedSubId] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [operationCost, setOperationCost] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Estado para Depreciação Frota
  const [quantityOfCars, setQuantityOfCars] = useState("1");
  const [carValue, setCarValue] = useState("");
  const [depreciationTerm, setDepreciationTerm] = useState("5");

  const getInitialDate = (m?: number, y?: number) => {
    const now = new Date();
    const targetM = m ?? now.getMonth();
    const targetY = y ?? now.getFullYear();

    if (now.getFullYear() === targetY && now.getMonth() === targetM) {
      // Mes atual: retorna dia atual (local)
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    } else {
      // Outro mes: retorna dia 01
      return `${targetY}-${String(targetM + 1).padStart(2, "0")}-01`;
    }
  };

  const [date, setDate] = useState(() => getInitialDate(defaultMonth, defaultYear));
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Limpa o erro ao alterar qualquer entrada relevante
  useEffect(() => {
    setFormError(null);
  }, [selectedParentId, selectedSubId, description, amount, nature, date, dueDate, operationCost]);

  // Sincronizar data ao navegar pelos meses
  useEffect(() => {
    if (defaultMonth !== undefined && defaultYear !== undefined) {
      setDate(getInitialDate(defaultMonth, defaultYear));
    }
  }, [defaultMonth, defaultYear]);
  // Enforce nature rules: Antecipação de Notas (Variável) and Locação (Fixa)
  useEffect(() => {
    if (!selectedParentId) return;
    const cat = dbCategories.find((c) => c.id === selectedParentId);
    if (cat) {
      const name = cat.name.toUpperCase();
      if (
        name === "ANTECIPAÇÃO DE NOTAS" ||
        name === "VENDAS" ||
        name === "MANUTENÇÃO" ||
        name === "FORNECEDORES" ||
        name === "PRESTADORES" ||
        name === "APORTE" ||
        (name === "EMPRÉSTIMO" && type === "income")
      ) {
        setNature("variable");
      } else if (name === "LOCAÇÃO" || name === "EQUIPE" || name === "AGNALDO" || name === "INFRAESTRUTURA" || name === "FROTA" || (name === "EMPRÉSTIMO" && type === "expense")) {
        setNature("fixed");
      }
    }
  }, [selectedParentId, dbCategories]);

  const selectedCategoryName = dbCategories.find((c) => c.id === selectedParentId)?.name.toUpperCase();
  const selectedSubCategoryName = dbSubCategories.find((s) => s.id === selectedSubId)?.name.toUpperCase();
  const isDepreciacaoFrota =
    type === "expense" &&
    selectedCategoryName === "FROTA" &&
    (selectedSubCategoryName === "DEPRECIAÇÃO" ||
     selectedSubCategoryName === "DEPRECIACO" ||
     selectedSubCategoryName === "DEPRECIACAO");

  const isAntecipacao = type === "income" && selectedCategoryName === "ANTECIPAÇÃO DE NOTAS";
  const isManutencaoOrLocacaoIncome = type === "income" && (selectedCategoryName === "MANUTENÇÃO" || selectedCategoryName === "LOCAÇÃO");
  const isPeriodic =
    (type === "income" && selectedCategoryName === "LOCAÇÃO") ||
    (type === "expense" && selectedCategoryName === "EMPRÉSTIMO");

  useEffect(() => {
    if (isPeriodic && date && !endDate) {
      const d = new Date(date + "T00:00:00");
      d.setDate(d.getDate() + 30);
      setEndDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
  }, [isPeriodic, date]);

  useEffect(() => {
    if (isAntecipacao && date && !dueDate) {
      const d = new Date(date + "T00:00:00");
      d.setDate(d.getDate() + 30);
      setDueDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
  }, [isAntecipacao, date]);

  // Efeito para cálculo automático da Depreciação Frota
  useEffect(() => {
    if (!isDepreciacaoFrota) return;
    const qty = parseInt(quantityOfCars) || 0;
    const val = parseFloat(carValue.replace(/\./g, "").replace(",", ".")) || 0;
    const term = parseFloat(depreciationTerm) || 5;

    if (qty > 0 && val > 0 && term > 0) {
      const calculated = (qty * val) / (term * 12);
      const formatted = calculated.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      setAmount(formatted);
    } else {
      setAmount("");
    }
  }, [isDepreciacaoFrota, quantityOfCars, carValue, depreciationTerm]);

  // Variáveis para layout
  const inputHeight = "h-11";
  const spaceY = "space-y-1";
  const gridGap = "gap-3";
  const formPadding = "p-5";
  const formGap = "gap-2";
  const btnPadding = "py-3 mt-2";

  // Componente de Select Customizado para permitir estilização do hover (fill color)
  const CustomSelect = ({
    value,
    onChange,
    options,
    placeholder,
    disabled = false,
    label,
  }: {
    value: string;
    onChange: (val: string) => void;
    options: { id: string; name: string }[];
    placeholder: string;
    disabled?: boolean;
    label: string;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const accentColor = type === "expense" ? "oklch(0.7 0.2 30)" : "oklch(0.78 0.16 150)";
    const bgColor = type === "expense" ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 211, 238, 0.2)";

    const selectedName = options.find((o) => o.id === value)?.name || placeholder;

    return (
      <div className={`${spaceY} relative`}>
        <span className="block text-[11px] uppercase tracking-[0.3em] text-muted-foreground font-black ml-2">
          {label}
        </span>
        <div className="relative">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsOpen(!isOpen)}
            className={`input-futuristic w-full ${inputHeight} rounded-2xl px-5 text-sm outline-none uppercase font-bold border-2 flex items-center justify-between transition-all ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer hover:border-accent/40"}`}
            style={{ color: value ? "white" : "rgba(255,255,255,0.4)" }}
          >
            <span className="truncate">{selectedName}</span>
            <Plus
              className={`h-4 w-4 transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}
              style={{ color: accentColor }}
            />
          </button>

          {isOpen && !disabled && (
            <>
              <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />
              <ul className="absolute top-full left-0 right-0 mt-1 z-[101] bg-[#0d1117] border-2 border-white/10 rounded-xl overflow-hidden max-h-[360px] overflow-y-auto shadow-[0_10px_50px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-200">
                <li
                  onClick={() => {
                    onChange("");
                    setIsOpen(false);
                  }}
                  className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors hover:text-white border-b border-white/5"
                  style={{
                    color: "rgba(255,255,255,0.4)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = bgColor)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {placeholder}
                </li>
                {options.map((opt) => (
                  <li
                    key={opt.id}
                    onClick={() => {
                      onChange(opt.id);
                      setIsOpen(false);
                    }}
                    className="px-4 py-2.5 text-xs font-bold uppercase cursor-pointer transition-colors hover:text-white border-b border-white/5 last:border-0"
                    style={{
                      backgroundColor: value === opt.id ? bgColor : "transparent",
                      color: value === opt.id ? "white" : "rgba(255,255,255,0.9)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = bgColor)}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        value === opt.id ? bgColor : "transparent")
                    }
                  >
                    {opt.name}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    );
  };

  const fetchCats = async () => {
    try {
      const { data: cats } = await supabase
        .from("financial_categories")
        .select("*")
        .eq("type", type)
        .order("name");

      const { data: subs } = await supabase
        .from("financial_subcategories")
        .select("*")
        .order("name");

      setDbCategories(cats || []);
      setDbSubCategories(subs || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCats();
  }, [type, refreshTrigger]);

  const [formConfirmModal, setFormConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: React.ReactNode;
    confirmText?: string;
    variant?: "danger" | "warning" | "info" | "success";
    isInputPrompt?: boolean;
    inputLabel?: string;
    inputPlaceholder?: string;
    onConfirm?: () => void | Promise<void>;
    onConfirmWithInput?: (val: string) => void | Promise<void>;
  } | null>(null);

  const handleQuickAdd = (parentId?: string) => {
    if (!user) {
      toast.error("Você precisa estar logado para cadastrar categorias.");
      return;
    }

    setFormConfirmModal({
      isOpen: true,
      title: parentId ? "Nova Subcategoria" : "Nova Categoria Principal",
      description: parentId
        ? "Digite o nome da nova subcategoria para adicionar:"
        : "Digite o nome da nova categoria principal:",
      confirmText: "Cadastrar",
      variant: "info",
      isInputPrompt: true,
      inputLabel: parentId ? "Nome da Subcategoria" : "Nome da Categoria",
      inputPlaceholder: "Ex: COMBUSTÍVEL, SOFTWARES, ALUGUEL...",
      onConfirmWithInput: async (name: string) => {
        if (!name.trim()) return;
        setFormConfirmModal(null);
        const upperName = name.trim().toUpperCase();
        setBusy(true);

        try {
          if (!parentId) {
            const { data, error } = await supabase
              .from("financial_categories")
              .insert({
                name: upperName,
                type: type,
                user_id: user.id,
              })
              .select()
              .single();

            if (error) {
              toast.error("Erro ao criar categoria: " + error.message);
              return;
            }

            if (data) {
              setDbCategories((prev) => [...prev, data]);
              setSelectedParentId(data.id);
              setSelectedSubId("");
              toast.success("Categoria criada com sucesso!");
            }
          } else {
            const { data, error } = await supabase
              .from("financial_subcategories")
              .insert({
                name: upperName,
                category_id: parentId,
                user_id: user.id,
              })
              .select()
              .single();

            if (error) {
              toast.error("Erro ao criar subcategoria: " + error.message);
              return;
            }

            if (data) {
              setDbSubCategories((prev) => [...prev, data]);
              setSelectedSubId(data.id);
              toast.success("Subcategoria criada com sucesso!");
            }
          }
        } catch (err: any) {
          toast.error("Erro inesperado: " + (err.message || "Tente novamente"));
        } finally {
          setBusy(false);
          setRefreshTrigger((prev) => prev + 1);
        }
      },
    });
  };

  const currentParents = dbCategories;
  const currentSubs = dbSubCategories.filter((s) => s.category_id === selectedParentId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!user || !selectedParentId) {
      setFormError("Selecione uma categoria");
      return;
    }
    const parent = dbCategories.find((c) => c.id === selectedParentId);
    const sub = dbSubCategories.find((s) => s.id === selectedSubId);

    if (!nature) {
      setFormError("Selecione o tipo de lançamento");
      return;
    }
    
    if (!selectedSubId && parent?.name.toUpperCase() !== "SALDO INICIAL") {
      setFormError("Selecione ou crie uma subcategoria");
      return;
    }

    if (!description || !description.trim()) {
      setFormError(isManutencaoOrLocacaoIncome ? "Insira o número da nota fiscal" : "Preencha os detalhes (descrição) do lançamento");
      return;
    }

    const value = parseFloat(amount.replace(/\./g, "").replace(",", "."));
    if (isNaN(value) || value <= 0) {
      setFormError("Insira um valor válido");
      return;
    }

    const costValue = isAntecipacao ? parseFloat(operationCost.replace(/\./g, "").replace(",", ".")) : 0;
    if (isAntecipacao) {
      if (!description.trim()) {
        setFormError("Insira o número da nota fiscal");
        return;
      }
      if (isNaN(costValue) || costValue < 0) {
        setFormError("Insira um valor de antecipação de notas válido");
        return;
      }
      if (!dueDate) {
        setFormError("Selecione a data de vencimento");
        return;
      }
    }

    setBusy(true);

    const nfText = description.toUpperCase().includes("NF") ? description.toUpperCase() : `NF ${description.toUpperCase()}`;
    const finalDescription = isAntecipacao 
      ? (sub?.name ? `${sub.name} - ${nfText}` : nfText)
      : (description.trim().toUpperCase() || sub?.name || null);

    const executeSave = async () => {
      setBusy(true);
      try {
        if (isPeriodic && endDate) {
          const start = new Date(date + "T00:00:00");
          const end = new Date(endDate + "T00:00:00");
          
          const transactions = [];
          let current = new Date(start);
          let isFirst = true;
          while (current <= end) {
            transactions.push({
              user_id: user.id,
              type,
              nature,
              category: parent?.name || "OUTROS",
              category_id_v2: selectedParentId,
              subcategory_id_v2: selectedSubId || null,
              description: isFirst ? finalDescription : (finalDescription ? `${finalDescription} | VALIDAR VALOR` : "VALIDAR VALOR"),
              amount: value,
              occurred_on: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
            });
            current.setMonth(current.getMonth() + 1);
            isFirst = false;
          }
          
          if (transactions.length > 0) {
            const { error: mainError } = await supabase.from("transactions").insert(transactions);
            if (mainError) {
              setBusy(false);
              toast.error(mainError.message);
              return;
            }
          }
        } else {
          // 1. Registro da Receita Principal
          const { error: mainError } = await supabase.from("transactions").insert({
            user_id: user.id,
            type,
            nature,
            category: parent?.name || "OUTROS",
            category_id_v2: selectedParentId,
            subcategory_id_v2: selectedSubId || null,
            description: finalDescription,
            amount: value,
            occurred_on: date,
          });

          if (mainError) {
            setBusy(false);
            toast.error(mainError.message);
            return;
          }
        }

        // 2. Se for antecipação, registra o custo como despesa e o marcador de vencimento
        if (isAntecipacao) {
          // Custo da Operação (Despesa na mesma data)
          if (costValue > 0) {
            await supabase.from("transactions").insert({
              user_id: user.id,
              type: "expense",
              nature: "variable",
              category: "CUSTO ANTECIPAÇÃO",
              subcategory_id_v2: selectedSubId || null,
              description: finalDescription,
              amount: costValue,
              occurred_on: date,
            });
          }

          // Marcador de Vencimento (0 na data de vencimento)
          await supabase.from("transactions").insert({
            user_id: user.id,
            type: "expense",
            nature: "variable",
            category: "VENCIMENTO ANTECIPAÇÃO",
            description: `VENCIMENTO: ${finalDescription} | Valor: R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            amount: 0,
            occurred_on: dueDate,
          });
        }

        setBusy(false);
        toast.success(isPeriodic ? "Lançamentos registrados!" : "Lançamento registrado!");
        setAmount("");
        setOperationCost("");
        setDueDate("");
        setEndDate("");
        setSelectedSubId("");
        setDescription("");
        setSelectedParentId("");
        setQuantityOfCars("1");
        setCarValue("");
        setDepreciationTerm("5");
        onCreated();
      } catch (err: any) {
        setBusy(false);
        toast.error("Erro ao salvar lançamento: " + (err.message || "Tente novamente"));
      }
    };

    // Verificação de duplicados
    try {
      let query = supabase
        .from("transactions")
        .select("id")
        .eq("user_id", user.id)
        .eq("type", type)
        .eq("nature", nature)
        .eq("category_id_v2", selectedParentId)
        .eq("amount", value)
        .eq("occurred_on", date);

      if (selectedSubId) {
        query = query.eq("subcategory_id_v2", selectedSubId);
      } else {
        query = query.is("subcategory_id_v2", null);
      }

      if (finalDescription) {
        query = query.eq("description", finalDescription);
      } else {
        query = query.is("description", null);
      }

      const { data: dupData, error: dupError } = await query;
      if (dupError) throw dupError;

      if (dupData && dupData.length > 0) {
        const msg = isPeriodic
          ? "Atenção: Já existe um lançamento recorrente registrado que inicia com exatamente esses mesmos dados (Data, Valor, Categoria e Descrição). Deseja criar essa recorrência duplicada mesmo assim?"
          : "Atenção: Já existe um lançamento registrado com exatamente os mesmos dados (Data, Valor, Categoria e Descrição). Deseja salvar este lançamento duplicado mesmo assim?";
        
        setBusy(false);
        setFormConfirmModal({
          isOpen: true,
          title: "Lançamento Duplicado",
          description: msg,
          confirmText: "Salvar Mesmo Assim",
          variant: "warning",
          onConfirm: async () => {
            setFormConfirmModal(null);
            await executeSave();
          },
        });
        return;
      }
    } catch (err: any) {
      console.warn("Erro ao checar duplicatas:", err.message || err);
    }

    await executeSave();
  }

  // Estilo padronizado para todos os campos (Rajdhani)
  const fontStyle = "font-display";

  return (
    <form
      onSubmit={submit}
      className={`rounded-3xl ${formPadding} flex flex-col transition-all duration-500 border-2 shadow-2xl ${fontStyle} ${
        type === "expense"
          ? "bg-red-500/10 border-red-500/40 shadow-[inset_0_0_80px_rgba(239,68,68,0.1)]"
          : "bg-cyan-500/10 border-cyan-500/40 shadow-[inset_0_0_80px_rgba(34,211,238,0.1)]"
      } backdrop-blur-xl ${formGap}`}
    >
      <div className="text-center mb-1">
        <h2
          className={`text-2xl font-black tracking-[0.2em] uppercase ${type === "expense" ? "text-red-400" : "text-accent"}`}
        >
          REGISTRO DE {type === "expense" ? "DESPESA" : "RECEITA"}
        </h2>
        <div
          className={`h-1 w-32 mx-auto mt-2 opacity-50 ${type === "expense" ? "bg-red-500" : "bg-accent"}`}
        />
      </div>

      <div className="relative flex items-center justify-between uppercase w-full px-4 mb-2">
        <div className="flex items-center gap-4 flex-1">
          <button
            type="button"
            onClick={() => onMonthShift?.(-1)}
            className="text-muted-foreground hover:text-white transition-all hover:scale-125 flex items-center gap-2 group"
          >
            <ChevronLeft className="h-5 w-5" />
            {defaultMonth !== undefined && (
              <span className="text-lg font-black tracking-widest opacity-30 group-hover:opacity-100 transition-opacity uppercase">
                {MONTHS_PT[(defaultMonth + 11) % 12]}
              </span>
            )}
          </button>
        </div>

        {defaultMonth !== undefined && (
          <span className="text-3xl font-black tracking-[0.3em] text-gradient whitespace-nowrap uppercase">
            {MONTHS_PT[defaultMonth]}
          </span>
        )}

        <div className="flex items-center justify-end gap-4 flex-1">
          <button
            type="button"
            onClick={() => onMonthShift?.(1)}
            className="text-muted-foreground hover:text-white transition-all hover:scale-125 flex items-center gap-2 group"
          >
            {defaultMonth !== undefined && (
              <span className="text-lg font-black tracking-widest opacity-30 group-hover:opacity-100 transition-opacity uppercase">
                {MONTHS_PT[(defaultMonth + 1) % 12]}
              </span>
            )}
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-2 ${gridGap}`}>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <CustomSelect
              label="Categoria"
              placeholder="SELECIONE..."
              value={selectedParentId}
              onChange={(val) => {
                setSelectedParentId(val);
                setSelectedSubId("");
              }}
              options={currentParents}
            />
          </div>
          <button
            type="button"
            onClick={() => handleQuickAdd()}
            className={`flex items-center justify-center w-14 ${inputHeight} rounded-2xl border-2 border-border/50 hover:border-accent/50 hover:bg-accent/10 transition-all text-accent group mb-0`}
            title="Nova Categoria"
          >
            <Plus className="h-6 w-6 group-hover:scale-125 transition-transform" />
          </button>
        </div>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <CustomSelect
              label="Subcategoria"
              placeholder="SELECIONE..."
              value={selectedSubId}
              onChange={(val) => setSelectedSubId(val)}
              options={currentSubs.map((s) => ({ id: s.id, name: s.name }))}
              disabled={!selectedParentId}
            />
          </div>
          {selectedParentId && (
            <button
              type="button"
              onClick={() => handleQuickAdd(selectedParentId)}
              className={`flex items-center justify-center w-14 ${inputHeight} rounded-2xl border-2 border-border/50 hover:border-accent/50 hover:bg-accent/10 transition-all text-accent group mb-0`}
              title="Nova Subcategoria"
            >
              <Plus className="h-6 w-6 group-hover:scale-125 transition-transform" />
            </button>
          )}
        </div>
      </div>

      {isDepreciacaoFrota && (
        <div className={`grid grid-cols-1 sm:grid-cols-3 ${gridGap} animate-in slide-in-from-top-4 duration-500 bg-white/[0.02] border border-white/5 p-4 rounded-2xl shadow-[inset_0_0_20px_rgba(255,255,255,0.01)]`}>
          <div className={spaceY}>
            <span className="block text-[11px] uppercase tracking-[0.2em] text-red-400 font-black ml-2">
              Quantidade de Carros
            </span>
            <input
              required
              type="number"
              min="1"
              value={quantityOfCars}
              onChange={(e) => setQuantityOfCars(e.target.value)}
              placeholder="1"
              className={`input-futuristic w-full ${inputHeight} rounded-2xl px-5 text-sm outline-none font-bold border-2 border-red-500/20`}
            />
          </div>
          <div className={spaceY}>
            <span className="block text-[11px] uppercase tracking-[0.2em] text-red-400 font-black ml-2">
              Valor do Carro Novo
            </span>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">
                R$
              </span>
              <input
                required
                inputMode="numeric"
                value={carValue}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  const formatted = (Number(val) / 100).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  });
                  setCarValue(formatted);
                }}
                placeholder="0,00"
                className={`input-futuristic w-full ${inputHeight} rounded-2xl pl-12 pr-5 text-sm outline-none font-bold border-2 border-red-500/20`}
              />
            </div>
          </div>
          <div className={spaceY}>
            <span className="block text-[11px] uppercase tracking-[0.2em] text-red-400 font-black ml-2">
              Prazo (Anos)
            </span>
            <input
              required
              type="number"
              min="1"
              value={depreciationTerm}
              onChange={(e) => setDepreciationTerm(e.target.value)}
              placeholder="5"
              className={`input-futuristic w-full ${inputHeight} rounded-2xl px-5 text-sm outline-none font-bold border-2 border-red-500/20`}
            />
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 sm:grid-cols-2 ${gridGap}`}>
        <CustomSelect
          label="Fluxo de Caixa"
          placeholder="SELECIONE O TIPO..."
          value={nature}
          onChange={(val) => setNature(val as any)}
          options={[
            { id: "variable", name: "VARIÁVEL (EVENTUAL)" },
            { id: "fixed", name: "FIXO (RECORRENTE)" },
          ]}
          disabled={(() => {
            const cat = dbCategories.find(c => c.id === selectedParentId);
            if (!cat) return false;
            const name = cat.name.toUpperCase();
            return (
              name === "ANTECIPAÇÃO DE NOTAS" ||
              name === "LOCAÇÃO" ||
              name === "VENDAS" ||
              name === "EQUIPE" ||
              name === "MANUTENÇÃO" ||
              name === "AGNALDO" ||
              name === "INFRAESTRUTURA" ||
              name === "FROTA" ||
              name === "FORNECEDORES" ||
              name === "PRESTADORES" ||
              name === "APORTE" ||
              name === "EMPRÉSTIMO"
            );
          })()}
        />
        {isAntecipacao ? (
          <div className={`${spaceY} animate-in slide-in-from-right-4 duration-500`}>
            <span className="block text-[11px] uppercase tracking-[0.3em] text-muted-foreground font-black ml-2">
              Número da Nota Fiscal
            </span>
            <input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value.toUpperCase())}
              placeholder="DIGITE O NÚMERO DA NF..."
              className={`input-futuristic w-full ${inputHeight} rounded-2xl px-5 text-sm outline-none uppercase font-bold tracking-wide border-2`}
            />
          </div>
        ) : (
          <div className={spaceY}>
            <span className="block text-[11px] uppercase tracking-[0.3em] text-muted-foreground font-black ml-2">
              Valor do Lançamento
            </span>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">
                R$
              </span>
              <input
                required
                inputMode="numeric"
                value={amount}
                onChange={(e) => {
                  if (isDepreciacaoFrota) return;
                  const val = e.target.value.replace(/\D/g, "");
                  const centered = (Number(val) / 100).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  });
                  setAmount(centered);
                }}
                placeholder="0,00"
                readOnly={isDepreciacaoFrota}
                className={`input-futuristic w-full ${inputHeight} rounded-2xl pl-12 pr-5 text-2xl outline-none font-black tracking-tighter border-2 transition-all ${
                  isDepreciacaoFrota
                    ? "border-red-500/50 bg-red-500/5 cursor-not-allowed shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                    : ""
                }`}
                style={{ color: type === "expense" ? "oklch(0.7 0.2 30)" : "oklch(0.78 0.16 150)" }}
              />
            </div>
          </div>
        )}
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-2 ${gridGap}`}>
        <div className={spaceY}>
          <span className="block text-[11px] uppercase tracking-[0.3em] text-muted-foreground font-black ml-2">
            {isAntecipacao ? "Data de Abertura" : isPeriodic ? "Período de Ocorrência" : "Data da Ocorrência"}
          </span>
          {isPeriodic ? (
            <div className="flex items-center gap-2">
              <input
                required
                type="date"
                value={date}
                onChange={(e) => {
                  const newDate = e.target.value;
                  setDate(newDate);
                  if (newDate && onMonthYearChange) {
                    const d = new Date(newDate + "T00:00:00");
                    if (!isNaN(d.getTime())) {
                      onMonthYearChange(d.getMonth(), d.getFullYear());
                    }
                  }
                }}
                className={`input-futuristic w-full ${inputHeight} rounded-2xl px-3 text-[11px] sm:text-sm outline-none font-bold border-2`}
              />
              <span className="text-muted-foreground text-[9px] uppercase font-black">Até</span>
              <input
                required
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={`input-futuristic w-full ${inputHeight} rounded-2xl px-3 text-[11px] sm:text-sm outline-none font-bold border-2`}
              />
            </div>
          ) : (
            <input
              required
              type="date"
              value={date}
              onChange={(e) => {
                const newDate = e.target.value;
                setDate(newDate);
                if (newDate && onMonthYearChange) {
                  const d = new Date(newDate + "T00:00:00");
                  if (!isNaN(d.getTime())) {
                    onMonthYearChange(d.getMonth(), d.getFullYear());
                  }
                }
              }}
              className={`input-futuristic w-full ${inputHeight} rounded-2xl px-5 text-sm outline-none font-bold border-2`}
            />
          )}
        </div>
        {isAntecipacao ? (
          <div className={`${spaceY} animate-in slide-in-from-right-4 duration-500`}>
            <span className="block text-[11px] uppercase tracking-[0.3em] text-muted-foreground font-black ml-2">
              Data de Vencimento
            </span>
            <input
              required
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={`input-futuristic w-full ${inputHeight} rounded-2xl px-5 text-sm outline-none font-bold border-2 border-accent/30`}
            />
          </div>
        ) : (
          <div className={spaceY}>
            <span className="block text-[11px] uppercase tracking-[0.3em] text-muted-foreground font-black ml-2">
              {isManutencaoOrLocacaoIncome ? "Número da Nota Fiscal" : "Descrição"}
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value.toUpperCase())}
              placeholder={isManutencaoOrLocacaoIncome ? "DIGITE O NÚMERO DA NF..." : "DIGITE INFORMAÇÕES ADICIONAIS..."}
              className={`input-futuristic w-full ${inputHeight} rounded-2xl px-5 text-sm outline-none uppercase font-bold tracking-wide border-2`}
            />
          </div>
        )}
      </div>

      {/* Já incluído no grid acima */}

      {isAntecipacao && (
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${gridGap} animate-in slide-in-from-top-4 duration-500`}>
          <div className={spaceY}>
            <span className="block text-[11px] uppercase tracking-[0.3em] text-accent font-black ml-2">
              Valor Líquido
            </span>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-accent font-bold text-sm">
                R$
              </span>
              <input
                required
                inputMode="numeric"
                value={amount}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  const centered = (Number(val) / 100).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  });
                  setAmount(centered);
                }}
                placeholder="0,00"
                className={`input-futuristic w-full ${inputHeight} rounded-2xl pl-12 pr-5 text-2xl outline-none font-black tracking-tighter border-2 border-accent/50 shadow-[0_0_15px_rgba(34,211,238,0.2)]`}
                style={{ color: "oklch(0.78 0.16 150)" }}
              />
            </div>
          </div>
          <div className={spaceY}>
            <span className="block text-[11px] uppercase tracking-[0.3em] text-red-500 font-black ml-2">
              Custo Antecipação
            </span>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-red-500 font-bold text-sm">
                R$
              </span>
              <input
                required
                inputMode="numeric"
                value={operationCost}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  const centered = (Number(val) / 100).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  });
                  setOperationCost(centered);
                }}
                placeholder="0,00"
                className={`input-futuristic w-full ${inputHeight} rounded-2xl pl-12 pr-5 text-2xl outline-none font-black tracking-tighter border-2 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]`}
                style={{ color: "rgb(239, 68, 68)" }}
              />
            </div>
          </div>
        </div>
      )}

      {formError && (
        <div className="p-3.5 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] sm:text-xs rounded-xl font-black uppercase tracking-wider text-center animate-in fade-in slide-in-from-top-2 duration-300">
          ⚠️ {formError}
        </div>
      )}

      <button
        disabled={
          busy ||
          (isAntecipacao && (!amount || !operationCost || !description.trim() || !date || !dueDate))
        }
        type="submit"
        className={`w-full rounded-2xl text-sm font-black uppercase tracking-[0.4em] transition-all duration-500 disabled:opacity-50 border-2 hover:scale-[1.02] active:scale-[0.98] ${btnPadding} ${
          isAntecipacao
            ? "bg-gradient-to-r from-accent to-red-500 border-white/20 text-white shadow-[0_0_30px_rgba(34,211,238,0.3)]"
            : type === "expense"
              ? "bg-red-500/20 border-red-500/60 text-red-400 hover:bg-red-500/40 shadow-[0_0_30px_rgba(239,68,68,0.3)]"
              : "bg-accent/20 border-accent/70 text-accent hover:bg-accent/40 shadow-[0_0_30px_rgba(34,211,238,0.3)]"
        }`}
      >
        {busy ? "Processando..." : (isAntecipacao ? "REGISTRAR RECEITA E DESPESA" : `REGISTRAR ${type === "expense" ? "DESPESA" : "RECEITA"}`)}
      </button>

      {formConfirmModal && (
        <ConfirmModal
          isOpen={formConfirmModal.isOpen}
          onClose={() => setFormConfirmModal(null)}
          onConfirm={formConfirmModal.onConfirm}
          onConfirmWithInput={formConfirmModal.onConfirmWithInput}
          title={formConfirmModal.title}
          description={formConfirmModal.description}
          confirmText={formConfirmModal.confirmText}
          variant={formConfirmModal.variant || "info"}
          isInputPrompt={formConfirmModal.isInputPrompt}
          inputLabel={formConfirmModal.inputLabel}
          inputPlaceholder={formConfirmModal.inputPlaceholder}
        />
      )}
    </form>
  );
}
