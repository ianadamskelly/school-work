import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Work Journal",
  description: "Monthly objectives, daily work and clear weekly reports.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
