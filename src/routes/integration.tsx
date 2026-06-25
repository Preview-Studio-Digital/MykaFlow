import { createFileRoute } from "@tanstack/react-router";
import { IntegrationManager } from "@/components/IntegrationManager";
import { Link2 } from "lucide-react";

export const Route = createFileRoute("/integration")({
  component: IntegrationPage,
});

function IntegrationPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white p-4 sm:p-8 font-display">
      <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-gradient uppercase flex items-center gap-4">
              <Link2 className="h-10 w-10 text-accent" /> Integração Factoring
            </h1>
            <p className="text-muted-foreground text-sm uppercase tracking-[0.2em] font-bold">
              Sincronize operações e custos do MykaCash
            </p>
          </div>
        </div>

        <IntegrationManager />
      </div>
    </div>
  );
}

