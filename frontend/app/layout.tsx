import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Infetrix — workload intelligence",
  description: "Open workload dashboard for cheaper, faster inference planning with MAX-aware optimization.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
