import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IT Request Portal",
  description: "Business IT request intake, prioritization, and delivery boards",
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
