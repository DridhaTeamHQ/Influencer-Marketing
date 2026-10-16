import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { SiteNav } from "@/components/site-nav";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Influencer Links",
  description: "Generate app download links for influencers and track every click.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Toaster>
          <TooltipProvider>
            <SiteNav />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
          </TooltipProvider>
        </Toaster>
      </body>
    </html>
  );
}
