import { 
  Sparkles
} from "lucide-react";
import { ClientProductNavigator } from "@/components/ClientProductNavigator";
import { OmniProviderSwitch } from "@/components/OmniProviderSwitch";
import { WorkspaceTabs } from "@/components/WorkspaceTabs";
import type { OmniGenerationProvider } from "@/lib/omni/provider";
import type { Screen } from "@/types";

interface SidebarProps {
  setSelectedClientId: (id: string) => void;
  selectedProjectId: number | null;
  setSelectedProjectId: (id: number | null) => void;
  setSelectedProductId: (id: number | null) => void;
  onOpenClientWorkspace: () => void;
  screen: Screen;
  setScreen: (screen: Screen) => void;
  omniGenerationProvider: OmniGenerationProvider;
  onOmniGenerationProviderChange: (provider: OmniGenerationProvider) => void;
}

export function Sidebar({
  setSelectedClientId,
  selectedProjectId,
  setSelectedProjectId,
  setSelectedProductId,
  onOpenClientWorkspace,
  screen,
  setScreen,
  omniGenerationProvider,
  onOmniGenerationProviderChange
}: SidebarProps) {
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
            selectedProjectId={selectedProjectId}
            onClearLegacyClientSelection={() => setSelectedClientId("")}
            onSelectProjectId={setSelectedProjectId}
            onSelectProductId={setSelectedProductId}
            onOpenClientWorkspace={onOpenClientWorkspace}
          />
        </div>

        <OmniProviderSwitch
          provider={omniGenerationProvider}
          onProviderChange={onOmniGenerationProviderChange}
        />

        <div className="mt-5">
          <WorkspaceTabs
            screen={screen}
            setScreen={setScreen}
            className="flex-col items-stretch overflow-visible bg-transparent p-0"
          />
        </div>
      </aside>
    </>
  );
}
