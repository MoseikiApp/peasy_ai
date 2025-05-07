"use client";

import { useState, useEffect } from "react";
import { 
  useSendTransaction, 
  useWaitForTransactionReceipt 
} from 'wagmi';
import { parseUnits } from 'viem';
import { toast } from "react-hot-toast";
import { api } from "~/trpc/react";
import { env } from "~/env";
import { useAccount } from 'wagmi';
import { formatCurrency } from "~/utils/formatCurrency";
// import type { SendTransactionErrorType } from 'wagmi/actions';

export function ClientPaymentSection() {
  const [paymentAmount, setPaymentAmount] = useState(50); // Default to 50 USD
  const { address } = useAccount();
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'confirming' | 'verifying' | 'success'>('idle');
  const utils = api.useUtils();

  // Fetch current balance
  const { data: currentBalance } = api.userCredit.getCurrentBalance.useQuery(
    undefined, 
    { 
      refetchInterval: 60000, // Refetch every 60 seconds
      refetchOnWindowFocus: true
    }
  );

  const { 
    data: transactionHash,
    error: transactionError,
    sendTransaction 
  } = useSendTransaction({
    // onSuccess: () => {
    //   // Reset payment status to allow another transaction
    //   setPaymentStatus('confirming');
    // },
    // onError: (error: SendTransactionErrorType) => {
    //   setPaymentError(error.message ?? 'Transaction failed');
    //   setPaymentStatus('idle');
    //   toast.error('Payment transaction was rejected');
    // }
  });

  const { 
    isSuccess: isTransactionConfirmed,
    isSuccess: isTransactionSuccess 
  } = useWaitForTransactionReceipt({ 
    hash: transactionHash, 
  });

  const initiatePaymentMutation = api.userCredit.initiatePayment.useMutation({
    onError: (error) => {
      setPaymentError(`Failed to initiate payment: ${error.message}`);
      setPaymentStatus('idle');
      toast.error(`Payment initiation failed: ${error.message}`);
    }
  });

  const checkPaymentStatusMutation = api.userCredit.checkPaymentStatus.useMutation({
    onSuccess: () => {
      toast.success(`Successfully added ${paymentAmount} USD to your credit balance`);
      setPaymentError(null);
      // Explicitly set status back to 'idle' to allow another payment
      setPaymentStatus('idle');

      const paymentSuccessEvent = new CustomEvent('payment-success', {
        detail: {
          amount: paymentAmount,
          timestamp: new Date().toISOString(),
          walletAddress: address
        },
        bubbles: true,
        cancelable: true
      });
      window.dispatchEvent(paymentSuccessEvent);

      void utils.userCredit.getCurrentBalance.invalidate();
      void utils.userCredit.getCurrentBalance.refetch();
    },
    onError: (error) => {
      setPaymentError(`Payment verification failed: ${error.message}`);
      setPaymentStatus('idle');
      toast.error(`Payment verification failed: ${error.message}`);
    }
  });

  const handlePayment = async () => {
    // Reset any previous errors
    setPaymentError(null);
    setPaymentStatus('processing');

    if (!address) {
      toast.error('Please connect your wallet');
      setPaymentStatus('idle');
      return;
    }

    try {
      // Initiate payment intent on the backend
      const paymentIntent = await initiatePaymentMutation.mutateAsync({
        amountInUsd: paymentAmount,
        blockchainNetwork: 'base_mainnet',
        walletId: address
      });

      const paymentFeeRecipient = env.NEXT_PUBLIC_COMPANY_WALLET_ADDRESS;
      const amountInEth =  paymentIntent.amount;
      const paymentIntentId = paymentIntent.id;
      console.log("Payment intent ID:", paymentIntentId);
      console.log("Amount in ETH:", amountInEth);
      
      // Send transaction
      sendTransaction({
        to: paymentFeeRecipient as `0x${string}`,
        value: parseUnits((amountInEth).toString(), 18),
        // Attach payment intent ID as additional context if needed
        data: paymentIntentId ? `0x${Buffer.from(paymentIntentId).toString('hex')}` : undefined
      });
    } catch (error) {
      console.error('Payment initiation failed', error);
      setPaymentStatus('idle');
      setPaymentError(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  };

  // Trigger payment record and credit addition when transaction is successful
  const handleTransactionSuccess = (paymentIntentId: string) => {
    setPaymentStatus('verifying');
    checkPaymentStatusMutation.mutate({
      transactionId: paymentIntentId
    });
  };

  // Transaction success effect
  useEffect(() => {
    if (isTransactionSuccess && transactionHash) {
      // Extract paymentIntentId from the transaction data if possible
      // This assumes you stored the paymentIntentId when initiating the transaction
      const paymentIntentId = transactionHash; // Adjust this based on how you stored the ID
      handleTransactionSuccess(paymentIntentId);
    }
    
    if (transactionError) {
      setPaymentError(transactionError.message);
      setPaymentStatus('idle');
      toast.error(`Transaction failed: ${transactionError.message}`);
    }
    
    if (isTransactionConfirmed) {
      setPaymentStatus('verifying');
      toast.success("Payment processed successfully");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTransactionSuccess, transactionError, isTransactionConfirmed, transactionHash]);

  // Button label logic
  const getButtonLabel = () => {
    switch (paymentStatus) {
      case 'processing':
        return 'Processing...';
      case 'confirming':
        return 'Confirming...';
      case 'verifying':
        return 'Verifying...';
      case 'success':
        return 'Add Credit';
      default:
        return 'Add Credit';
    }
  };

  return (
    <div className="flex flex-col items-center space-y-4 w-full">
      <div className="flex items-center justify-between w-full">
        <div className="text-4xl font-extrabold text-[hsl(280,100%,70%)]">
          {formatCurrency(currentBalance?.totalCredits ?? 0)}
        </div>
        <div className="flex items-center space-x-4 self-end">
          <div className="flex items-center space-x-2">
            <span className="w-4 inline-block text-right">$</span>
            <input 
              type="range" 
              min="1" 
              max="1000" 
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(Number(e.target.value))}
              className="w-48 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="w-12 inline-block text-left tabular-nums">
              ${paymentAmount.toString().padStart(4, ' ')}
            </span>
          </div>
          <button 
            onClick={handlePayment}
            disabled={paymentStatus !== 'idle'}
            className="bg-[hsl(280,100%,70%)] hover:bg-[hsl(280,100%,60%)] text-white px-4 py-2 rounded"
          >
            {getButtonLabel()}
          </button>
        </div>
      </div>
      
      {paymentError && (
        <div className="text-red-500 text-sm mt-2 text-left max-w-[70%] ml-auto mr-0 break-words">
          {paymentError}
        </div>
      )}
    </div>
  );
} 