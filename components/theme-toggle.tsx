"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ThemePreference } from "@/lib/ui/theme-preference";
import { useTheme } from "./theme-provider";

export function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  const next = ThemePreference.cycle(choice);
  const Icon = choice === "light" ? Sun : choice === "dark" ? Moon : Monitor;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={`Theme: ${ThemePreference.label(choice)}. Click for ${ThemePreference.label(next)}`}
          onClick={() => setChoice(next)}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Theme: {ThemePreference.label(choice)}
      </TooltipContent>
    </Tooltip>
  );
}
