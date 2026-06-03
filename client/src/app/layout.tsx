import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CobaltQuant — Real-Time Financial Intelligence Terminal",
  description:
    "Live market data, multi-agent AI analysis, sentiment heatmap, and explainable ML signals. Powered by WebSockets, LangGraph, and XGBoost.",
  keywords: [
    "stock market",
    "real-time trading",
    "AI financial analysis",
    "sentiment analysis",
    "SHAP explainability",
    "algorithmic trading",
  ],
  openGraph: {
    title: "CobaltQuant",
    description: "Real-time financial intelligence terminal",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
