import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Infetrix",
  description: "BYOK Inference Router and Optimizer UI",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
