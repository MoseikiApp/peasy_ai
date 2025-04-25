import { ethers } from 'ethers';
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { Decimal } from "@prisma/client/runtime/library";
import { CryptoService } from '~/server/services/CryptoService';

// Add these constants at the top of the file
const BASE_RPC_URL = process.env.BASE_RPC_URL;
const COMPANY_WALLET_ADDRESS = process.env.NEXT_PUBLIC_COMPANY_WALLET_ADDRESS;

export const userCreditRouter = createTRPCRouter({
    getCurrentBalance: protectedProcedure
        .query(async ({ ctx }) => {
            // Ensure a UserCredit record exists for the user
            const userCredit = await ctx.db.userCredit.upsert({
                where: { userId: ctx.session.user.id },
                update: {}, // No changes if record exists
                create: {
                    userId: ctx.session.user.id,
                    totalCredits: new Decimal(0)
                },
                select: { totalCredits: true }
            });

            // Return the total credits, converting to a number
            return { totalCredits: Number(userCredit.totalCredits) };
        }),

    getPaymentHistory: protectedProcedure
        .query(async ({ ctx }) => {
            return await ctx.db.payment.findMany({
                where: { userId: ctx.session.user.id },
                orderBy: { createdAt: 'desc' },
                take: 50,
                select: {
                    id: true,
                    creditAmount: true,
                    amountPaid: true,
                    currency: true,
                    blockchainNetwork: true,
                    createdAt: true
                }
            });
        }),

    initiatePayment: protectedProcedure
        .input(z.object({
            amountInUsd: z.number().min(1).max(1000),
            blockchainNetwork: z.string(),
            walletId: z.string()
        }))
        .mutation(async ({ ctx, input }) => {
            const { db, session } = ctx;

            const cryptoService = new CryptoService(ctx.db);
            const conversionRateUsdEth = await cryptoService.getRate("USD", "ETH");
            const amount = new Decimal(input.amountInUsd * conversionRateUsdEth);
            // Start a transaction to ensure atomicity
            const paymentIntent = await db.paymentIntent.create({
                data: {
                    userId: session.user.id,
                    amount: amount,
                    currency: "ETH",
                    amountInUsd: new Decimal(input.amountInUsd),
                    blockchainNetwork: input.blockchainNetwork,
                    walletId: input.walletId,
                    createdAt: new Date(),
                    status: 'pending'
                }
            });

            console.log('Payment intent created with ID:', paymentIntent.id);

            return paymentIntent;

        }),


    checkPaymentStatus: protectedProcedure
        .input(z.object({
            transactionId: z.string()
        }))
        .mutation(async ({ ctx, input }) => {

            console.log('Checking payment status for transaction ID:', input.transactionId);
            const transactionDetails = await getBlockchainTransactionDetails(input.transactionId);

            if (!transactionDetails) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Transaction details not found'
                });
            }

            console.log('Transaction details:', transactionDetails);


            if (transactionDetails.status === false) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Transaction failed'
                });
            }

            const paymentIntentIdHex = transactionDetails.input;

            if (!paymentIntentIdHex) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Payment intent ID not found'
                });
            }

            //Revert the transaction id. It was created this way:  `0x${Buffer.from(paymentIntentId).toString('hex')}`
            const paymentIntentId = Buffer.from(paymentIntentIdHex.slice(2), 'hex').toString('ascii');

            const { db, session } = ctx;

            console.log('Checking payment status for ID:', paymentIntentId);
            // Find the payment intent
            const paymentIntent = await db.paymentIntent.findUnique({
                where: {
                    id: paymentIntentId,
                    userId: session.user.id,
                    status: 'pending'
                }
            });

            
            if (!paymentIntent) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Payment intent not found'
                });
            }

            console.log('Payment intent found:', paymentIntent);

            if (paymentIntent.blockchainNetwork !== "base_mainnet") {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Payment intent blockchain network does not match transaction blockchain network'
                });
            }

            if (paymentIntent.walletId !== transactionDetails.from) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Payment intent wallet ID does not match transaction wallet ID'
                });
            }

            if (transactionDetails.to !== COMPANY_WALLET_ADDRESS) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Transaction destination address does not match company wallet address'
                });
            }

            // Check if the payment intent is still valid (within 10 minutes)
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            if (paymentIntent.createdAt < tenMinutesAgo) {
                throw new TRPCError({
                    code: 'PRECONDITION_FAILED',
                    message: 'Payment intent has expired'
                });
            }
            
            if (transactionDetails.value !== decimalToBigInt(paymentIntent.amount)) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Transaction amount does not match payment intent amount'
                });
            }


            //Ensure transaction is unique and not found on payment table
            const existingPayment = await db.payment.findFirst({
                where: { transactionHash: input.transactionId }
            });

            if (existingPayment) {
                throw new TRPCError({
                    code: 'CONFLICT',
                    message: 'Transaction already processed'
                });
            }

            // Start a transaction to ensure atomicity
            return db.$transaction(async (tx) => {
                // Update payment intent status
                await tx.paymentIntent.update({
                    where: { id: paymentIntentId },
                    data: { status: 'completed' }
                });

                // Create payment record
                const payment = await tx.payment.create({
                    data: {
                        userId: session.user.id,
                        creditAmount: paymentIntent.amountInUsd,
                        amountPaid: paymentIntent.amount,
                        currency: paymentIntent.currency, // Adjust as needed
                        blockchainNetwork: paymentIntent.blockchainNetwork,
                        walletAddress: paymentIntent.walletId,
                        transactionHash: input.transactionId,
                        createdAt: new Date()
                    }
                });

                // Update user credit balance
                await tx.userCredit.upsert({
                    where: { userId: session.user.id },
                    update: {
                        totalCredits: { increment: paymentIntent.amountInUsd }
                    },
                    create: {
                        userId: session.user.id,
                        totalCredits: paymentIntent.amountInUsd
                    }
                });

                return payment;
            });
        }),

});

