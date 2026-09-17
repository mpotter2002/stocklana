import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export function PortfolioSummary({
  headline,
  hint,
  custody,
  walletFunding,
  openBaskets,
  quotesLoading,
}: {
  headline: string;
  hint: string;
  custody: string;
  walletFunding: string;
  openBaskets: string;
  quotesLoading: boolean;
}) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Valuation
        </p>
        {quotesLoading && headline === "Checking" ? (
          <Skeleton className="h-12 w-56" />
        ) : (
          <p className="font-heading text-5xl leading-none tracking-tight md:text-6xl">
            {headline}
          </p>
        )}
        {hint ? (
          <p className="max-w-xl text-sm text-muted-foreground">{hint}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Pyth quotes are display-only. Missing feeds stay not priced.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
        <SummaryStat label="Basket custody" value={custody} />
        <Separator className="hidden sm:block" orientation="vertical" />
        <Separator className="sm:hidden" />
        <SummaryStat label="Wallet USDCt" value={walletFunding} />
        <Separator className="hidden sm:block" orientation="vertical" />
        <Separator className="sm:hidden" />
        {openBaskets === "1" ? (
          <SummaryStat badge="On chain" label="Open baskets" value={openBaskets} />
        ) : (
          <SummaryStat label="Open baskets" value={openBaskets} />
        )}
      </div>
    </section>
  );
}

function SummaryStat({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="font-mono text-lg font-medium tabular-nums">{value}</p>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </div>
    </div>
  );
}
