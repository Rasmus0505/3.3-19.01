import { Badge } from "../../shared/ui";

export function WalletBadge({ accessToken, balancePoints }) {
  if (!accessToken) return null;

  return (
    <Badge variant="outline" className="gap-1.5 border-white/75 bg-white/80 px-3 py-1 text-slate-700 shadow-[0_16px_40px_-34px_rgba(15,23,42,0.28)]">
      余额
      <span className="font-semibold text-slate-950">{balancePoints}</span>
      点
    </Badge>
  );
}
