'use client';

export default function SupportPage() {

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <div className="container flex flex-col items-center justify-center gap-12 px-4 py-4">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
          <span className="text-[hsl(280,100%,70%)]">Support</span> Center
        </h1>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-8 w-full max-w-4xl">
          <div className="flex flex-col gap-4 rounded-xl bg-white/10 p-4 hover:bg-white/20">
            <h2 className="text-2xl font-bold">Contact Information</h2>
            <div className="text-lg space-y-2">
              <p><strong>Email:</strong> peasy-support@moseiki.app</p>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-xl bg-white/10 p-4 hover:bg-white/20">
            <h2 className="text-2xl font-bold">Support Channels</h2>
            <div className="text-lg">
              <ul className="list-disc pl-5 space-y-2 text-gray-300">
                {/* <li>Live Chat Support</li> */}
                <li>Email Support</li>
                {/* <li>Phone Support</li> */}
                {/* <li>Community Forums</li> */}
              </ul>
            </div>
          </div>
        </div>


        <div className="w-full max-w-4xl mt-8 text-center">
          <div className="rounded-xl bg-white/10 p-4 hover:bg-white/20">
            <p className="text-gray-300">
              For urgent issues, please{' '}
              <a href="mailto:peasy-support@moseiki.app" className="text-[hsl(280,100%,70%)] hover:underline">
                email our support team
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 