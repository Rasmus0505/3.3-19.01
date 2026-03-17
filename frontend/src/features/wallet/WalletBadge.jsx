import { formatMoneyCents } from "../../shared/lib/money";
import { Badge } from "../../shared/ui";

export function WalletBadge({ accessToken, balanceAmountCents, balancePoints }) {
  if (!accessToken) return null;
  return <Badge variant="outline">余额 {formatMoneyCents(balanceAmountCents ?? balancePoints ?? 0)}</Badge>;
}
