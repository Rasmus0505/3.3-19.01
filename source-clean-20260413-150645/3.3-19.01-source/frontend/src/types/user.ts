export interface User {
  id: number;
  email: string;
  is_admin?: boolean;
}
export type { User } from "../shared/api/types";

