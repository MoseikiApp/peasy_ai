import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import { api } from "~/trpc/server";
import { formatCurrency } from "~/utils/formatCurrency";
import { ClientPaymentSection } from "./ClientPaymentSection";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const paymentHistory = await api.userCredit.getPaymentHistory();

  return (
    <div className="flex min-h-screen bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="bg-white/10 rounded-xl p-8 space-y-6">
            <div className="flex flex-col items-center space-y-4">
              {session.user.image && (
                <Image 
                  src={session.user.image} 
                  alt="Profile Picture" 
                  width={120} 
                  height={120} 
                  className="rounded-full border-4 border-[hsl(280,100%,70%)]"
                />
              )}
              
              <h1 className="text-3xl font-bold">
                Profile
              </h1>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Name
                </label>
                <div className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white">
                  {session.user.name ?? 'Not provided'}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Email
                </label>
                <div className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white">
                  {session.user.email ?? 'Not provided'}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  User ID
                </label>
                <div className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white">
                  {session.user.id}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white/10 rounded-xl p-8 space-y-6">
            <h2 className="text-2xl font-bold mb-4">Credit Balance</h2>
            <div className="flex items-center justify-between">
              <ClientPaymentSection />
            </div>
          </div>

          <div className="bg-white/10 rounded-xl p-8 space-y-6">
            <h2 className="text-2xl font-bold mb-4">Payment History</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="py-2">Date</th>
                    <th className="py-2">Credit Amount</th>
                    <th className="py-2">Amount Paid</th>
                    <th className="py-2">Network</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentHistory.map((payment) => (
                    <tr key={payment.id} className="border-b border-white/10">
                      <td className="py-2">
                        {new Date(payment.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2">
                        {formatCurrency(Number(payment.creditAmount))}
                      </td>
                      <td className="py-2">
                        {formatCurrency(Number(payment.amountPaid))} {payment.currency}
                      </td>
                      <td className="py-2">{payment.blockchainNetwork}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          
        </div>
      </div>
    </div>
  );
} 