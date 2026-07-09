import { 
  Sparkles
} from "lucide-react";
import { ClientProductNavigator } from "@/components/ClientProductNavigator";
import { navItems } from "@/lib/constants";
import { Client, Screen } from "@/types";

interface SidebarProps {
  selectedClientId: string;
  setSelectedClientId: (id: string) => void;
  selectedClient: Client | null;
  selectedProjectId: number | null;
  setSelectedProjectId: (id: number | null) => void;
  selectedProductId: number | null;
  setSelectedProductId: (id: number | null) => void;
  clients: Client[];
  isLoadingClients: boolean;
  screen: Screen;
  setScreen: (screen: Screen) => void;
}

export function Sidebar({
  selectedClientId,
  setSelectedClientId,
  selectedClient,
  selectedProjectId,
  setSelectedProjectId,
  selectedProductId,
  setSelectedProductId,
  clients,
  isLoadingClients,
  screen,
  setScreen
}: SidebarProps) {
  const primaryItems = navItems.filter((item) => item.group === "primary");
  const legacyItems = navItems.filter((item) => item.group === "legacy");
  const systemItems = navItems.filter((item) => item.group === "system");
  const mobileItems = [primaryItems[0], primaryItems[1], legacyItems[0], systemItems[0]].filter(Boolean);

  return (
    <>
      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-72 flex-col border-r border-border bg-sidebar p-4 xl:flex">
        <div className="mb-8 px-2 py-4">
          <div className="flex items-center gap-3">
            <div className="primary-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-lg">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black leading-none text-foreground uppercase tracking-tight">Omni Reels</h1>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                Client production OS
              </p>
            </div>
          </div>
        </div>

        <div className="mb-5">
          <ClientProductNavigator
            clients={clients}
            selectedClient={selectedClient}
            selectedClientId={selectedClientId}
            selectedProjectId={selectedProjectId}
            selectedProductId={selectedProductId}
            isLoadingClients={isLoadingClients}
            onSelectClientId={setSelectedClientId}
            onSelectProjectId={setSelectedProjectId}
            onSelectProductId={setSelectedProductId}
            onOpenOmni={() => setScreen("omni")}
          />
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto pb-4">
          <NavGroup title="Рабочий контур" items={primaryItems} screen={screen} setScreen={setScreen} />
          <NavGroup title="Старый контур" items={legacyItems} screen={screen} setScreen={setScreen} />
          <NavGroup title="Система" items={systemItems} screen={screen} setScreen={setScreen} />
        </nav>
      </aside>

      <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-4 gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg backdrop-blur xl:hidden">
        {mobileItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setScreen(item.id)}
            title={item.label}
            aria-label={item.label}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              screen === item.id || (item.group === "legacy" && legacyItems.some((legacy) => legacy.id === screen))
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <item.icon className="h-4 w-4" />
            <span className="max-w-full truncate text-[10px] font-semibold">{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}

function NavGroup({
  title,
  items,
  screen,
  setScreen,
}: {
  title: string;
  items: typeof navItems;
  screen: Screen;
  setScreen: (screen: Screen) => void;
}) {
  if (!items.length) return null;

  return (
    <div className="space-y-1">
      <p className="px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
      <div className="space-y-1">
        {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setScreen(item.id)}
            className={`w-full rounded-lg px-3 py-2.5 text-left transition-[background-color,color,transform] duration-150 hover:translate-x-0.5 ${
                screen === item.id
                  ? "bg-white font-bold text-primary shadow-sm"
                : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className="h-5 w-5" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">{item.label}</span>
              </div>
            </button>
          ))}
      </div>
    </div>
  );
}
