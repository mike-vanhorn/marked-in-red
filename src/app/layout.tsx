import type { Metadata, Viewport } from "next";
import { Manrope, Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Marked in Red — MMIWG2S Awareness Map",
  description:
    "An interactive awareness map for understanding Missing and Murdered Indigenous Women, Girls, and Two-Spirit (MMIWG2S) cases across the United States and Canada, honoring those we have lost and those still missing.",
};

export const viewport: Viewport = {
  themeColor: "#f8f9fa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${inter.variable} h-full`}
    >
      <body className="bg-surface text-on-surface font-body antialiased min-h-full flex flex-col">
        <Navbar />
        <main className="pt-20 flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
