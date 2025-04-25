import "~/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";
import { SessionProvider } from "next-auth/react";

import { TRPCReactProvider } from "~/trpc/react";
import { SiteHeader } from "~/components/SiteHeader";
import { SiteFooter } from "~/components/SiteFooter";
import ContextProvider from '../context/index'
import { headers } from 'next/headers'

export const metadata: Metadata = {
  title: "Peasy AI Agent for Web3",
  description: "Get assistance from AI agent for Web3",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookies = (await headers()).get('cookie')

  return (
    <html lang="en" className={`${GeistSans.variable}`}>
      <body className="flex flex-col min-h-screen">
        <TRPCReactProvider>
          <SessionProvider>
            <div className="flex flex-col min-h-screen">
              <SiteHeader />
              <ContextProvider cookies={cookies}>
                <main className="flex-grow">{children}</main>
              </ContextProvider>
              <SiteFooter />
            </div>
          </SessionProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