function decimalToBigInt(amount: Decimal, decimals = 18): bigint {
    // Convert Decimal to string to preserve precision
    const amountStr = amount.toString();
    
    // Parse the amount and convert to wei (18 decimal places for most EVM chains)
    return ethers.parseUnits(amountStr, decimals);
}


async function getBlockchainTransactionDetails(transactionHash: string): Promise<{
    from: string;
    to: string;
    value: bigint;
    blockNumber: number;
    timestamp: number;
    gasPrice: bigint;
    gasUsed: bigint;
    transactionFee: bigint;
    status: boolean;
    input: string;
}> {
    // Validate input
    if (!transactionHash || !ethers.isHexString(transactionHash)) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid transaction hash'
        });
    }

    try {
        // Create a provider
        const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);

        // Fetch transaction
        const tx = await provider.getTransaction(transactionHash);
        if (!tx) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Transaction not found'
            });
        }

        // Fetch transaction receipt for additional details
        const receipt = await provider.getTransactionReceipt(transactionHash);
        if (!receipt) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Transaction receipt not found'
            });
        }

        // Fetch block to get timestamp
        const block = await provider.getBlock(tx.blockNumber!);
        if (!block) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Block not found'
            });
        }

        return {
            from: tx.from,
            to: tx.to!,
            value: tx.value,
            blockNumber: Number(tx.blockNumber),
            timestamp: Number(block.timestamp),
            gasPrice: tx.gasPrice || 0n,
            gasUsed: receipt.gasUsed,
            transactionFee: (tx.gasPrice || 0n) * receipt.gasUsed,
            status: receipt.status === 1, // 1 means success, 0 means failure
            input: tx.data // Contract interaction data
        };
    } catch (error) {
        console.error('Error fetching transaction details:', error);
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to retrieve transaction details'
        });
    }
}