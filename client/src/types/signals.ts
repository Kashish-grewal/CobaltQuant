/** Shared types for ML signal data — used by both SidebarMLSignals and MLSignalsPanel */

export interface ShapEntry {
  feature: string;
  value:   number;
  shap:    number;
}

export interface SignalData {
  ticker:         string;
  signal:         "BUY" | "SELL" | "HOLD";
  confidence:     number;
  probabilities:  Record<string, number>;
  shap_values:    ShapEntry[];
  feature_values: Record<string, number>;
  model_accuracy: number;
  error?:         string;
}

export type FetchStatus = "idle" | "loading" | "done" | "error";
