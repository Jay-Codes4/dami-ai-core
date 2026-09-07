import { Link } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { DISCLAIMER } from "@/services/documents/documents";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/ask", label: "Ask Dami" },
  { to: "/research", label: "Saved research" },
  { to: "/sources", label: "Sources" },
  { to: "/documents", label: "Documents" },
  { to: "/settings", label: "Settings" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { toggle } = useTheme();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Dami<span className="text-primary"> AI</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {NAV.slice(1).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&.active]:bg-accent [&.active]:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            onClick={toggle}
            aria-label="Switch between light and dark mode"
          >
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="hidden h-4 w-4 dark:block" />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{children}</main>

      <footer className="border-t border-border/60 py-6">
        <p className="mx-auto max-w-3xl px-4 text-center text-xs leading-relaxed text-muted-foreground">
          {DISCLAIMER}
        </p>
      </footer>
    </div>
  );
}
