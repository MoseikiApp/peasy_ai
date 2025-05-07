import { ethers } from 'ethers';
import axios from 'axios';
import { CryptoService } from './CryptoService';

export class SwingService {
    private prisma: any;
    private SWING_PROJECT_ID = 'peasy';

    constructor(prisma: any) {
        this.prisma = prisma;
    }

    private async withTimeout<T>(promise: Promise<T>, ms: number, errorMessage = 'Timeout'): Promise<T> {
        let timeout: NodeJS.Timeout;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error(errorMessage)), ms);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
    }

    private async getAllowanceForSwap(
        chain: string,
        tokenFrom: any,
        tokenTo: any,
        bridge: string,
        walletAddress: string,
        swingApiKey: string
    ): Promise<number> {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${swingApiKey}`
        };

        const result = await axios.get(
            'https://swap.prod.swing.xyz/v0/transfer/allowance',
            {
                params: {
                    fromChain: chain,
                    tokenSymbol: tokenFrom.symbol,
                    tokenAddress: tokenFrom.address,
                    bridge: bridge,
                    fromAddress: walletAddress,
                    toChain: chain,
                    toTokenSymbol: tokenTo.symbol,
                    toTokenAddress: tokenTo.address,
                    projectId: this.SWING_PROJECT_ID,
                },
                headers
            });
        return result.data.allowance;
    }

    private async getApprovalCallDataForSwap(
        chain: string,
        tokenFrom: any,
        tokenTo: any,
        bridge: string,
        walletAddress: string,
        amountFromTokenAmount: number,
        swingApiKey: string
    ): Promise<any> {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${swingApiKey}`
        };

        const result = await axios.get(
            'https://swap.prod.swing.xyz/v0/transfer/approve',
            {
                params: {
                    fromChain: chain,
                    tokenSymbol: tokenFrom.symbol,
                    tokenAddress: tokenFrom.address,
                    bridge: bridge,
                    fromAddress: walletAddress,
                    toChain: chain,
                    toTokenSymbol: tokenTo.symbol,
                    toTokenAddress: tokenTo.address,
                    tokenAmount: amountFromTokenAmount,
                    projectId: this.SWING_PROJECT_ID,
                },
                headers
            });
        return result.data;
    }

    private async getQuoteForSwap(
        chain: string,
        tokenFrom: any,
        tokenTo: any,
        walletAddress: string,
        amountFromTokenAmount: number,
        swingApiKey: string
    ): Promise<any> {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${swingApiKey}`
        };

        const payload = {
            fromChain: chain,
            fromTokenAddress: tokenFrom.address,
            fromUserAddress: walletAddress,
            tokenSymbol: tokenFrom.symbol,
            toTokenAddress: tokenTo.address,
            toChain: chain,
            tokenAmount: amountFromTokenAmount,
            toTokenSymbol: tokenTo.symbol,
            toUserAddress: walletAddress,
            projectId: this.SWING_PROJECT_ID,
            gasless: true,
            maxSlippage: 0.10
        };

        const quoteResponse = await axios.get(
            'https://swap.prod.swing.xyz/v0/transfer/quote',
            {
                params: payload
            }
        );

        return quoteResponse;
    }

    private async getTokensInAndOutFromChain(
        chainName: string,
        tokenInSymbol: string,
        tokenOutSymbol: string,
        swingProjectId: string,
        logPrefix: string
    ): Promise<{ tokenFrom: any, tokenTo: any }> {
        const projectTokensResponse = await fetch(
            `https://platform.swing.xyz/api/v1/projects/${swingProjectId}/tokens`,
        );
        const tokens = await projectTokensResponse.json();

        const chain = chainName.toLowerCase();
        const tokenList = tokens.filter((token: any) => token.chain === chain);

        const tokenInUpper = tokenInSymbol.toUpperCase();
        const tokenOutUpper = tokenOutSymbol.toUpperCase();

        let tokenFrom = tokenList.find((token: any) => token.symbol.toUpperCase() == tokenInUpper);
        let tokenTo = tokenList.find((token: any) => token.symbol.toUpperCase() == tokenOutUpper);
        console.log(`${logPrefix}Token from: ${this.jsonStringifyWithBigIntAsNumber(tokenFrom)}`);
        console.log(`${logPrefix}Token to: ${this.jsonStringifyWithBigIntAsNumber(tokenTo)}`);

        return { tokenFrom, tokenTo };
    }

    private async getChain(
        chainName: string,
        swingProjectId: string,
        logPrefix: string
    ): Promise<{ chain: any, nativeTokenSymbol: string }> {
        const projectChainsResponse = await fetch(
            `https://platform.swing.xyz/api/v1/projects/${swingProjectId}/chains`,
        );
        const chainList = await projectChainsResponse.json();

        const chainNameLower = chainName.toLowerCase();
        const chain = chainList.find((chain: any) => chain.slug === chainNameLower);

        console.log(`${logPrefix}Chain: ${this.jsonStringifyWithBigIntAsNumber(chain)}`);

        return { chain, nativeTokenSymbol: chain.nativeToken.symbol };
    }

    private async getSendCallDataForSwap(
        chain: string,
        tokenFrom: any,
        tokenTo: any,
        walletAddress: string,
        amountFromTokenAmount: number,
        route: any,
        swingProjectId: string,
        swingApiKey: string,
        logPrefix: string,
        provider: ethers.Provider
    ): Promise<any> {
        const sendPayload = {
            fromChain: chain,
            tokenSymbol: tokenFrom.symbol,
            fromTokenAddress: tokenFrom.address,
            fromUserAddress: walletAddress,
            toChain: chain,
            toTokenSymbol: tokenTo.symbol,
            toTokenAddress: tokenTo.address,
            toUserAddress: walletAddress,
            tokenAmount: amountFromTokenAmount.toString(),
            projectId: swingProjectId,
            route: route,
            // debug: true,
            // maxSlippage: 0.10,
            // fee: 200
        };

        console.log(`${logPrefix}Send payload: ${this.jsonStringifyWithBigIntAsNumber(sendPayload)}`);

        let resultSendPrepare: any;
        try {
            resultSendPrepare = await axios.post(
                'https://swap.prod.swing.xyz/v0/transfer/send',
                sendPayload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${swingApiKey}`
                    }
                }
            );



        } catch (error: unknown) {
            if (error && typeof error === 'object' && 'response' in error) {
                const responseData = (error as any).response?.data;

                // Check for insufficient funds error
                if (responseData?.message?.includes('transfer amount exceeds balance') ||
                    responseData?.error === 'INSUFFICIENT_FUNDS') {

                    console.error('Transaction failed: Insufficient funds');
                } else if (responseData?.error === 'HIGH_SLIPPAGE') {
                    throw new Error(`You don't have enough ${tokenFrom.symbol} in your wallet to complete this swap. Please check your balance and try again with a smaller amount.`);
                    throw new Error(`Market price moved too much and the slippage became too high. Please try again by getting a new quote.`);
                }

                console.error('Error response:', responseData?.message ? responseData?.message : responseData);
            }
            else {

                if ((error as any).message){
                    console.error('Error:', (error as any).message);
                    throw new Error(`Failed to prepare swap transaction. ${error as any}.message`);
                } else {
                    console.error('Error:', error);
                    throw new Error(`Failed to prepare swap transaction due to market movement. Please try again.`);
                }
            }
        }

        return resultSendPrepare;
    }

    public async getSwapDetailsFromTx(
        txHash: string,
        tokenFrom: any,
        tokenTo: any,
    ): Promise<{
        isSuccess: boolean,
        error: string | null | undefined,
        actualAmountSent: number,
        actualAmountReceived: number,
        gasFeeInNativeToken: number,
        actualSwapRate: number,
        sentToken: string,
        receivedToken: string,
        gasToken: string,
        actualAmountSentStr: string,
        actualAmountReceivedStr: string,
        gasFeeInNativeTokenStr: string,
        actualSwapRateStr: string
    }> {

        const cryptoService = new CryptoService(this.prisma);
        const provider = await cryptoService.getDefaultRpcProvider();

        const tx = await provider.getTransaction(txHash);
        if (!tx) {
            throw new Error('Transaction not found');
        }
        const receipt = await tx.wait();

        if (!receipt) {
            throw new Error('Transaction receipt not found');
        }

        const chainName = "base";

        // const chain = await this.getChain(chainName, this.SWING_PROJECT_ID, "getSwapDetailsFromTx");

        const tokenInUpper = tokenFrom.toUpperCase();
        const tokenOutUpper = tokenTo.toUpperCase();

        const tokens = await this.getTokensInAndOutFromChain(
            chainName,
            tokenInUpper,
            tokenOutUpper,
            this.SWING_PROJECT_ID,
            "getSwapDetailsFromTx"
        );


        var result = await this.extractSwapDetailsFromReceipt(receipt, tokens.tokenFrom, tokens.tokenTo, provider);
        console.log("Result: " + this.jsonStringifyWithBigIntAsNumber(result));
        return result;
    }

    private async extractSwapDetailsFromReceipt(
        receipt: ethers.TransactionReceipt,
        tokenFrom: any,
        tokenTo: any,
        provider: ethers.Provider
    ): Promise<{
        isSuccess: boolean,
        error: string | null | undefined,
        actualAmountSent: number,
        actualAmountReceived: number,
        gasFeeInNativeToken: number,
        actualSwapRate: number,
        sentToken: string,
        receivedToken: string,
        gasToken: string,
        actualAmountSentStr: string,
        actualAmountReceivedStr: string,
        gasFeeInNativeTokenStr: string,
        actualSwapRateStr: string
    }> {
        console.log("Extract swap details from receipt. Token from: " + tokenFrom.symbol + " Token to: " + tokenTo.symbol);
        // Gas fee in native token
        const gasFeeInNativeToken = (receipt.gasUsed * receipt.gasPrice).toString();
        const gasFeeFormatted = ethers.formatEther(gasFeeInNativeToken);

        // Create interfaces to parse logs
        const erc20Interface = new ethers.Interface([
            "event Transfer(address indexed from, address indexed to, uint256 value)"
        ]);

        // Track token movements
        let actualAmountSent = 0;
        let actualAmountReceived = 0;

        const userAddress = receipt.from.toLowerCase();
        const txHash = receipt.hash;

        // Handle native token (ETH) transfers by checking transaction and tracing internal transactions
        if (tokenFrom.address.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" ||
            tokenFrom.symbol.toUpperCase() === "ETH") {
            // For native token sent, check the transaction value
            const tx = await provider.getTransaction(txHash);
            if (tx && tx.from.toLowerCase() === userAddress) {
                const amountSent = Number(ethers.formatEther(tx.value));
                actualAmountSent = amountSent;
                console.log(`Native token sent in main transaction: ${amountSent} ETH`);
            }
        }

        if (tokenTo.address.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" ||
            tokenTo.symbol.toUpperCase() === "ETH") {
            // For native tokens received, we need to trace internal transactions
            // This requires fetching internal transactions from the node or an external API
            try {
                // Get the transaction trace if your provider supports it
                // This example uses a debug_traceTransaction call that many nodes support
                const jsonRpcProvider = provider as ethers.JsonRpcProvider;
                const trace = await jsonRpcProvider.send("debug_traceTransaction", [txHash, { tracer: "callTracer" }]);

                if (trace && trace.calls) {
                    const receivedFromInternals = this.processInternalTransfers(trace, userAddress);
                    actualAmountReceived += receivedFromInternals;
                }
            } catch (error) {
                console.log("Internal transaction tracing not supported by provider, falling back to events");
                // Some providers don't support tracing - we'll need to rely on events
                // Try to detect ETH transfers from logs (may not catch all internal transfers)
                const receivedFromEvents = await this.detectEthTransfersFromEvents(receipt, userAddress);
                actualAmountReceived += receivedFromEvents;
            }
        }

        // Parse logs for ERC20 tokens
        for (const log of receipt.logs) {
            try {
                const parsedLog = erc20Interface.parseLog(log);

                if (parsedLog?.name === "Transfer") {
                    const { from, to, value } = parsedLog.args;

                    // Check if this is the source token being sent
                    if (log.address.toLowerCase() === tokenFrom.address.toLowerCase()) {
                        console.log(`Found source token transfer: ${from} → ${to}`);
                        if (from.toLowerCase() === userAddress) {
                            const amount = Number(ethers.formatUnits(value, tokenFrom.decimals));
                            actualAmountSent += amount;
                            console.log(`Actual amount sent: ${amount}`);
                        }
                    }

                    // Check if this is the destination token being received
                    if (log.address.toLowerCase() === tokenTo.address.toLowerCase()) {
                        console.log(`Found destination token transfer: ${from} → ${to}`);
                        if (to.toLowerCase() === userAddress) {
                            const amount = Number(ethers.formatUnits(value, tokenTo.decimals));
                            actualAmountReceived += amount;
                            console.log(`Actual amount received: ${amount}`);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error parsing log: ${error}`);
                continue;
            }
        }

        // If we still don't have data for native token transfers, use an alternative approach
        if (actualAmountReceived === 0 &&
            (tokenTo.address.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" ||
                tokenTo.symbol.toUpperCase() === "ETH")) {
            // Fallback: Get balances before and after to estimate transfer
            console.log("Using balance difference to determine native token transfer");
            const block = receipt.blockNumber;

            try {
                // Get balance at previous block
                const balanceBefore = await provider.getBalance(userAddress, block - 1);
                // Get balance at current block
                const balanceAfter = await provider.getBalance(userAddress, block);

                // Calculate difference, accounting for gas costs
                const gasCost = BigInt(gasFeeInNativeToken);
                const rawDifference = balanceAfter - balanceBefore + gasCost;

                // If positive, this is likely the received amount
                if (rawDifference > 0n) {
                    const receivedAmount = Number(ethers.formatEther(rawDifference));
                    actualAmountReceived = receivedAmount;
                    console.log(`Estimated native token received from balance change: ${receivedAmount} ETH`);
                }
            } catch (error) {
                console.error("Error determining balance difference:", error);
            }
        }

        const actualSwapRate = actualAmountReceived / actualAmountSent;
        return {
            isSuccess: true,
            actualAmountSent,
            sentToken: tokenFrom,
            actualAmountReceived,
            receivedToken: tokenTo,
            gasFeeInNativeToken: Number(gasFeeFormatted),
            gasToken: "ETH",
            actualSwapRate: actualSwapRate,
            error: null,
            actualAmountSentStr: this.convertNumberToLocaleString(actualAmountSent),
            actualAmountReceivedStr: this.convertNumberToLocaleString(actualAmountReceived),
            gasFeeInNativeTokenStr: this.convertNumberToLocaleString(Number(gasFeeFormatted)),
            actualSwapRateStr: this.convertNumberToLocaleString(actualSwapRate)
        };
    }

    private convertNumberToLocaleString(number: number): string {
        return number.toLocaleString("fullwide", {
            useGrouping: false,
            maximumSignificantDigits: 20,
        });
    }

    private processInternalTransfers(trace: any, userAddress: string): number {
        // Process call trace to find internal ETH transfers
        if (!trace || !trace.calls) return 0;

        let totalReceived = 0;

        for (const call of trace.calls) {
            if (call.type === "CALL" && call.value && BigInt(call.value) > 0n) {
                // Check if this is a transfer to our user
                if (call.to && call.to.toLowerCase() === userAddress) {
                    const amount = Number(ethers.formatEther(call.value));
                    totalReceived += amount;
                    console.log(`Internal ETH transfer found: ${amount} ETH`);
                }
            }

            // Recursively process nested calls
            if (call.calls && call.calls.length > 0) {
                totalReceived += this.processInternalTransfers(call, userAddress);
            }
        }

        return totalReceived;
    }

    private async detectEthTransfersFromEvents(
        receipt: ethers.TransactionReceipt,
        userAddress: string
    ): Promise<number> {
        let totalReceived = 0;

        // Look for common events that indicate ETH transfers
        for (const log of receipt.logs) {
            try {
                // Many DEXs emit events when ETH is transferred
                // Examples: Uniswap V2/V3 Swap events, 0x Protocol events, etc.
                const knownInterfaces = [
                    // Uniswap V2/V3-like swap interface
                    new ethers.Interface([
                        "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)"
                    ]),
                    // ETH Withdrawn event pattern
                    new ethers.Interface([
                        "event EthWithdrawn(address indexed to, uint256 amount)"
                    ]),
                    // Generic withdrawal event
                    new ethers.Interface([
                        "event Withdrawal(address indexed to, uint256 amount)"
                    ])
                ];

                for (const iface of knownInterfaces) {
                    try {
                        const parsedLog = iface.parseLog(log);
                        if (parsedLog && parsedLog.args.to && parsedLog.args.to.toLowerCase() === userAddress) {
                            // This might indicate an ETH transfer to the user
                            console.log(`Found potential ETH transfer event: ${parsedLog.name}`);

                            // Try to extract the amount if available in the event args
                            if (parsedLog.args.amount && BigInt(parsedLog.args.amount) > 0n) {
                                const amount = Number(ethers.formatEther(parsedLog.args.amount));
                                totalReceived += amount;
                                console.log(`ETH amount from event: ${amount}`);
                            }

                            // For Uniswap-like interfaces, try to determine if ETH was sent
                            if (parsedLog.name === "Swap") {
                                // Here we'd need more context to determine which is the ETH amount
                                // This is a simplification - in reality, you'd need to check
                                // which token is ETH and which output corresponds to it
                                if (parsedLog.args.amount0Out && BigInt(parsedLog.args.amount0Out) > 0n) {
                                    // Assuming token0 might be ETH - requires more checks in practice
                                    console.log(`Potential ETH output detected in Swap event`);
                                }
                                if (parsedLog.args.amount1Out && BigInt(parsedLog.args.amount1Out) > 0n) {
                                    // Assuming token1 might be ETH - requires more checks in practice
                                    console.log(`Potential ETH output detected in Swap event`);
                                }
                            }
                        }
                    } catch {
                        // Parsing failed, try next interface
                        continue;
                    }
                }
            } catch (error) {
                // Skip errors in event parsing
                continue;
            }
        }

        return totalReceived;
    }

    private jsonStringifyWithBigIntAsNumber(data: any): any {
        return JSON.stringify(
            data, 
            (key: any, value: any) => typeof value === "bigint" ? Number(value) : value,
            2
        );
    }

    public async swap(
        userId: string,
        walletAddress: `0x${string}`,
        chainName: `${string}`,
        tokenInSymbol: `${string}`,
        tokenOutSymbol: `${string}`,
        amount: number,
        quoteOnly: boolean,
        approvedSwapRate: number | null,
        maxAcceptableRateWithSlippagePercentage = 1,
        notificationCallback: ((msg: string) => Promise<void>) | null = null
    ): Promise<any> {
        let financialActionId: string | null = null;
        const logPrefix = `[CryptoService.swap] `;

        const cryptoService = new CryptoService(this.prisma);
        const ethAmount = await cryptoService.getWalletBalance(walletAddress, "ETH");
        const minEthAmountForGas = 0.0001;

        if (ethAmount.balance < minEthAmountForGas) {
            return {
                isSuccess: false,
                error: "You don't have sufficient ETH. Please add at least 0.0001 ETH to your wallet to pay for potential gas and swap fees."
            };
        }

        tokenInSymbol = tokenInSymbol.toUpperCase();
        tokenOutSymbol = tokenOutSymbol.toUpperCase();

        try {
            console.log(`${logPrefix}Swapping ${amount} from ${tokenInSymbol} to ${tokenOutSymbol} for wallet ${walletAddress} on chain ${chainName} for amount ${amount}. `
                + ` Quote only: ${quoteOnly}. Approved swap rate: ${approvedSwapRate}. Max acceptable rate with slippage percentage: ${maxAcceptableRateWithSlippagePercentage}`);

            const actionName = quoteOnly ? "CRYPTO_SWAP_QUOTE_SWING" : "CRYPTO_SWAP_SWING";
            const chain = "base";

            // Create a new financial action record
            const financialAction = await this.prisma.financialChatAction.create({
                data: {
                    accountId: userId,
                    actionType: actionName,
                    actionInputCurrency: tokenInSymbol,
                    actionInputNetwork: chain,
                    actionInputWallet: walletAddress,
                    actionOutputCurrency: tokenInSymbol,
                    actionOutputWallet: walletAddress,
                    actionOutputNetwork: chain,
                    actionApprovalType: "chat",
                    actionResult: 'PROCESSING',
                    actionResultData: this.jsonStringifyWithBigIntAsNumber({
                        status: 'PROCESSING',
                        message: `Initiating swap from ${tokenInSymbol} to ${tokenOutSymbol}`
                    }),
                    actionResultUserFriendlyMessage: `Processing your swap from ${tokenInSymbol} to ${tokenOutSymbol}...`
                }
            });

            financialActionId = financialAction.id;

            var swapResult = await this.swapTrade(
                walletAddress,
                chainName,
                tokenInSymbol,
                tokenOutSymbol,
                amount,
                quoteOnly,
                approvedSwapRate,
                maxAcceptableRateWithSlippagePercentage,
                notificationCallback
            );


            await this.prisma.financialChatAction.update({
                where: { id: financialActionId },
                data: {
                    actionResult: swapResult.isSuccess ? 'SUCCESS' : 'FAILED',
                    actionResultData: this.jsonStringifyWithBigIntAsNumber(swapResult),
                    actionResultUserFriendlyMessage: swapResult.isSuccess ? `Successfully initiated swap from ${tokenInSymbol} to ${tokenOutSymbol}. Transaction hash: ${swapResult.txHash}` : swapResult.error,
                    actionResultDate: new Date(),
                    commissionAmountInEth: swapResult.actualCommissionAmountPaidInEth,
                    commissionWalletAddress: swapResult.companyCommissionWallet
                }
            });

            return swapResult;

        }
        catch (error: any) {
            console.error(`${logPrefix}Error performing Swing swap: ${error.message}`);

            if (financialActionId) {
                await this.prisma.financialChatAction.update({
                    where: { id: financialActionId },
                    data: {
                        actionResult: 'ERROR',
                        actionResultData: this.jsonStringifyWithBigIntAsNumber({
                            status: 'ERROR',
                            error: error.message,
                            stack: error.stack
                        }),
                        actionResultUserFriendlyMessage: `Failed to swap from ${tokenInSymbol} to ${tokenOutSymbol}: ${error.message}`,
                        actionResultDate: new Date()
                    }
                });
            }

            throw error;
        }
    }


    public async swapTrade(
        walletAddress: `0x${string}`,
        chainName: `${string}`,
        tokenInSymbol: `${string}`,
        tokenOutSymbol: `${string}`,
        amount: number,
        quoteOnly: boolean,
        approvedSwapRate: number | null,
        maxAcceptableRateWithSlippagePercentage = 1,
        notificationCallback: ((msg: string) => Promise<void>) | null = null
    ): Promise<any> {

        const logPrefix = `[SwingService.swapViaSwing] `;

        

        var actionLogs: string[] = [];

        const addToActionLogs = (message: string, notifyUser: boolean = false) => {
            console.log(`${logPrefix}${message}`);
            actionLogs.push(`${logPrefix}${message}`);

            if (notifyUser) {
                notificationCallback?.(message);
            }
        }

        var userFriendlyStep = "Starting swap - this may take a while. I will keep you updated.";

        addToActionLogs(userFriendlyStep, true);

        userFriendlyStep = "Cancelling pending transactions";
        await this.listAndCancelPendingTransactions(walletAddress);
        addToActionLogs(userFriendlyStep, true);

        userFriendlyStep = "Preparing wallet";

        const addToActionLogsWithData = (message: string, data: any) => {
            console.log(`${logPrefix}${message}`, data);
            actionLogs.push(`${logPrefix}${message}`);
            actionLogs.push(`${logPrefix}Data: ${this.jsonStringifyWithBigIntAsNumber(data)}`);
        }

        try {
            addToActionLogs(userFriendlyStep, true);

            const swingProjectId = this.SWING_PROJECT_ID;
            const swingApiKey = process.env.SWING_API_KEY;
            const cryptoService = new CryptoService(this.prisma);
            const provider = await cryptoService.getDefaultRpcProvider();
            const senderSecretKey = await cryptoService.getWalletPrivateKey(walletAddress);
            const chain = chainName.toLowerCase();
            const tokenInUpper = tokenInSymbol.toUpperCase();
            const tokenOutUpper = tokenOutSymbol.toUpperCase();

            userFriendlyStep = "Getting tokens in and out from chain";
            addToActionLogs(userFriendlyStep, true);

            const { tokenFrom, tokenTo } = await this.getTokensInAndOutFromChain(
                chain,
                tokenInUpper,
                tokenOutUpper,
                swingProjectId,
                logPrefix
            );

            userFriendlyStep = "Getting amount from token amount";
            addToActionLogs(userFriendlyStep, true);

            const amountFromTokenAmount = Math.round(amount * Math.pow(10, tokenFrom.decimals));
            addToActionLogs(`Amount from token amount: ${amountFromTokenAmount}`);

            userFriendlyStep = "Getting quote for swap";
            addToActionLogs(userFriendlyStep, true);

            const quoteResponse = await this.getQuoteForSwap(
                chain,
                tokenFrom,
                tokenTo,
                walletAddress,
                amountFromTokenAmount,
                swingApiKey!
            );

            const blackListedBridge = "odos";
            let routes = quoteResponse.data.routes;

            routes.sort((a: any, b: any) => {
                const aPathLength = Object.keys(a.distribution).length;
                const bPathLength = Object.keys(b.distribution).length;
                return aPathLength - bPathLength;
            });
            quoteResponse.data.routes = routes;

            // if (routes.length > 1 && routes[0].route?.[0]?.bridge?.toLowerCase() === blackListedBridge) {
            //     routes.shift();
            //     addToActionLogs(`Removed blacklisted bridge ${blackListedBridge} from routes`, false);
            // }

            if (quoteResponse.data.routes == null || quoteResponse.data.routes.length == 0) {
                return {
                    isSuccess: false,
                    error: "No swap routes found/available for the pair " + tokenInSymbol + " to " + tokenOutSymbol + " at the moment.\nPlease try again later or use ETH as an intermediate currency."
                };
            }

            let bestQuote = quoteResponse.data.routes[0].quote;
            const bestQuote2 = quoteResponse.data.routes.length > 1 ? quoteResponse.data.routes[1].quote : null;
            const bestQuote3 = quoteResponse.data.routes.length > 2 ? quoteResponse.data.routes[2].quote : null;
            let route = quoteResponse.data.routes[0].route;
            const route2 = quoteResponse.data.routes.length > 1 ? quoteResponse.data.routes[1].route : null;
            const route3 = quoteResponse.data.routes.length > 2 ? quoteResponse.data.routes[2].route : null;
            let bridge = route?.[0]?.bridge;
            const bridge2 = route2?.[0]?.bridge;
            const bridge3 = route3?.[0]?.bridge;

            // const routePathCount = Object.keys(route?.path?.distribution).length;
            // if (route2 != null && routePathCount > 2) {
            //     addToActionLogs(`Found better route with ${routePathCount} paths`, false);
            //     route = route2;
            //     bridge = bridge2;
            //     bestQuote = bestQuote2;
            // }

            addToActionLogs(`Best quote: ${this.jsonStringifyWithBigIntAsNumber(bestQuote)}`);
            addToActionLogs(`Route: ${this.jsonStringifyWithBigIntAsNumber(route)}`);
            addToActionLogs(`Bridge: ${bridge}`);

            var totalFeeInUsd = 0.0;

            for (const fee of bestQuote.fees) {
                totalFeeInUsd += parseFloat(fee.amountUSD);
            }

            const amountToReceive = parseFloat(bestQuote.amount) / Math.pow(10, tokenTo.decimals);
            const swapRate = amountToReceive / amount;

            if (quoteOnly) {
                return {
                    isSuccess: true,
                    swapRate: swapRate,
                    swapRateStr: this.convertNumberToLocaleString(swapRate),
                    amountToReceive: amountToReceive,
                    amountToReceiveStr: this.convertNumberToLocaleString(amountToReceive),
                    totalFeeInUsd: totalFeeInUsd,
                    totalFeeInUsdStr: this.convertNumberToLocaleString(totalFeeInUsd),
                    quote: bestQuote,
                    quote2: bestQuote2,
                    quote3: bestQuote3,
                    actionLogs: actionLogs
                };
            }

            if (approvedSwapRate && swapRate > approvedSwapRate) {
                const maxAcceptableRate = approvedSwapRate * (1 + (maxAcceptableRateWithSlippagePercentage / 100));
                if (swapRate > maxAcceptableRate) {
                    return {
                        isSuccess: false,
                        error: `The swap cancelled because the rate has changed more than ${maxAcceptableRateWithSlippagePercentage}% from the rate you approved. The new swap rate was ${swapRate}. Please try again.`
                    };
                }
            }

            userFriendlyStep = "Getting allowance for swap";
            addToActionLogs(userFriendlyStep, true);

            const allowance = await this.getAllowanceForSwap(
                chain,
                tokenFrom,
                tokenTo,
                bridge,
                walletAddress,
                swingApiKey!
            );

            addToActionLogs(`Allowance: ${allowance}`);

            userFriendlyStep = "Getting approval call data for swap";
            addToActionLogs(userFriendlyStep, true);

            const senderWallet = new ethers.Wallet(senderSecretKey, provider);

            if (allowance < amountFromTokenAmount) {
                userFriendlyStep = "Approving swap";
                addToActionLogs(userFriendlyStep, true);

                const approvalCallData = await this.getApprovalCallDataForSwap(
                    chain,
                    tokenFrom,
                    tokenTo,
                    bridge,
                    walletAddress,
                    amountFromTokenAmount,
                    swingApiKey!
                );
                const transactionApprove = await senderWallet.sendTransaction(approvalCallData.tx[0]);
                const receipt = await transactionApprove.wait();
                addToActionLogsWithData('Allowance transaction receipt: ', receipt);
            }

            userFriendlyStep = "Preparing data for swap";
            addToActionLogs(userFriendlyStep, true);

            const resultSendPrepare = await this.getSendCallDataForSwap(
                chain,
                tokenFrom,
                tokenTo,
                walletAddress,
                amountFromTokenAmount,
                route,
                swingProjectId,
                swingApiKey!,
                logPrefix,
                provider
            );

            addToActionLogs("ResultSendPrepare status: " + resultSendPrepare.status);

            const sendCallData = resultSendPrepare.data.tx;

            const callDataStr = JSON.stringify(sendCallData);
            addToActionLogs("Call data: " + callDataStr);
            console.log("Swap route data length: " + callDataStr.length);

            if (tokenInSymbol.toLowerCase() != "eth" && tokenOutSymbol.toLowerCase() != "eth" && callDataStr.length > 4000) {
                addToActionLogs("Swap route is too long - cancelling transaction", false);
                return {
                    isSuccess: false,
                    error: "Swap route is too long - it will become too expensive to execute. Please try converting to ETH first."
                };
            }


            // Only set a minimum gas limit, don't override if higher
            if (!sendCallData.gasLimit || BigInt(sendCallData.gasLimit.toString()) < BigInt(400000)) {
                sendCallData.gasLimit = "400000";
            } else {
                addToActionLogs(`Using Swing-provided gas limit: ${sendCallData.gasLimit}`);
            }

            // // Keep Swing's gas price parameters if present
            // if (!sendCallData.maxFeePerGas) {
            //     sendCallData.maxFeePerGas = ethers.parseUnits("10", "gwei").toString();
            // }
            // if (!sendCallData.maxPriorityFeePerGas) {
            //     sendCallData.maxPriorityFeePerGas = ethers.parseUnits("5", "gwei").toString();
            // }

            userFriendlyStep = "Sending swap transaction";
            addToActionLogs(userFriendlyStep, true);

            //  let nonce = await provider.getTransactionCount(walletAddress);

            //  sendCallData.nonce = nonce + 2;

            if (!sendCallData.maxFeePerGas || BigInt(sendCallData.maxFeePerGas) < ethers.parseUnits("1", "gwei")) {
                sendCallData.maxFeePerGas = ethers.parseUnits("1", "gwei").toString();
            }

            if (!sendCallData.maxPriorityFeePerGas || BigInt(sendCallData.maxPriorityFeePerGas) < ethers.parseUnits("1", "gwei")) {
                sendCallData.maxPriorityFeePerGas = ethers.parseUnits("1", "gwei").toString();
            }

            // sendCallData.maxFeePerGas = ethers.parseUnits("2", "gwei").toString();
            // sendCallData.maxPriorityFeePerGas = ethers.parseUnits("2", "gwei").toString();

            // delete sendCallData.gasPrice;
            // sendCallData.gasLimit = "600000";
            
            const nonce = await provider.getTransactionCount(walletAddress, "latest");
            sendCallData.nonce = nonce;

            if (sendCallData.maxFeePerGas || sendCallData.maxPriorityFeePerGas) {
                delete sendCallData.gasPrice;
            }

            const transactionSend = await senderWallet.sendTransaction(sendCallData);

            // const walletBalanceEth = await cryptoService.getWalletBalance(walletAddress, "ETH");
            // addToActionLogs(`Wallet balance: ${walletBalanceEth.formattedBalance} ${walletBalanceEth.currency}`);

            //TODO: Check if the wallet balance is enough to pay the commission

            try {
                console.log(`${logPrefix}Transaction send: ${this.jsonStringifyWithBigIntAsNumber(transactionSend)}`);
            }
            catch (error: any) {
                console.error(`${logPrefix}Error sending swap transaction: ${error.message}`);
            }

            userFriendlyStep = "Waiting for transaction to be mined. This will take max 1 minute. Tx: " + transactionSend.hash;
            addToActionLogs(userFriendlyStep, true);

            // const receipt = await transactionSend.wait();

            const receipt = await this.withTimeout(transactionSend.wait(), 30000, "Transaction confirmation timed out");

            addToActionLogsWithData('Transaction send receipt:', receipt);

            const companyCommissionWallet = process.env.COMPANY_COMMISSION_WALLET as `0x${string}`;
            var actualCommissionAmountPaidInEth = 0.0;
            var commissionAmountInEth = 0.0;


            if (receipt != null && receipt.status === 1) {
                var commissionTxResponse: ethers.TransactionResponse | null = null;
                var commissionResponsePromise: Promise<ethers.TransactionReceipt | null> | null = null;

                try {
                    addToActionLogs("Sending commission to company wallet");

                    const commissionAmountResult = await cryptoService.getCommissionAmount(logPrefix, addToActionLogs);
                    commissionAmountInEth = commissionAmountResult.commissionAmountInEth;
                    const commissionAmount = commissionAmountResult.commissionAmount;

                    commissionTxResponse = await senderWallet.sendTransaction({
                        to: companyCommissionWallet,
                        value: commissionAmount,
                        data: ethers.hexlify(ethers.toUtf8Bytes("Peasy - Swap Commission"))
                    });

                    addToActionLogs(`Commission transaction sent: ${commissionTxResponse.hash}`);
                    commissionResponsePromise = commissionTxResponse.wait();
                } catch (commissionError) {
                    const commissionErrorMessage = commissionError instanceof Error ? commissionError.message : String(commissionError);
                    // Don't fail the overall transaction if commission fails
                    addToActionLogs(`Commission transaction failed: ${commissionErrorMessage}`);
                }

                var resultSwapDetails = null;

                try {
                    resultSwapDetails = await this.extractSwapDetailsFromReceipt(receipt, tokenFrom, tokenTo, provider);

                    if (!resultSwapDetails.isSuccess || resultSwapDetails.actualAmountReceivedStr == null || resultSwapDetails.actualAmountReceivedStr == "0"
                        || resultSwapDetails.actualAmountSentStr == null || resultSwapDetails.actualAmountSentStr == "0") {

                            resultSwapDetails = await this.getSwapDetailsFromTx(
                            transactionSend.hash,
                            tokenFrom,
                                tokenTo
                            );
            
                    }

                    addToActionLogs("ResultSwapDetails: " + this.jsonStringifyWithBigIntAsNumber(resultSwapDetails));
                } catch (error: any) {
                    addToActionLogs("Error getting swap details from tx: " + error.message, false);

                    resultSwapDetails = {
                        actualAmountSent: amount,
                        actualAmountReceived: 0,
                        gasFeeInNativeToken: "N/A",
                        actualSwapRateStr: "N/A",
                        actualAmountSentStr: "N/A",
                        actualAmountReceivedStr: "N/A"
                    }
                }

                if (commissionTxResponse != null) {
                    var commissionReceipt = await commissionResponsePromise;
                    addToActionLogs("Commission tx hash: " + commissionTxResponse.hash + ", Status: " + (commissionReceipt?.status == 1 ? "SUCCESS" : "FAILED"));

                    if (commissionReceipt != null && commissionReceipt.status == 1) {
                        actualCommissionAmountPaidInEth = parseFloat(commissionAmountInEth.toString());
                    }
                }

                const { actualAmountSent, actualAmountReceived, gasFeeInNativeToken, actualSwapRateStr, actualAmountSentStr, actualAmountReceivedStr } = resultSwapDetails;

                const actualSwapRate = actualAmountReceived / actualAmountSent;

                return {
                    isSuccess: true,
                    tokenFrom,
                    tokenTo,
                    receipt,
                    txHash: transactionSend.hash,
                    amountReceived: amountToReceive,
                    actualAmountReceived,
                    swapRate: swapRate,
                    actualSwapRate,
                    totalFeeInUsd: totalFeeInUsd,
                    gasFeeInNativeToken,
                    actualSwapRateStr,
                    actualAmountSentStr,
                    actualAmountReceivedStr,
                    actionLogs,
                    actualCommissionAmountPaidInEth,
                    companyCommissionWallet
                };
            }
            else {
                throw new Error('Transaction failed. Tx: ' + transactionSend.hash);
            }
        }
        catch (error: unknown) {
            console.log("Error: " + this.jsonStringifyWithBigIntAsNumber(error));

            if ((error as any).code == "INSUFFICIENT_FUNDS") {
                const details = (error as any).info.error.message;
                return {
                    isSuccess: false,
                    error: "Insufficient funds. Please add more funds to your wallet and try again."
                        + (details ? "\nDetails: " + details : "")
                };
            } else if ((error as any).code != null) {
                const details = (error as any).shortMessage;

                if (details.includes("transaction execution reverted")) {
                    return {
                        isSuccess: false,
                        error: "An error occurred while executing the transaction and transaction was reverted.\nThis might happen when currency pair is not very common or when market is not very liquid.\nTry converting to ETH first."
                    };
                }

                return {
                    isSuccess: false,
                    error: "An error occurred. Please try again."
                        + (details ? "\nDetails: " + details : "")
                };
            }


            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error occurred in step ' + userFriendlyStep + ': ' + errorMessage);
            const userFriendlyErrorMessage = 'Ops! Error occurred in step: ' + userFriendlyStep + '. Please check your wallet balance and try again.' + (errorMessage ? "\nDetails: " + errorMessage : "");
            return {
                isSuccess: false,
                error: userFriendlyErrorMessage
            };
        }
    }

    // // Function to get recommended gas values from recent successful transactions
    // private async getBaseNetworkRecommendedGas(provider: ethers.Provider): Promise<{
    //     maxFeePerGas: bigint,
    //     maxPriorityFeePerGas: bigint,
    //     gasLimit: bigint
    // }> {
    //     try {
    //         // Get the latest block
    //         const latestBlock = await provider.getBlock("latest");
    //         if (!latestBlock || !latestBlock.transactions.length) {
    //             throw new Error("Latest block or transactions not available");
    //         }

    //         // Get details of the most recent transactions (last 5)
    //         const recentTxHashes = latestBlock.transactions.slice(-5);
    //         const txPromises = recentTxHashes.map(hash => provider.getTransaction(hash));
    //         const transactions = await Promise.all(txPromises);
            
    //         // Filter successful transactions with gas data
    //         const validTxs = transactions.filter(tx => 
    //             tx && tx.maxFeePerGas && tx.maxPriorityFeePerGas);
            
    //         if (!validTxs.length) {
    //             throw new Error("No recent transactions with valid gas data");
    //         }
            
    //         // Calculate average gas values from recent transactions (with a buffer)
    //         let totalMaxFeePerGas = 0n;
    //         let totalMaxPriorityFeePerGas = 0n;
    //         let totalGasLimit = 0n;
    //         let count = 0;
            
    //         for (const tx of validTxs) {
    //             if (tx && tx.maxFeePerGas && tx.maxPriorityFeePerGas) {
    //                 totalMaxFeePerGas += BigInt(tx.maxFeePerGas.toString());
    //                 totalMaxPriorityFeePerGas += BigInt(tx.maxPriorityFeePerGas.toString());
    //                 if (tx.gasLimit) totalGasLimit += BigInt(tx.gasLimit.toString());
    //                 count++;
    //             }
    //         }
            
    //         if (count === 0) {
    //             throw new Error("No valid gas data found in recent transactions");
    //         }
            
    //         // Calculate averages with a 20% buffer for better chances of execution
    //         const avgMaxFeePerGas = (totalMaxFeePerGas / BigInt(count)) * 12n / 10n;
    //         const avgMaxPriorityFeePerGas = (totalMaxPriorityFeePerGas / BigInt(count)) * 12n / 10n;
    //         const avgGasLimit = totalGasLimit > 0n ? (totalGasLimit / BigInt(count)) * 12n / 10n : BigInt(300000);
            
    //         return {
    //             maxFeePerGas: avgMaxFeePerGas * 10n / 15n,
    //             maxPriorityFeePerGas: avgMaxPriorityFeePerGas * 10n / 15n,
    //             gasLimit: avgGasLimit * 10n / 15n
    //         };
    //     } catch (error) {
    //         console.error("Error getting Base network gas recommendations:", error);
    //         // Fallback to Base-specific values
    //         return {
    //             maxFeePerGas: ethers.parseUnits("5", "gwei"),
    //             maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
    //             gasLimit: BigInt(300000)
    //         };
    //     }
    // }

    public async listAndCancelPendingTransactions(walletAddress: string): Promise<any> {
        const cryptoService = new CryptoService(this.prisma);
        const provider = await cryptoService.getDefaultRpcProvider();
        const privateKey = await cryptoService.getWalletPrivateKey(walletAddress);
        const wallet = new ethers.Wallet(privateKey, provider);
        
        // Get the latest on-chain nonce
        const currentNonce = await provider.getTransactionCount(walletAddress, "latest");
        
        // Get the next nonce that would be used for a new transaction (includes pending)
        const pendingNonce = await provider.getTransactionCount(walletAddress, "pending");
        
        console.log(`Current confirmed nonce: ${currentNonce}`);
        console.log(`Pending nonce: ${pendingNonce}`);
        
        // If these are different, you have pending transactions
        const pendingTxCount = pendingNonce - currentNonce;
        console.log(`You have ${pendingTxCount} pending transactions`);
        
        const results: {
            pendingTxCount: number;
            canceledTxs: Array<{nonce: number; cancelTxHash?: string; error?: string}>;
        } = {
            pendingTxCount,
            canceledTxs: []
        };
        
        // Cancel all pending transactions by sending 0 ETH transactions with higher gas
        for (let nonce = currentNonce; nonce < pendingNonce; nonce++) {
            console.log(`Canceling transaction with nonce ${nonce}`);
            
            try {
                // Send a 0 ETH transaction to yourself with higher gas price to replace the pending tx
                const cancelTx = await wallet.sendTransaction({
                    to: walletAddress, // Send to yourself
                    value: 0, // 0 ETH
                    nonce: nonce,
                    maxFeePerGas: ethers.parseUnits("3", "gwei"), // Higher gas price than original
                    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
                    gasLimit: 21000 // Minimum gas for a simple transaction
                });
                
                console.log(`Cancellation transaction sent: ${cancelTx.hash}`);
                results.canceledTxs.push({
                    nonce,
                    cancelTxHash: cancelTx.hash
                });
                
                // Wait for confirmation if needed
                // const receipt = await cancelTx.wait();
                // console.log(`Cancellation confirmed in block ${receipt.blockNumber}`);
            } catch (error) {
                console.error(`Error canceling transaction with nonce ${nonce}:`, error);
                results.canceledTxs.push({
                    nonce,
                    error: (error as any).message
                });
            }
        }
        
        return results;
    }
}