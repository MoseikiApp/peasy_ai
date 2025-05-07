"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { api } from "~/trpc/react";
import { format, isToday } from "date-fns";

type Message = {
  id: string;
  chatContent: string;
  actor: string;
  date: Date;
};

export function ChatSection() {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [tradeStatus, setTradeStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [tradeResult, setTradeResult] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Query to fetch messages
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = 
    api.chat.getMessages.useInfiniteQuery(
      {
        limit: 100,
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        refetchOnWindowFocus: false,
      }
    );

  // Memoize the flattened messages array
  const messages = useMemo(() => 
    data?.pages.flatMap((page) => page.messages) || [],
    [data?.pages]
  );

  // Mutation to send a message
  const sendMessageMutation = api.chat.sendMessage.useMutation({
    onSuccess: () => {
      setMessage("");
      void refetch();
    },
  });

  // Mutation to test trade
  const testTradeMutation = api.chat.testTrade.useMutation({
    onSuccess: (data) => {
      setTradeStatus("success");
      setTradeResult(data);
    },
    onError: (error) => {
      setTradeStatus("error");
      setTradeResult({ error: error.message });
    }
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }

    messagesEndRef.current?.scrollIntoView({ 
      behavior: "smooth", 
      block: "nearest" 
    });
  }, [messages]);

  // Handle sending a message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsLoading(true);
    try {
      await sendMessageMutation.mutateAsync({ content: message });
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load more messages when scrolling to top
  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    
    const { scrollTop } = chatContainerRef.current;
    if (scrollTop === 0 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  };

  // Handle test trade button click
  const handleTestTrade = async () => {
    setTradeStatus("loading");
    try {
      await testTradeMutation.mutateAsync();
    } catch (error) {
      console.error("Test trade failed:", error);
      setTradeStatus("error");
    }
  };

  return (
    <div className="w-full max-w-4xl bg-white/10 rounded-xl overflow-hidden">
      <div className="p-4 bg-[#2e026d] border-b border-white/20">
        <h2 className="text-xl font-bold text-white">Chat with Peasy AI Agent</h2>
      </div>
      
      {/* Chat messages container */}
      <div 
        ref={chatContainerRef}
        className="h-[400px] overflow-y-auto p-4 space-y-4"
        onScroll={handleScroll}
      >
        {messages.length === 0 ? (
          <div className="text-center text-white/70 py-8">
            No messages yet. Start a conversation!
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex flex-col max-w-[80%] ${
                msg.actor === "You" 
                  ? "ml-auto bg-[#4a3b8b] rounded-tl-xl rounded-bl-xl rounded-tr-xl" 
                  : "mr-auto bg-[#2e026d] rounded-tr-xl rounded-br-xl rounded-tl-xl"
              } p-3 shadow-md`}
            >
              <div className="text-white whitespace-pre-wrap">{msg.chatContent}</div>
              <div className="text-xs text-white/70 mt-1 self-end">
                {isToday(new Date(msg.date)) 
                  ? format(new Date(msg.date), "HH:mm")
                  : format(new Date(msg.date), "yyyy-MM-dd HH:mm")}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Message input */}
      <form 
        onSubmit={handleSendMessage}
        className="p-4 border-t border-white/20 flex gap-2"
      >
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-grow rounded-full px-4 py-2 bg-white/20 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[hsl(280,100%,70%)]"
          disabled={isLoading}
        />
        <button
          type="submit"
          className="rounded-full bg-[hsl(280,100%,70%)] p-2 text-white disabled:opacity-50"
          disabled={isLoading || !message.trim()}
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-6 w-6" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" 
            />
          </svg>
        </button>
      </form>
      
      {/* Test Trade Button */}
      <div className="p-4 border-t border-white/20 flex justify-center">
        <button
          onClick={handleTestTrade}
          className="rounded-full bg-[hsl(280,100%,70%)] px-4 py-2 text-white disabled:opacity-50 hover:bg-[hsl(280,100%,60%)]"
          disabled={tradeStatus === "loading"}
        >
          {tradeStatus === "loading" ? "Processing..." : "Test Trade (Buy 0.0001 BTC with USDC)"}
        </button>
      </div>
      
      {/* Trade Result Display */}
      {(tradeStatus === "success" || tradeStatus === "error") && (
        <div className={`p-4 ${tradeStatus === "success" ? "bg-green-900/50" : "bg-red-900/50"} border-t border-white/20`}>
          <h3 className="font-bold mb-2">
            {tradeStatus === "success" && tradeResult.success ? "Trade Successful" : "Trade Failed"}
          </h3>
          <div className="text-sm overflow-auto max-h-[200px] bg-black/30 p-4 rounded whitespace-pre-line">
            {tradeResult.isSuccess ? (
              <>
                <div className="text-green-400 font-semibold mb-2">Transaction completed successfully</div>
                <div>
                  {Object.entries(tradeResult).map(([key, value]) => (
                    <div key={key} className="mb-2">
                      <span className="font-medium text-gray-300">{key}: </span>
                      {typeof value === 'object' ? (
                        <pre className="ml-4 text-xs overflow-x-auto mt-1 bg-black/20 p-2 rounded">
                          {JSON.stringify(value, null, 2)}
                        </pre>
                      ) : (
                        <span>{String(value)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="text-red-400 font-semibold mb-2">Transaction failed</div>
                <div className="mb-2">{tradeResult.error?.split('\n\n')[0]}</div>
                {tradeResult.error?.includes('Raw Call Arguments:') && (
                  <>
                    <div className="font-medium text-gray-300 mt-3 mb-1">Transaction Details:</div>
                    {tradeResult.error
                      .split('Raw Call Arguments:')[1]
                      .split('\n')
                      .filter((line: string) => line.trim())
                      .map((line: string, i: number) => (
                        <div key={i} className="ml-2 mb-1">{line.trim()}</div>
                      ))}
                  </>
                )}
                {tradeResult.error?.includes('Details:') && (
                  <div className="mt-3">
                    <span className="font-medium text-gray-300">Error: </span>
                    <span className="text-red-300">
                      {tradeResult.error.split('Details:')[1].split('\n')[0].trim()}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 