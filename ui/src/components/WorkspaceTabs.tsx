import { navItems } from "@/lib/constants";
import type { Screen } from "@/types";

type WorkspaceTabsProps = {
  screen: Screen;
  setScreen: (screen: Screen) => void;
};

const groupLabels = {
  primary: "Работа",
  legacy: "Legacy",
  system: "Система",
} as const;

export function WorkspaceTabs({ screen, setScreen }: WorkspaceTabsProps) {
  return (
    <nav
      aria-label="Разделы workspace"
      className="flex w-full gap-2 overflow-x-auto rounded-lg border border-border bg-muted/70 p-1"
    >
      {navItems.map((item) => {
        const isActive = screen === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setScreen(item.id)}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isActive
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
            }`}
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                isActive ? "border-primary/20 text-primary" : "border-border text-muted-foreground"
              }`}
            >
              {groupLabels[item.group]}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
