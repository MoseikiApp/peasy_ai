"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteFooter() {
  const pathname = usePathname();

  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#2e026d] text-white py-4">
      <div className="container mx-auto flex justify-between items-center px-4">
        <div className="text-sm text-gray-300">
          © {currentYear} Peasy AI Agent for Web3. All rights reserved.
        </div>
        
        <nav className="flex space-x-4">
          <Link
            href="/docs/support"
            className={`
              px-3 py-2 rounded-lg transition 
              ${pathname === "/docs/support" 
                ? "bg-white/20" 
                : "hover:bg-white/10"}
            `}
          >
            Contact Support
          </Link>
        </nav>
      </div>
    </footer>
  );
} 