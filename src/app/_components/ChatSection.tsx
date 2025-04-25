"use client";

import { useState, useRef, useEffect } from "react";
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

  // Flatten messages from all pages
  const messages = data?.pages.flatMap((page) => page.messages) || [];

  // Mutation to send a message
  const sendMessageMutation = api.chat.sendMessage.useMutation({
    onSuccess: () => {
      setMessage("");
      void refetch();
    },
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
              <div className="text-white">{msg.chatContent}</div>
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
    </div>
  );
} 