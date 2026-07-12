import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Omni Reels | Client Production OS",
  description: "Брендовая консоль для продуктов, сценариев и Omni/KIE reel production.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">
        <QueryProvider>
          {children}
          <Toaster position="top-right" expand={false} richColors />
        </QueryProvider>
      </body>
    </html>
  );
}
