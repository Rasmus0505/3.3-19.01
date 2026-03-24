import { formatMoneyCents } from "../../../shared/lib/money";
import { Badge } from "../../../shared/ui";

/** @typedef {import("../types").WalletResponse} WalletResponse */

export function WalletBadge({ accessToken, balanceAmountCents, balancePoints, isOnline = true }) {
  if (!accessToken) return null;

  if (!isOnline) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        离线模式，余额待同步
      </Badge>
    );
  }

  return <Badge variant="outline">余额 {formatMoneyCents(balanceAmountCents ?? balancePoints ?? 0)}</Badge>;
}
