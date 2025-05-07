"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { SignInModal } from "./SignInModal";
import ConnectButton from "./ConnectButton";
import { api } from "~/trpc/react";
import { formatCurrency } from "~/utils/formatCurrency";

export function SiteHeader() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [showSignInModal, setShowSignInModal] = useState(false);

  // Handle refresh token error
  useEffect(() => {
    // Check for auth errors in a NextAuth v5 compatible way
    if (status === 'unauthenticated' && session && 'error' in session) {
      if ((session as any).error === "RefreshTokenError") {
        console.log("RefreshTokenError");
        // Automatically open sign-in modal on refresh token error
        setShowSignInModal(true);
      }
    }
  }, [session, status]);

  // Fetch user's credit balance with automatic refetching
  const { data: currentBalance } = api.userCredit.getCurrentBalance.useQuery(
    undefined, 
    { 
      enabled: !!session,
      refetchInterval: 60000, // Refetch every 60 seconds
      refetchOnWindowFocus: true, // Refetch when window regains focus
      select: (data) => data.totalCredits
    }
  );

  const navItems = [
    { href: "/", label: "Home" },
    // { href: "/configurations", label: "Configurations" },
  ];

  return (
    <>
      <header className="bg-[#2e026d] text-white py-4">
        <div className="container mx-auto flex justify-between items-center px-4">
          <nav className="flex space-x-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  px-3 py-2 rounded-lg transition 
                  ${pathname === item.href 
                    ? "bg-white/20" 
                    : "hover:bg-white/10"}
                `}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          
          <div className="flex items-center space-x-4">
            {session ? (
              <div className="flex items-center space-x-4">
                <Link
                  href="/profile"
                  className={`
                    px-3 py-2 rounded-lg transition 
                    ${pathname === "/profile" 
                      ? "bg-white/20" 
                      : "hover:bg-white/10"}
                  `}
                >
                  {session.user?.name}
                </Link>
                <div className="text-sm text-[hsl(280,100%,70%)]">
                  {formatCurrency(currentBalance)}
                </div>
                <button 
                  onClick={() => signOut({ redirect: true, callbackUrl: "/" })}
                  className={`
                    px-3 py-2 rounded-lg transition 
                    hover:bg-white/10
                  `}
                >
                  Sign Out
                </button>
                {/* { <ConnectButton /> } */}
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowSignInModal(true)}
                  className="px-3 py-2 rounded-lg transition hover:bg-white/10"
                >
                  Sign in
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {showSignInModal && (
        <SignInModal onClose={() => setShowSignInModal(false)} />
      )}
    </>
  );
} 