import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Props = {
  accounts: string[];
  walletName?: string | null;
  isSubmitting?: boolean;
  currentAddress?: string | null;
  onSelect: (account: string) => void;
  onCancel: () => void;
};

function shorten(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletAccountPicker({
  accounts,
  walletName,
  isSubmitting,
  currentAddress,
  onSelect,
  onCancel,
}: Props) {
  const current = currentAddress?.toLowerCase() ?? null;
  return (
    <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
      <div>
        <p className="text-sm font-medium text-foreground">Choose an account</p>
        <p className="text-xs text-muted-foreground mt-1">
          {walletName ? `${walletName} shared ` : ""}
          {accounts.length} address{accounts.length === 1 ? "" : "es"}. Pick the main wallet that has Pro — Hyperliquid sub-accounts are separate 0x keys.
        </p>
        {accounts.length <= 1 ? (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
            Your wallet only exposed one address. In Rabby or MetaMask, switch to your main account, approve the permission popup, then tap Switch account again.
          </p>
        ) : null}
      </div>
      <div className="space-y-2 max-h-[40vh] overflow-y-auto">
        {accounts.map((acc) => {
          const isCurrent = current === acc.toLowerCase();
          return (
            <Button
              key={acc}
              type="button"
              variant={isCurrent ? "secondary" : "outline"}
              className="w-full justify-between h-12 font-mono text-sm"
              disabled={isSubmitting}
              onClick={() => onSelect(acc)}
              data-testid={`button-pick-account-${acc.slice(2, 8)}`}
            >
              <span>{shorten(acc)}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-sans">
                {isCurrent ? "Current" : isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use"}
              </span>
            </Button>
          );
        })}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="w-full text-muted-foreground"
        disabled={isSubmitting}
        onClick={onCancel}
      >
        {current ? "Keep current account" : "Back to wallet list"}
      </Button>
    </div>
  );
}
