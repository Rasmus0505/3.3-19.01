import { Badge } from "../../shared/ui";

export function WalletBadge({ accessToken, balancePoints }) {
  if (!accessToken) return null;
  return <Badge variant="outline">余额 {balancePoints} 点</Badge>;
}
