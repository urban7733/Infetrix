import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Infetrix - MAX Inference Optimization",
  description: "Generate MAX deployment plans for optimized model serving and keep the inference API simple.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
