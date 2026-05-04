export type Setter = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
export type Getter = () => any;
