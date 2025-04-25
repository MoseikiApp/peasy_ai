import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Peasy AI Agent for Web3 Documentation',
  description: 'Learn how to configure and use AI Agent for Web3'
};

export default function AIAgentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
} 