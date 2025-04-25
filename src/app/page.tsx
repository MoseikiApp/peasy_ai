import Link from "next/link";
import { auth } from "~/server/auth";
import { ChatSection } from "./_components/ChatSection";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
          Peasy AI <span className="text-[hsl(280,100%,70%)]">Agent</span> for Web3
        </h1>

        {/* Chat Section - Only show if user is logged in */}
        {session?.user && (
          <ChatSection />
        )}
        
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-8">
          <Link
            className="flex max-w-xs flex-col gap-4 rounded-xl bg-white/10 p-4 hover:bg-white/20"
            href="/profile"
          >
            <h3 className="text-2xl font-bold">First Steps →</h3>
            <div className="text-lg">
              Send, Convert, and Buy Crypto- Sign in to get started!
            </div>
          </Link>
        </div>

        {/* <div className="flex flex-col items-center gap-2">
          {session ? (
            <div className="flex flex-col items-center gap-4">
              <p className="text-xl">
                {session.user?.name}
              </p>
              <form 
                action={async () => {
                  "use server";
                  await signOut({ redirect: true, redirectTo: "/" });
                }}
              >
                <button 
                  type="submit"
                  className="rounded-full bg-white/10 px-10 py-3 font-semibold no-underline transition hover:bg-white/20"
                >
                  Sign Out
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/api/auth/signin"
              className="rounded-full bg-white/10 px-10 py-3 font-semibold no-underline transition hover:bg-white/20"
            >
              Sign in
            </Link>
          )}
        </div> */}
      </div>
    </div>
  );
}
