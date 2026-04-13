export interface ApiErrorResponse {
  ok?: boolean;
  error_code?: string;
  message?: string;
  detail?: unknown;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface AuthResponse extends AuthTokens {
  user: import("./user").User | null;
}

export interface WalletBalance {
  amount_cents?: number;
  points?: number;
}

export interface WalletResponse {
  ok?: boolean;
  balance_amount_cents?: number;
  balance_points?: number;
  wallet?: WalletBalance;
}

export interface RedeemCodeRequest {
  code: string;
}

export interface RedeemCodeResponse {
  ok?: boolean;
  redeemed_amount_cents?: number;
  redeemed_points?: number;
  message?: string;
}
export type {
  ApiErrorResponse,
  AuthTokens,
  AuthResponse,
  RedeemCodeRequest,
  RedeemCodeResponse,
  WalletBalance,
  WalletResponse,
} from "../shared/api/types";

