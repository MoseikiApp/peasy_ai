'use client';

import { useState } from 'react';

export default function AIAgentDocPage() {
  const [isAgentConfigOpen, setIsAgentConfigOpen] = useState(false);

  const toggleAgentConfig = () => {
    setIsAgentConfigOpen(!isAgentConfigOpen);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
          AI <span className="text-[hsl(280,100%,70%)]">Agent for Web3</span> Documentation
        </h1>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-8 w-full max-w-4xl">
          <div className="flex flex-col gap-4 rounded-xl bg-white/10 p-4 hover:bg-white/20">
            <h2 className="text-2xl font-bold">What is Peasy AI Agent?</h2>
            <div className="text-lg">
              Peasy AI Agent is an assistant that can help you with your crypto needs.
            </div>
          </div>

        </div>

        <div className="w-full max-w-4xl mt-4">
          <div className="rounded-xl bg-white/10 hover:bg-white/20">
            <div 
              className="p-4 border-b border-white/20 cursor-pointer" 
              onClick={toggleAgentConfig}
            >
              <h2 className="text-2xl font-bold">AI Agent for Web3</h2>
            </div>
            {isAgentConfigOpen && (
              <div className="p-4">
                <div className="rounded-lg bg-white/5">
                  <div className="p-4">
                    <h3 className="text-xl font-semibold mb-2">Key Configuration Parameters</h3>
                    <ul className="list-disc pl-5 space-y-2 text-gray-300">
                      <li>
                        <strong>Topic Selection:</strong> Choose the primary subject 
                        for content generation
                      </li>
                      <li>
                        <strong>Tone and Style:</strong> Define the writing style 
                        (professional, casual, technical)
                      </li>
                      <li>
                        <strong>Posting Frequency:</strong> Set how often posts 
                        are generated
                      </li>
                      <li>
                        <strong>Target Platform:</strong> Specify where posts 
                        will be published
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-full max-w-4xl mt-8 text-center">
          <div className="rounded-xl bg-white/10 p-4 hover:bg-white/20">
            <p className="text-gray-300">
              Need help? Check our{' '}
              <a href="/docs/support" className="text-[hsl(280,100%,70%)] hover:underline">
                Support Center
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 