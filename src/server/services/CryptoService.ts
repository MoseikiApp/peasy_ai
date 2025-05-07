import { ethers } from 'ethers';
import crypto from 'crypto';
import { createClient, type RedisClientType } from 'redis';
import { Coinbase, Wallet } from "@coinbase/coinbase-sdk";
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

// Add the Trade type to avoid linter errors
type Trade = {
  id?: string;
  toAssetAmount?: number;
  status?: string;
  [key: string]: any;
};

export class CryptoService {
  private prisma: any;

  constructor(prisma: any) {
    this.prisma = prisma;
  }

  /**
   * Get a user's wallet by userId
   * @param userId The ID of the user
   * @returns The wallet object or null if not found
   */
  async getWallet(userId: string): Promise<any> {
    const wallet = await this.prisma.userWallet.findUnique({
      where: {
        userId
      }
    });

    return wallet;
  }

  /**
   * Get the wallet address for a user
   * @param userId The ID of the user
   * @returns The wallet address as a string or null if no wallet found
   */
  async getWalletAddress(userId: string): Promise<string | null> {
    const wallet = await this.getWallet(userId);

    if (!wallet) {
      return null;
    }

    return wallet.address;
  }


  async sendCryptoToken(
    fromAddress: string,
    toAddress: string,
    amount: number,
    currency: string,
    accountId: string,  // User account ID who initiated the transaction,
    approvalType: string
  ): Promise<any> {
    let financialActionId: string | null = null;

    try {
      const logPrefix = `[CryptoService.sendCryptoToken] `;

      console.log(`${logPrefix}Sending ${amount} ${currency} from ${fromAddress} to ${toAddress}`);

      // Get the RPC provider URL from the database
      // const rpcProvider = await this.prisma.rpcProvider.findUnique({
      //   where: {
      //     currency: currency
      //   }
      // });

      // if (!rpcProvider) {
      //   throw new Error(`RPC provider not found for currency: ${currency}`);
      // }

            // // Set up provider
            // const provider = new ethers.JsonRpcProvider(rpcProvider.networkUrl);

      const provider = await this.getDefaultRpcProvider();




      // Get network chain ID
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      // Get token contract address using our new method
      const contractAddress = await this.getTokenContractAddress(currency, chainId);
      const networkName = network.name;
      // Create a new financial action record
      const financialAction = await this.prisma.financialChatAction.create({
        data: {
          accountId: accountId,
          actionType: 'CRYPTO_TRANSFER',
          actionInputCurrency: currency,
          actionInputNetwork: networkName,
          actionInputWallet: fromAddress,
          actionOutputCurrency: currency,
          actionOutputWallet: toAddress,
          actionOutputNetwork: networkName,
          actionApprovalType: approvalType,
          actionResult: 'PROCESSING',
          actionResultData: JSON.stringify({
            status: 'PROCESSING',
            message: `Initiating transfer of ${amount} ${currency} from ${fromAddress} to ${toAddress}`
          }),
          actionResultUserFriendlyMessage: `Processing your transfer of ${amount} ${currency}...`
        }
      });

      financialActionId = financialAction.id;

      // Define ERC20 Token ABI - only the methods we need
      const erc20Abi = [
        {
          name: 'approve',
          type: 'function',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          outputs: [{ type: 'bool' }],
          stateMutability: 'nonpayable'
        },
        {
          name: 'decimals',
          type: 'function',
          inputs: [],
          outputs: [{ type: 'uint8' }],
          stateMutability: 'view'
        },
        {
          name: 'balanceOf',
          type: 'function',
          inputs: [{ name: 'owner', type: 'address' }],
          outputs: [{ type: 'uint256' }],
          stateMutability: 'view'
        },
        {
          name: 'transfer',
          type: 'function',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          outputs: [{ type: 'bool' }],
          stateMutability: 'nonpayable'
        }
      ];

      // Create contract instance with proper typing
      const tokenContract = new ethers.Contract(
        contractAddress,
        erc20Abi,
        provider
      ) as ethers.Contract & {
        decimals(): Promise<number>;
        balanceOf(address: string): Promise<bigint>;
      };

      // Get token decimals
      const decimals = await tokenContract.decimals();

      // Get wallet balance before transaction
      const balanceBefore = await tokenContract.balanceOf!(fromAddress);

      // Get the sender's secret key
      const senderSecretKey = await this.getWalletPrivateKey(fromAddress);

      // Create a wallet instance with the sender's secret key
      const senderWallet = new ethers.Wallet(senderSecretKey, provider);

      // Connect the contract to the signer
      const tokenWithSigner = tokenContract.connect(senderWallet) as ethers.Contract & {
        transfer(to: string, amount: bigint): Promise<any>;
      };

      // Parse the token amount with the correct decimals
      const tokenAmount = ethers.parseUnits(amount.toString(), decimals);

      // Send the token transfer transaction
      const tx = await tokenWithSigner.transfer(toAddress, tokenAmount);

      // Wait for the transaction to be mined
      const txReceipt = await tx.wait();
      const txHash = txReceipt?.hash;

      console.log(`${logPrefix}Transaction receipt: ${JSON.stringify(txReceipt)}`);

      // Get wallet balance after transaction
      const balanceAfter = await tokenContract.balanceOf(fromAddress);
      const recipientBalanceAfter = await tokenContract.balanceOf(toAddress);

            var commissionResult = {
        actualCommissionAmountPaidInEth: 0.0,
        companyCommissionWallet: process.env.COMPANY_COMMISSION_WALLET
      };

      var txSuccess = txReceipt != null && txReceipt.status == 1;

      if (txSuccess) {
        const addToActionLogs = (message: string) => {
          console.log(`${logPrefix}${message}`);
        };

        commissionResult = await this.sendCommission(
          senderWallet,
          logPrefix,
          addToActionLogs
        );
      }

      const actionResultUserFriendlyMessage = txSuccess ? `Successfully sent ${amount} ${currency} to ${toAddress}. Transaction hash: ${txHash}` 
      : `Failed to send ${amount} ${currency}: ${txReceipt?.status == 1 ? "SUCCESS" : "FAILED"  }`;

      // Update financial action with success status
      await this.prisma.financialChatAction.update({
        where: { id: financialActionId },
        data: {
          actionResult: txSuccess ? 'SUCCESS' : 'FAILED',
          actionResultData: JSON.stringify({
            status: txSuccess ? 'SUCCESS' : 'FAILED',
            txHash: txHash,
            amountSent: amount,
            receipt: txReceipt
          }),
          actionResultUserFriendlyMessage: actionResultUserFriendlyMessage,
          actionResultDate: new Date(),
          actionInputWalletBalanceBefore: parseFloat(ethers.formatUnits(balanceBefore, decimals)),
          actionInputWalletBalanceAfter: parseFloat(ethers.formatUnits(balanceAfter, decimals)),
          actionOutputWalletBalanceBefore: null, // We don't have this information
          actionOutputWalletBalanceAfter: parseFloat(ethers.formatUnits(recipientBalanceAfter, decimals)),
          commissionAmountInEth: commissionResult.actualCommissionAmountPaidInEth,
          commissionWalletAddress: commissionResult.companyCommissionWallet
        }
      });

      const result = {
        amountSent: amount,
        txHash: txHash,
        financialActionId: financialActionId
      };

      return result;
    } catch (error: any) {
      console.error(`Error sending crypto token: ${error}`);

      // Update financial action with error status if it was created
      if (financialActionId) {
        await this.prisma.financialChatAction.update({
          where: { id: financialActionId },
          data: {
            actionResult: 'ERROR',
            actionResultData: JSON.stringify({
              status: 'ERROR',
              error: error.message,
              stack: error.stack
            }),
            actionResultUserFriendlyMessage: `Failed to send ${amount} ${currency}: ${error.message}`,
            actionResultDate: new Date()
          }
        });
      }

      throw error;
    }
  }

  // Helper method to get the sender's secret key (implementation depends on your security approach)
  public async getWalletPrivateKey(fromAddress: string): Promise<string> {
    // This is a placeholder - you would need to implement a secure way to retrieve the private key
    // For example, you might look up the wallet in your database, get the keySalt,
    // and then decrypt the private key using the salt and a master key

    // Example implementation:
    const wallet = await this.prisma.userWallet.findFirst({
      where: {
        address: fromAddress
      }
    });

    if (!wallet) {
      throw new Error(`Wallet not found for address: ${fromAddress}`);
    }

    // Decode the secret key using the stored salt
    const encodedSecretKey = wallet.encodedPrivateKey;
    const secretKeyHex = this.decodeSecretKey(encodedSecretKey, process.env.KEY_SALT || '');

    // Convert the hex string back to a private key format
    return '0x' + secretKeyHex;
  }


  // Helper method to get the sender's secret key (implementation depends on your security approach)
  private async getWalletMnemonic(fromAddress: string): Promise<string> {
    // This is a placeholder - you would need to implement a secure way to retrieve the private key
    // For example, you might look up the wallet in your database, get the keySalt,
    // and then decrypt the private key using the salt and a master key

    // Example implementation:
    const wallet = await this.prisma.userWallet.findFirst({
      where: {
        address: fromAddress
      }
    });

    if (!wallet) {
      throw new Error(`Wallet not found for address: ${fromAddress}`);
    }

    // Decode the secret key using the stored salt
    const encodedMnemonic = wallet.encodedMnemonic;
    const mnemonic = this.decodeMnemonic(encodedMnemonic);

    // Convert the hex string back to a private key format
    return mnemonic;
  }

  public async sendCommission(
    senderWallet: ethers.Wallet,
    logPrefix: string,
    addToActionLogs: (message: string) => void
  ): Promise<{
    commissionTxResponse: ethers.TransactionResponse | null;
    commissionReceipt: ethers.TransactionReceipt | null;
    actualCommissionAmountPaidInEth: number;
    companyCommissionWallet: string | undefined;
  }> {
    try {
      var actualCommissionAmountPaidInEth = 0.0;
      addToActionLogs("Sending commission to company wallet");
      const companyCommissionWallet = process.env.COMPANY_COMMISSION_WALLET;
      const commissionAmountResult = await this.getCommissionAmount(logPrefix, addToActionLogs);
      const commissionAmountInEth = commissionAmountResult.commissionAmountInEth;
      const commissionAmount = commissionAmountResult.commissionAmount;

      const commissionTxResponse = await senderWallet.sendTransaction({
        to: companyCommissionWallet,
        value: commissionAmount,
        data: ethers.hexlify(ethers.toUtf8Bytes("Peasy - Swap Commission"))
      });

      addToActionLogs(`Commission transaction sent: ${commissionTxResponse.hash}`);
      const commissionReceipt = await commissionTxResponse.wait();

      if (commissionTxResponse != null) {
        addToActionLogs("Commission tx hash: " + commissionTxResponse.hash + ", Status: " + (commissionReceipt?.status == 1 ? "SUCCESS" : "FAILED"));

        if (commissionReceipt != null && commissionReceipt.status == 1) {
          actualCommissionAmountPaidInEth = parseFloat(commissionAmountInEth.toString());
        }
      }

      return {
        commissionTxResponse,
        commissionReceipt,
        actualCommissionAmountPaidInEth,
        companyCommissionWallet
      };
    } catch (commissionError) {
      const commissionErrorMessage = commissionError instanceof Error ? commissionError.message : String(commissionError);
      // Don't fail the overall transaction if commission fails
      addToActionLogs(`Commission transaction failed: ${commissionErrorMessage}`);

      return {
        commissionTxResponse: null,
        commissionReceipt: null,
        actualCommissionAmountPaidInEth: 0.0,
        companyCommissionWallet: process.env.COMPANY_COMMISSION_WALLET
      };
    }
  }

  public async getCommissionAmount(
    logPrefix: string,
    addToActionLogs: (message: string) => void
  ): Promise<{
    commissionAmountInEth: number;
    commissionAmount: bigint;
  }> {
    var ethUsdRate = null;
    var commissionAmountInEth = 0.0;

    const defaultEthUsdRate = 0.00001;
    const minEthCommission = 0.0000005;
    const maxEthCommission = 0.000005;

    try {
      const ethUsdRateResult = await this.getCryptoRate("usd", "eth");

      if (ethUsdRateResult.rate > 0) {
        ethUsdRate = ethUsdRateResult.rate;

      }
      else {
        ethUsdRate = defaultEthUsdRate;
        console.error(`${logPrefix} ETH USD rate is invalid. Using default rate of ` + defaultEthUsdRate);
      }

      addToActionLogs(`${logPrefix}ETH USD rate for commission: ${ethUsdRate}`);
    }
    catch (error: any) {
      console.error(`${logPrefix}Error getting ETH USD rate: ${error.message}. Using default rate of ` + defaultEthUsdRate);
      ethUsdRate = defaultEthUsdRate;
    }



    const commissionAmountInUsdc = 0.0025;
    commissionAmountInEth = commissionAmountInUsdc * ethUsdRate;

    if (commissionAmountInEth < minEthCommission) {
      commissionAmountInEth = minEthCommission;
      console.error(`${logPrefix} Commission amount in ETH is less than minimum commission. Using minimum commission ` + minEthCommission);
    }

    if (commissionAmountInEth > maxEthCommission) {
      commissionAmountInEth = maxEthCommission;
      console.error(`${logPrefix} Commission amount in ETH is greater than maximum commission. Using maximum commission ` + maxEthCommission);
    }


    addToActionLogs(`${logPrefix}Commission amount in ETH: ${commissionAmountInEth}`);


    const commissionAmount = ethers.parseEther(commissionAmountInEth.toFixed(18));

    return {
      commissionAmountInEth,
      commissionAmount
    };
  }


  async sendNativeToken(
    fromAddress: string,
    toAddress: string,
    amount: number,
    currency: string,
    accountId: string,
    approvalType: string
  ): Promise<any> {
    let financialActionId: string | null = null;

    try {
      const logPrefix = `[CryptoService.sendNativeToken] `;

      console.log(`${logPrefix}Sending ${amount} ${currency} from ${fromAddress} to ${toAddress}`);

      // // Get the RPC provider URL from the database based on the currency
      // const rpcProvider = await this.prisma.rpcProvider.findUnique({
      //   where: {
      //     currency: currency
      //   }
      // });

      // if (!rpcProvider) {
      //   throw new Error(`RPC provider not found for currency: ${currency}`);
      // }

      // // Get wallet balance before transaction
      // const provider = new ethers.JsonRpcProvider(rpcProvider.networkUrl);

      const provider = await this.getDefaultRpcProvider();

      const balanceBefore = await provider.getBalance(fromAddress);

      if (balanceBefore < ethers.parseEther(amount.toFixed(18))) {
        throw new Error(`Insufficient balance for native token transfer. Current balance: ${ethers.formatEther(balanceBefore)} ${currency}`);
      }

      const network = await provider.getNetwork();

      // Create a new financial action record
      const financialAction = await this.prisma.financialChatAction.create({
        data: {
          accountId: accountId,
          actionType: 'NATIVE_TRANSFER',
          actionInputCurrency: currency,
          actionInputNetwork: network.name,
          actionInputWallet: fromAddress,
          actionOutputCurrency: currency,
          actionOutputWallet: toAddress,
          actionOutputNetwork: network.name,
          actionApprovalType: approvalType,
          actionResult: 'PROCESSING',
          actionResultData: JSON.stringify({
            status: 'PROCESSING',
            message: `Initiating transfer of ${amount} ${currency} from ${fromAddress} to ${toAddress}`
          }),
          actionResultUserFriendlyMessage: `Processing your transfer of ${amount} ${currency}...`
        }
      });

      financialActionId = financialAction.id;



      // Get the sender's secret key
      const senderSecretKey = await this.getWalletPrivateKey(fromAddress);

      // Create a wallet instance with the sender's secret key
      const senderWallet = new ethers.Wallet(senderSecretKey, provider);

      // Get the current nonce for the sender's address
      const nonce = await provider.getTransactionCount(fromAddress);

      // Send the transaction
      const tx = await senderWallet.sendTransaction({
        to: toAddress,
        value: ethers.parseEther(amount.toFixed(18)),
        nonce: nonce,
        data: ethers.hexlify(ethers.toUtf8Bytes("Peasy - Transfer Native Token"))
      });

      // Wait for the transaction to be mined
      const txReceipt = await tx.wait();
      const txHash = txReceipt?.hash;

      console.log(`${logPrefix}Transaction receipt: ${JSON.stringify(txReceipt)}`);

      // Get wallet balance after transaction
      const balanceAfter = await provider.getBalance(fromAddress);
      const recipientBalanceAfter = await provider.getBalance(toAddress);

      var commissionResult = {
        actualCommissionAmountPaidInEth: 0.0,
        companyCommissionWallet: process.env.COMPANY_COMMISSION_WALLET
      };

      var txSuccess = txReceipt != null && txReceipt.status == 1;

      if (txSuccess) {
        const addToActionLogs = (message: string) => {
          console.log(`${logPrefix}${message}`);
        };

        commissionResult = await this.sendCommission(
          senderWallet,
          logPrefix,
          addToActionLogs
        );
      }

      const actionResultUserFriendlyMessage = txSuccess ? `Successfully sent ${amount} ${currency} to ${toAddress}. Transaction hash: ${txHash}` 
      : `Failed to send ${amount} ${currency}: ${txReceipt?.status == 1 ? "SUCCESS" : "FAILED"  }`;

      // Update financial action with success status
      await this.prisma.financialChatAction.update({
        where: { id: financialActionId },
        data: {
          actionResult: txSuccess ? 'SUCCESS' : 'FAILED',
          actionResultData: JSON.stringify({
            status: txSuccess ? 'SUCCESS' : 'FAILED',
            txHash: txHash,
            amountSent: amount,
            receipt: txReceipt
          }),
          actionResultUserFriendlyMessage: actionResultUserFriendlyMessage,
          actionResultDate: new Date(),
          actionInputWalletBalanceBefore: parseFloat(ethers.formatEther(balanceBefore)),
          actionInputWalletBalanceAfter: parseFloat(ethers.formatEther(balanceAfter)),
          actionOutputWalletBalanceBefore: null, // We don't have this information
          actionOutputWalletBalanceAfter: parseFloat(ethers.formatEther(recipientBalanceAfter)),
          commissionAmountInEth: commissionResult.actualCommissionAmountPaidInEth,
          commissionWalletAddress: commissionResult.companyCommissionWallet
        }
      });

      const result = {
        amountSent: amount,
        txHash: txHash,
        financialActionId: financialActionId,
        explorerUrl: "https://basescan.org/tx/" + txHash
      };

      return result;
    } catch (error: any) {
      console.error(`Error sending native token: ${error}`);

      // Update financial action with error status if it was created
      if (financialActionId) {
        await this.prisma.financialChatAction.update({
          where: { id: financialActionId },
          data: {
            actionResult: 'ERROR',
            actionResultData: JSON.stringify({
              status: 'ERROR',
              error: error.message,
              stack: error.stack
            }),
            actionResultUserFriendlyMessage: `Failed to send ${amount} ${currency}: ${error.message}`,
            actionResultDate: new Date()
          }
        });
      }

      throw error;
    }
  }

  /**
   * Swap one cryptocurrency for another
   * @param walletAddress The wallet address to perform the swap
   * @param fromCurrency The source cryptocurrency
   * @param toCurrency The target cryptocurrency
   * @param amount The amount to swap
   * @returns Transaction details
   */
  async swapCrypto(walletAddress: string, fromCurrency: string, toCurrency: string, amount: number): Promise<{
    transactionHash: string;
    amountReceived: number;
    exchangeRate: number;
  }> {
    // Dummy implementation
    console.log(`Swapping ${amount} ${fromCurrency} to ${toCurrency} for wallet ${walletAddress}`);
    const exchangeRate = Math.random() * 100;
    const amountReceived = amount * exchangeRate;

    return {
      transactionHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
      amountReceived,
      exchangeRate
    };
  }

  /**
   * Buy cryptocurrency with fiat currency
   * @param walletAddress The wallet address to receive the cryptocurrency
   * @param currency The cryptocurrency to buy
   * @param amount The amount of fiat to spend
   * @param fiatCurrency The fiat currency to use (e.g., 'USD', 'EUR')
   * @returns Purchase details
   */
  async buyCrypto(walletAddress: string, currency: string, amount: number, fiatCurrency: string): Promise<{
    transactionId: string;
    cryptoAmount: number;
    rate: number;
    fees: number;
  }> {
    // Dummy implementation
    console.log(`Buying ${currency} with ${amount} ${fiatCurrency} for wallet ${walletAddress}`);
    const rate = Math.random() * 50000;
    const fees = amount * 0.01;
    const cryptoAmount = (amount - fees) / rate;

    return {
      transactionId: `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`,
      cryptoAmount,
      rate,
      fees
    };
  }

  /**
   * Get the current exchange rate for a cryptocurrency
   * @param fromCurrency The source currency (can be crypto or fiat)
   * @param toCurrency The target currency (can be crypto or fiat)
   * @returns The current exchange rate
   */
  async getCryptoRate(fromCurrency: string, toCurrency: string): Promise<{
    rate: number;
    timestamp: number;
  }> {
    console.log(`Getting exchange rate from ${fromCurrency} to ${toCurrency}`);

    try {
      // Format the currency pair for the prices API
      const currencyPair = `${fromCurrency}-${toCurrency}`;
      const requestPath = `/v2/prices/${currencyPair}/spot`;

      // Get authentication headers
      const headers = this.getCoinbaseAuthHeaders('GET', requestPath);

      // Make the HTTP request
      const response = await fetch(`https://api.coinbase.com${requestPath}`, {
        method: 'GET',
        headers
      });

      // console.log(`Response status: ${response.status} ${response.statusText}`);
      // console.log(`Response headers: ${JSON.stringify(Object.fromEntries(response.headers))}`);

      if (!response.ok) {
        console.log(`Response status text: ${response.statusText}`);
        const errorData = await response.json();
        throw new Error(`Coinbase API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const priceData = await response.json();
      console.log(`Price data: ${JSON.stringify(priceData)}`);
      const rate = parseFloat(priceData.data.amount);

      return {
        rate,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`Error getting crypto rate from Coinbase: ${error}`);
      throw error;
    }
  }

  /**
   * Encrypt a secret key using AES-256-CBC
   * @param secretKey The secret key to encode
   * @param salt Salt for key derivation
   * @returns Base64 encoded encrypted string
   */
  encodeSecretKey(secretKey: string, salt: string): string {
    if (!salt) {
      throw new Error('Salt is not provided');
    }

    // Derive an AES key from the salt
    const hash = crypto.createHash('sha256');
    hash.update(salt);
    const aesKey = hash.digest();  // AES-256 key

    // Create an initialization vector
    const iv = crypto.randomBytes(16); // AES block size for CBC mode is 16 bytes

    // Create cipher instance
    const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
    let encrypted = cipher.update(secretKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Concatenate IV and encrypted data, then encode to Base64
    const combined = iv.toString('hex') + ':' + encrypted;
    return Buffer.from(combined, 'utf8').toString('base64');
  }

  /**
   * Decrypt an encoded secret key
   * @param encodedSecretKey The encoded secret key
   * @param salt Salt used for key derivation
   * @returns Decrypted secret key
   */
  decodeSecretKey(encodedSecretKey: string, salt: string): string {
    if (!salt) {
      throw new Error('Salt is not provided');
    }

    // Derive the AES key from the salt
    const hash = crypto.createHash('sha256');
    hash.update(salt);
    const aesKey = hash.digest();  // AES-256 key

    // Decode from Base64 and split IV and encrypted data
    const combined = Buffer.from(encodedSecretKey, 'base64').toString('utf8');
    const parts = combined.split(':');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error('Invalid encoded secret key format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    // Create decipher instance
    const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Helper function to convert buffer to string
   * @param buffer Buffer to convert
   * @returns String representation of the buffer
   */
  private bufferToString(buffer: Buffer): string {
    return buffer.toString('hex');
  }

  /**
   * Create an Ethereum crypto wallet for a user
   * @param username The username
   * @param walletNetwork The blockchain network
   * @returns Wallet information
   */
  private async createEthCryptoWalletForUser(username: string, walletNetwork: string): Promise<{
    code: string;
    provider: string;
    encodedPrivateKey: string;
    encodedMnemonic: string;
    network: string;
  }> {
    console.log('Creating ETH crypto wallet for username', username);

    // Generate a random mnemonic (seed phrase)
    const wallet = ethers.Wallet.createRandom();
    const mnemonic = wallet.mnemonic?.phrase;

    if (!mnemonic) {
      throw new Error("Failed to generate mnemonic phrase");
    }

    // The private key is already derived from the mnemonic in the wallet
    const privateKey = wallet.privateKey;
    const address = wallet.address;

    // Convert private key to string format (without 0x prefix)
    const privateKeyHex = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;

    if (!process.env.KEY_SALT) {
      throw new Error("KEY_SALT is not set");
    }

    // Encode both the private key and mnemonic for secure storage
    const encodedPrivateKey = this.encodeSecretKey(privateKeyHex, process.env.KEY_SALT);
    const encodedMnemonic = this.encodeSecretKey(mnemonic, process.env.KEY_SALT);

    return {
      code: address,
      provider: "ETH",
      encodedPrivateKey: encodedPrivateKey,
      encodedMnemonic: encodedMnemonic,
      network: walletNetwork,
    };
  }

  private decodeMnemonic(encodedMnemonic: string): string {
    return this.decodeSecretKey(encodedMnemonic, process.env.KEY_SALT!);
  }

  private decodePrivateKey(encodedPrivateKey: string): string {
    return this.decodeSecretKey(encodedPrivateKey, process.env.KEY_SALT!);
  }

  /**
   * Create a crypto wallet for a user and store it in the database
   * @param userId The user ID
   * @param username The username
   * @param walletNetwork The blockchain network
   * @param currency The cryptocurrency
   * @returns The created wallet from the database
   * @throws Error if the user already has a wallet
   */
  async createCryptoWallet(userId: string, username: string, walletNetwork: string, currency: string): Promise<any> {

    console.log("***Creating new wallet for user", userId);

    const existingWallet = await this.getWallet(userId);
    if (existingWallet) {
      throw new Error(`User with ID ${userId} already has a wallet`);
    }

    // First create the wallet on the blockchain
    const walletInfo = await this.createEthCryptoWalletForUser(username, walletNetwork);

    // Then store it in the database
    const wallet = await this.prisma.userWallet.create({
      data: {
        userId: userId,
        address: walletInfo.code,
        provider: walletInfo.provider,
        network: walletInfo.network,
        currency: currency,
        encodedPrivateKey: walletInfo.encodedPrivateKey,
        encodedMnemonic: walletInfo.encodedMnemonic,
        isActive: true
      }
    });

    console.log("***Wallet created successfully. User ID: ", userId,
      "Username: ", username, "Wallet Network: ", walletNetwork, "Currency: ", currency, "Wallet Address: ", wallet.address);

    return wallet;
  }

  async getCryptoWalletCreateIfNotExists(userId: string, username: string, walletNetwork: string, currency: string): Promise<any> {
    var wallet = await this.getWallet(userId);

    if (wallet) {
      return wallet;
    }

    wallet = await this.createCryptoWallet(userId, username, walletNetwork, currency);
    return wallet;
  }
  /**
   * Update a user's wallet active status
   * @param userId The user ID
   * @param isActive The new active status
   * @returns The updated wallet
   * @throws Error if the user has no wallet
   */
  async updateWalletActiveStatus(userId: string, isActive: boolean): Promise<any> {
    const wallet = await this.getWallet(userId);
    if (!wallet) {
      throw new Error(`User with ID ${userId} does not have a wallet`);
    }

    return this.prisma.userWallet.update({
      where: {
        userId
      },
      data: {
        isActive
      }
    });
  }

  /**
   * Update the token registry with data from a standard registry
   * @param chainId The blockchain network ID
   * @returns Number of tokens updated
   */
  async updateTokenRegistry(chainId: number): Promise<number> {
    try {
      console.log(`[CryptoService.updateTokenRegistry] Updating tokens for chain ${chainId}`);

      // Fetch tokens from Uniswap's default list
      const tokenListUrl = 'https://gateway.ipfs.io/ipns/tokens.uniswap.org';
      const response = await fetch(tokenListUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch token list: ${response.statusText}`);
      }

      const tokenList = await response.json();
      const tokensForChain = tokenList.tokens.filter(
        (token: any) => token.chainId === chainId
      );

      if (tokensForChain.length === 0) {
        return 0;
      }

      // Delete existing tokens for this chain
      await this.prisma.cryptoErc20Token.deleteMany({
        where: { chainId }
      });

      // Insert new token data
      const result = await this.prisma.cryptoErc20Token.createMany({
        data: tokensForChain.map((token: any) => ({
          symbol: token.symbol,
          name: token.name,
          contractAddress: token.address,
          chainId: token.chainId,
          decimals: token.decimals,
          logoURI: token.logoURI,
          lastUpdated: new Date()
        })),
        skipDuplicates: true
      });

      return result.count;
    } catch (error) {
      console.error(`Error updating token registry: ${error}`);
      throw error;
    }
  }

  /**
   * Get token contract address for a given symbol and chain ID
   * @param symbol The token symbol
   * @param chainId The blockchain network ID
   * @returns Token contract address
   */
  async getTokenContractAddress(symbol: string, chainId: number): Promise<string> {
    try {
      symbol = symbol.toUpperCase();

      // If Base chain, try to get from baseTokenList.json first
      if (chainId === 8453) {
        const baseTokenAddress = this.getBaseChainTokenAddressFromList(symbol);
        if (baseTokenAddress) {
          return baseTokenAddress;
        }
      }

      // Try to get from database first
      const token = await this.prisma.cryptoErc20Token.findFirst({
        where: {
          symbol,
          chainId
        }
      });

      if (token?.contractAddress) {
        return token.contractAddress;
      }

      // If not in database, update the registry and try again
      await this.updateTokenRegistry(chainId);

      // Check again after update
      const updatedToken = await this.prisma.cryptoErc20Token.findFirst({
        where: {
          symbol,
          chainId
        }
      });

      if (updatedToken?.contractAddress) {
        return updatedToken.contractAddress;
      }

      // If still not found, try common tokens hardcoded as fallback
      const commonTokens: Record<string, Record<number, string>> = {
        'USDT': {
          1: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Ethereum
          56: '0x55d398326f99059fF775485246999027B3197955', // BSC
          137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // Polygon
        },
        'USDC': {
          1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum
          56: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // BSC
          137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Polygon
          8453: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // Base
        }
      };

      var contractAddress = commonTokens[symbol]?.[chainId];

      if (contractAddress) {
        // Save this to database for future
        await this.prisma.cryptoErc20Token.create({
          data: {
            symbol,
            name: symbol,
            contractAddress: contractAddress,
            chainId,
            decimals: 18,
            lastUpdated: new Date()
          }
        });

        return contractAddress;
      }

      throw new Error(`Token ${symbol} not found for chain ${chainId}`);
    } catch (error) {
      console.error(`Error getting token address: ${error}`);
      throw error;
    }
  }

  /**
   * Get wallet balance for native or ERC20 tokens
   * @param walletAddress The wallet address to check balance for
   * @param currency The currency symbol (e.g., 'ETH', 'USDT')
   * @returns The balance in human-readable format
   */
  async getWalletBalance(walletAddress: string, currency: string): Promise<{
    balance: number;
    formattedBalance: string;
    currency: string;
  }> {

    try {
      currency = currency.toUpperCase();
      // // Get the RPC provider URL from the database
      // var rpcProvider = await this.prisma.rpcProvider.findUnique({
      //   where: {
      //     currency: currency
      //   }
      // });

      // if (!rpcProvider) {
      //   rpcProvider = await this.prisma.rpcProvider.findUnique({
      //     where: {
      //       currency: "ETH"
      //     }
      //   });
      // }

      // if (!rpcProvider) {

      //   throw new Error(`RPC provider not found for currency: ${currency}`);
      // }

      // const provider = new ethers.JsonRpcProvider(rpcProvider.networkUrl);

      const provider = await this.getDefaultRpcProvider();
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      let balance: bigint;
      let decimals: number;

      // Check if this is a native token based on the provider configuration
      if (currency.toUpperCase() === "ETH") {
        // For native tokens like ETH, use getBalance directly
        balance = await provider.getBalance(walletAddress);
        decimals = 18; // Most native tokens use 18 decimals
      } else {
        // For ERC20 tokens, we need to use the contract
        const contractAddress = await this.getTokenContractAddress(currency, chainId);

        // Define ERC20 Token ABI - only the methods we need
        const erc20Abi = [
          {
            name: 'approve',
            type: 'function',
            inputs: [
              { name: 'spender', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ],
            outputs: [{ type: 'bool' }],
            stateMutability: 'nonpayable'
          },
          {
            name: 'decimals',
            type: 'function',
            inputs: [],
            outputs: [{ type: 'uint8' }],
            stateMutability: 'view'
          },
          {
            name: 'balanceOf',
            type: 'function',
            inputs: [{ name: 'owner', type: 'address' }],
            outputs: [{ type: 'uint256' }],
            stateMutability: 'view'
          }
        ];

        // Create contract instance with proper typing
        const tokenContract = new ethers.Contract(
          contractAddress,
          erc20Abi,
          provider
        ) as ethers.Contract & {
          decimals(): Promise<number>;
          balanceOf(address: string): Promise<bigint>;
        };

        // Get token decimals
        decimals = await tokenContract.decimals();

        // Get wallet balance
        balance = await tokenContract.balanceOf(walletAddress);
      }

      // Format the balance using the correct number of decimals
      const formattedBalance = ethers.formatUnits(balance, decimals);
      const numericBalance = parseFloat(formattedBalance);

      return {
        balance: numericBalance,
        formattedBalance: formattedBalance,
        currency: currency
      };
    } catch (error: any) {
      console.error(`Error getting wallet balance: ${error.message}`);
      throw error;
    }
  }

  async getWalletBalanceFromCoinbase(walletAddress: string, currency: string): Promise<any> {

    currency = currency.toUpperCase();
    try {
      Coinbase.configure({
        apiKeyName: process.env.COINBASE_API_KEY_NAME!,
        privateKey: process.env.COINBASE_API_KEY_PRIVATE!
      });
      const senderMnemonic = await this.getWalletMnemonic(walletAddress);
      const coinbaseWallet = await Wallet.import({
        mnemonicPhrase: senderMnemonic
      }, Coinbase.networks.BaseMainnet);

      const assetId = await this.getCoinbaseCurrencyAssetId(currency);
      console.log(`Asset ID for ${currency}: ${assetId}`);
      const balance = await coinbaseWallet.getBalance(currency);

      return {
        balance: balance.toString(),
        currency: currency.toUpperCase()
      };
    } catch (error: any) {
      console.error(`Error getting wallet balance from Coinbase: ${error.message}`);
      throw error;
    }
  }
  

  async getWalletBalanceForAllCoinsFromCoinbase(walletAddress: string): Promise<any> {
    try {
      Coinbase.configure({
        apiKeyName: process.env.COINBASE_API_KEY_NAME!,
        privateKey: process.env.COINBASE_API_KEY_PRIVATE!
      });
      const senderMnemonic = await this.getWalletMnemonic(walletAddress);
      const coinbaseWallet = await Wallet.import({
        mnemonicPhrase: senderMnemonic
      }, Coinbase.networks.BaseMainnet);

      const balances = await coinbaseWallet.listBalances();
      const balancesArray: any[] = [];
      var userFriendlyBalanceMessage = "";

      balances.forEach((balance, currency) => {
        balancesArray.push({
          currency: currency.toUpperCase(),
          balance: balance.toString() // Convert Decimal to string to avoid serialization issues
        });

        userFriendlyBalanceMessage += `${currency.toUpperCase()}: ${balance.toString()}\n`;
      });

      console.log(`Balances: ${JSON.stringify(balancesArray)}`);
      return {
        balances: balancesArray,
        userFriendlyBalanceMessage: userFriendlyBalanceMessage
      };

    } catch (error: any) {
      console.error(`Error getting wallet balances: ${error.message}`);
      throw error;
    }
  }

  async getWalletBalanceForAllCoinsFromCoinbaseWithTotalUsd(walletAddress: string): Promise<any> {
    try {
      Coinbase.configure({
        apiKeyName: process.env.COINBASE_API_KEY_NAME!,
        privateKey: process.env.COINBASE_API_KEY_PRIVATE!
      });
      const senderMnemonic = await this.getWalletMnemonic(walletAddress);
      const coinbaseWallet = await Wallet.import({
        mnemonicPhrase: senderMnemonic
      }, Coinbase.networks.BaseMainnet);

      const balances = await coinbaseWallet.listBalances();
      const balancesArray: any[] = [];
      var userFriendlyBalanceMessage = "";

      balances.forEach((balance, currency) => {
        balancesArray.push({
          currency: currency.toUpperCase(),
          balance: balance.toString() // Convert Decimal to string to avoid serialization issues
        });
      });

      var totalUsd = 0.0;
      for (var i = 0; i < balancesArray.length; i++) {
        const item = balancesArray[i];
        const rate = await this.getCryptoRate(item.currency, "USD");
        item.usd = item.balance * rate.rate;
        totalUsd += item.usd;
      }

      //sort balancesArray by usd in descending order
      balancesArray.sort((a, b) => b.usd - a.usd);

      for (var i = 0; i < balancesArray.length; i++) {
        const item = balancesArray[i];
        userFriendlyBalanceMessage += `${item.currency} ${item.balance} --> (${item.usd} USD)\n`;
      }

      userFriendlyBalanceMessage += `------\nTotal: ${totalUsd} USD`;
      console.log(`Balances: ${JSON.stringify(balancesArray)}`);
      return {
        balances: balancesArray,
        totalUsd: totalUsd,
        userFriendlyBalanceMessage: userFriendlyBalanceMessage
      };

    } catch (error: any) {
      console.error(`Error getting wallet balances: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch latest token profiles from DexScreener API and store them in Redis cache
   * @returns Number of token profiles fetched
   */
  async getRatesFromDex(): Promise<number> {
    try {
      const logPrefix = `[CryptoService.getRates] `;
      console.log(`${logPrefix}Fetching token profiles from DexScreener`);

      // Fetch token profiles from DexScreener API
      const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');

      if (!response.ok) {
        throw new Error(`Failed to fetch token profiles: ${response.statusText}`);
      }

      const tokenProfiles = await response.json();

      if (!Array.isArray(tokenProfiles) || tokenProfiles.length === 0) {
        console.warn(`${logPrefix}No token profiles found`);
        return 0;
      }

      // Connect to Redis using the redis client
      const redis = this.getRedisClient();

      await redis.connect();

      // Store token profiles in Redis with 60-second expiration
      const cacheKey = 'dexscreener:token-profiles';
      await redis.set(cacheKey, JSON.stringify(tokenProfiles), { EX: 60 });

      // Store last update timestamp
      await redis.set(`${cacheKey}:last-updated`, Date.now().toString(), { EX: 60 });

      // Create indexed access for faster lookups
      for (const profile of tokenProfiles) {
        if (profile.chainId && profile.tokenAddress) {
          const pairKey = `${profile.chainId}:${profile.tokenAddress}`.toLowerCase();
          await redis.set(`${cacheKey}:pair:${pairKey}`, JSON.stringify(profile), { EX: 60 });
        }
      }

      console.log(`${logPrefix}Cached ${tokenProfiles.length} token profiles in Redis`);

      // Close Redis connection
      await redis.quit();

      return tokenProfiles.length;
    } catch (error: any) {
      console.error(`Error fetching token profiles: ${error.message}`);
      throw error;
    }
  }

  getRedisClient(): RedisClientType {
    return createClient({
      url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
      socket: {
        tls: true
      }
    });
  }

  /**
   * Get exchange rate for a specific token pair
   * @param pairFrom The source token identifier (chainId:tokenAddress)
   * @param pairTo The target token identifier (chainId:tokenAddress)
   * @returns Token pair data if found
   */
  async getRate(pairFrom: string, pairTo: string): Promise<any> {
    try {
      const logPrefix = `[CryptoService.getRate] `;
      console.log(`${logPrefix}Getting rate for ${pairFrom} to ${pairTo}`);

      // Connect to Redis using the redis client
      const redis = this.getRedisClient();

      await redis.connect();

      const cacheKey = 'dexscreener:token-profiles';

      // Check if cache exists and is valid
      const lastUpdated = await redis.get(`${cacheKey}:last-updated`);
      const now = Date.now();

      // If cache doesn't exist or is expired (60 seconds), rebuild it
      if (!lastUpdated || (now - parseInt(lastUpdated)) > 60000) {
        console.log(`${logPrefix}Cache expired, rebuilding...`);
        await redis.quit();
        await this.getRatesFromDex();

        // Reconnect to Redis after rebuilding cache
        const newRedis = this.getRedisClient();

        await newRedis.connect();

        // Get pair data from cache
        const fromPairData = await newRedis.get(`${cacheKey}:pair:${pairFrom.toLowerCase()}`);
        const toPairData = await newRedis.get(`${cacheKey}:pair:${pairTo.toLowerCase()}`);

        await newRedis.quit();

        if (!fromPairData || !toPairData) {
          throw new Error(`Token pair data not found for ${pairFrom} or ${pairTo}`);
        }

        return {
          from: JSON.parse(fromPairData),
          to: JSON.parse(toPairData),
          timestamp: now
        };
      }

      // Get pair data from existing cache
      const fromPairData = await redis.get(`${cacheKey}:pair:${pairFrom.toLowerCase()}`);
      const toPairData = await redis.get(`${cacheKey}:pair:${pairTo.toLowerCase()}`);

      await redis.quit();

      if (!fromPairData || !toPairData) {
        throw new Error(`Token pair data not found for ${pairFrom} or ${pairTo}`);
      }

      return {
        from: JSON.parse(fromPairData),
        to: JSON.parse(toPairData),
        timestamp: now
      };
    } catch (error: any) {
      console.error(`Error getting token pair rate: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate Coinbase API authentication headers
   * @param method HTTP method (GET, POST, etc.)
   * @param requestPath API endpoint path
   * @param body Request body (empty string for GET requests)
   * @returns Object with Coinbase authentication headers
   */
  private getCoinbaseAuthHeaders(method: string, requestPath: string, body = ''): Record<string, string> {
    const apiKeyName = process.env.COINBASE_API_KEY_NAME!;
    const privateKey = process.env.COINBASE_API_KEY_PRIVATE!;

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = timestamp + method + requestPath + body;
    const hmac = crypto.createHmac('sha256', privateKey);
    const signature = hmac.update(message).digest('hex');

    return {
      'Content-Type': 'application/json',
      'CB-ACCESS-KEY': apiKeyName,
      'CB-ACCESS-SIGN': signature,
      'CB-ACCESS-TIMESTAMP': timestamp
    };
  }

  private encrypt(text: string, iv: Buffer) {
    const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'utf8');
    console.log(key.toString('hex'));
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    return cipher.update(text, "utf8", "hex") + cipher.final("hex");
  }

  private decrypt(encrypted: string, iv: Buffer) {
    const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'utf8');
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    return decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
  }

  /**
   * Get a quote for swapping one cryptocurrency for another using Coinbase API
   * @param fromCurrency The source cryptocurrency
   * @param toCurrency The target cryptocurrency
   * @param amount The amount to swap
   * @returns Quote information from Coinbase
   */
  async getSwapCryptoQuote(fromCurrency: string, toCurrency: string, amount: number, walletAddress: string): Promise<any> {
    console.log(`Getting swap quote from ${fromCurrency} to ${toCurrency} for amount ${amount}`);


    try {
      Coinbase.configure({
        apiKeyName: process.env.COINBASE_API_KEY_NAME!,
        privateKey: process.env.COINBASE_API_KEY_PRIVATE!
      });
      const senderMnemonic = await this.getWalletMnemonic(walletAddress);
      const coinbaseWallet = await Wallet.import({
        mnemonicPhrase: senderMnemonic
      }, Coinbase.networks.BaseMainnet);

      const iv = crypto.randomBytes(16);
      const encryptedWalletData = this.encrypt(JSON.stringify(coinbaseWallet.export()), iv);

      const ivString = iv.toString("hex");
      console.log("ivString: ", ivString, "encryptedWalletData", encryptedWalletData);



      const fromCurrencyId = await this.getCoinbaseAssetId(fromCurrency);
      console.log(`From currency ID for ${fromCurrency}: ${fromCurrencyId}`);
      const toCurrencyId = await this.getCoinbaseAssetId(toCurrency);
      console.log(`To currency ID for ${toCurrency}: ${toCurrencyId}`);

      const trade = await coinbaseWallet.createTrade({
        fromAssetId: fromCurrencyId,
        toAssetId: toCurrencyId,
        amount: amount
      });

      console.log(`Trade: ${JSON.stringify(trade)}`);

      return trade;

    } catch (error) {
      console.error(`Error getting swap quote from Coinbase: ${error}`);
      throw error;
    }
  }

  /**
   * Get asset ID for a specific cryptocurrency from Coinbase API
   * @param currency The cryptocurrency code (e.g., 'BTC', 'ETH')
   * @returns Asset ID for the given currency
   */
  async getCoinbaseCurrencyAssetId(currency: string): Promise<string> {
    try {
      currency = currency.toUpperCase();
      const logPrefix = `[CryptoService.getCoinbaseCurrencyAssetId] `;
      console.log(`${logPrefix}Getting asset ID for ${currency}`);

      // Connect to Redis
      const redis = this.getRedisClient();
      await redis.connect();

      const cacheKey = 'coinbase:currencies';
      const currencyCacheKey = `${cacheKey}:${currency}`;

      // Try to get asset ID from Redis cache first
      const cachedAssetId = await redis.get(currencyCacheKey);

      if (cachedAssetId) {
        console.log(`${logPrefix}Found cached asset ID for ${currency}: ${cachedAssetId}`);
        await redis.quit();
        return cachedAssetId;
      }

      // Check if we need to fetch all currencies
      const lastUpdated = await redis.get(`${cacheKey}:last-updated`);
      const now = Date.now();
      const oneHour = 3600000; // 1 hour in milliseconds

      // If cache doesn't exist or is expired (1 hour), fetch all currencies
      if (!lastUpdated || (now - parseInt(lastUpdated)) > oneHour) {
        console.log(`${logPrefix}Cache expired or not found, fetching currencies from Coinbase API`);

        // Fetch all crypto currencies from Coinbase API
        const response = await fetch('https://api.coinbase.com/v2/currencies/crypto');

        if (!response.ok) {
          throw new Error(`Failed to fetch currencies: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.data || !Array.isArray(data.data)) {
          throw new Error('Invalid response format from Coinbase API');
        }

        // Store all currencies in Redis with 1 hour expiration
        const currencies = data.data;

        // Store the full list
        await redis.set(cacheKey, JSON.stringify(currencies), { EX: 3600 });

        // Store last update timestamp
        await redis.set(`${cacheKey}:last-updated`, now.toString(), { EX: 3600 });

        // Store individual currencies by code for faster lookups
        for (const curr of currencies) {
          if (curr.code && curr.asset_id) {
            await redis.set(`${cacheKey}:${curr.code.toUpperCase()}`, curr.asset_id, { EX: 3600 });
          }
        }

        console.log(`${logPrefix}Cached ${currencies.length} currencies in Redis`);

        // Find the requested currency
        const targetCurrency = currencies.find((c: any) => c.code.toUpperCase() === currency);

        await redis.quit();

        if (!targetCurrency) {
          throw new Error(`Currency ${currency} not found in Coinbase API`);
        }

        return targetCurrency.asset_id;
      }

      // Fetch all currencies from cache and find the requested one
      const cachedCurrencies = await redis.get(cacheKey);

      if (!cachedCurrencies) {
        // This shouldn't happen, but just in case
        await redis.quit();
        throw new Error('Cache inconsistency: currencies list not found');
      }

      const currencies = JSON.parse(cachedCurrencies);
      const targetCurrency = currencies.find((c: any) => c.code.toUpperCase() === currency);

      if (!targetCurrency) {
        await redis.quit();
        throw new Error(`Currency ${currency} not found in cached currencies`);
      }

      // Cache this currency for future lookups
      await redis.set(currencyCacheKey, targetCurrency.asset_id, { EX: 3600 });

      await redis.quit();

      return targetCurrency.asset_id;
    } catch (error: any) {
      console.error(`Error getting Coinbase currency asset ID: ${error.message}`);
      throw error;
    }
  }

  // public getCoinbaseSupportedSwapCurrencies(): string[] {
  //   return ['eth', 'wei', 'gwei', 'usdc', 'weth', 'sol', 'lamport', 'eurc', 'cbbtc'];
  // }


  private async getCoinbaseAssetId(currency: string): Promise<string> {
    var id = await this.getCoinbaseCurrencyAssetId(currency);
    console.log("Currency: ", currency, "Asset id: ", id);
    return id;
    // Normalize to lowercase for case-insensitive matching
    const normalizedCurrency = currency.toLowerCase();

    switch (normalizedCurrency) {
      case 'eth':
        return Coinbase.assets.Eth;
      case 'wei':
        return Coinbase.assets.Wei;
      case 'gwei':
        return Coinbase.assets.Gwei;
      case 'usdc':
        return Coinbase.assets.Usdc;
      case 'weth':
        return Coinbase.assets.Weth;
      case 'sol':
        return Coinbase.assets.Sol;
      case 'lamport':
        return Coinbase.assets.Lamport;
      case 'eurc':
        return Coinbase.assets.Eurc;
      case 'cbbtc':
        return Coinbase.assets.Cbbtc;
      default:
        throw new Error(`Unsupported currency: ${currency}. Only eth, wei, gwei, usdc, weth, sol, lamport, eurc, and cbbtc are supported.`);
    }
  }

  /**
   * Generate a JWT token for Coinbase API authentication
   * @param requestMethod The HTTP request method (GET, POST, etc.)
   * @param requestHost The host URL for the request
   * @param requestPath The API endpoint path
   * @returns A JWT token for use in the Authorization header
   */
  generateJwtForCoinbase(requestMethod: string, requestHost: string, requestPath: string): string {
    const keyName = process.env.COINBASE_API_KEY_NAME!;
    const keySecret = process.env.COINBASE_API_KEY_SECRET!;
    const algorithm = 'ES256';

    // Construct the URI
    const uri = `${requestMethod} ${requestHost}${requestPath}`;

    // Create the JWT payload
    const payload = {
      iss: 'cdp',
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 120, // JWT expires in 120 seconds
      sub: keyName,
      uri,
    };

    // Create the JWT header
    const header = {
      alg: algorithm,
      kid: keyName,
      nonce: crypto.randomBytes(16).toString('hex'),
    };

    // Sign and return the JWT
    return jwt.sign(payload, keySecret, { algorithm, header });
  }

  /**
   * Create a new trade on Coinbase using the CDP API
   * @param walletAddress The wallet address to perform the trade
   * @param fromCurrency The source cryptocurrency
   * @param toCurrency The target cryptocurrency
   * @param amount The amount to swap
   * @param userId The ID of the user initiating the trade
   * @param approvalType The approval type for the trade
   * @returns The created trade details
   */
  async createTradeInCoinbase(
    walletAddress: string,
    fromCurrency: string,
    toCurrency: string,
    amount: number,
    userId: string,
    approvalType: string
  ): Promise<any> {
    let financialActionId: string | null = null;
    const logPrefix = `[CryptoService.createTradeInCoinbase] `;

    try {
      console.log(`${logPrefix}Creating trade from ${fromCurrency} to ${toCurrency} for amount ${amount}`);

      // Configure Coinbase SDK
      Coinbase.configure({
        apiKeyName: process.env.COINBASE_API_KEY_NAME!,
        privateKey: process.env.COINBASE_API_KEY_PRIVATE!
      });

      // Get wallet mnemonic
      const senderMnemonic = await this.getWalletMnemonic(walletAddress);

      // Create a new financial action record
      const financialAction = await this.prisma.financialChatAction.create({
        data: {
          accountId: userId,
          actionType: 'CRYPTO_SWAP',
          actionInputCurrency: fromCurrency,
          actionInputNetwork: 'Coinbase',
          actionInputWallet: walletAddress,
          actionOutputCurrency: toCurrency,
          actionOutputWallet: walletAddress,
          actionOutputNetwork: 'Coinbase',
          actionApprovalType: approvalType,
          actionResult: 'PROCESSING',
          actionResultData: JSON.stringify({
            status: 'PROCESSING',
            message: `Initiating swap of ${amount} ${fromCurrency} to ${toCurrency}`
          }),
          actionResultUserFriendlyMessage: `Processing your swap of ${amount} ${fromCurrency} to ${toCurrency}...`
        }
      });

      financialActionId = financialAction.id;

      // Import wallet using mnemonic phrase
      const coinbaseWallet = await Wallet.import({
        mnemonicPhrase: senderMnemonic
      }, Coinbase.networks.BaseMainnet);

      console.log(`${logPrefix}Network ID: ${coinbaseWallet.getNetworkId()}`);

      // Get asset IDs for the currencies
      var fromCurrencyId = await this.getCoinbaseAssetId(fromCurrency);
      var toCurrencyId = await this.getCoinbaseAssetId(toCurrency);

      // fromCurrencyId = Coinbase.assets.Eth; //          "ETH", // fromCurrency
      // toCurrencyId = Coinbase.assets.Usdc; // "USDC",  // toCurrency (using CBBTC which is Coinbase's wrapped BTC)

      console.log(`${logPrefix}From currency ID for ${fromCurrency}: ${fromCurrencyId}`);
      console.log(`${logPrefix}To currency ID for ${toCurrency}: ${toCurrencyId}`);

      // Get balance before trade
      const balanceBefore = await coinbaseWallet.getBalance(fromCurrencyId);
      console.log(`${logPrefix}Balance before trade: ${JSON.stringify(balanceBefore)}`);

      // Create the trade
      const trade = await coinbaseWallet.createTrade({
        fromAssetId: "ETH",
        toAssetId: "SOL",
        amount: amount
      }) as Trade;

      console.log(`${logPrefix}Trade created: ${JSON.stringify(trade)}`);

      // Get balances after trade
      const balanceAfterFrom = await coinbaseWallet.getBalance(fromCurrencyId);
      const balanceAfterTo = await coinbaseWallet.getBalance(toCurrencyId);

      // Convert balances to string
      const balanceBeforeStr = balanceBefore ? balanceBefore.toString() : '0';
      const balanceAfterFromStr = balanceAfterFrom ? balanceAfterFrom.toString() : '0';
      const balanceAfterToStr = balanceAfterTo ? balanceAfterTo.toString() : '0';

      // Update financial action with success status
      await this.prisma.financialChatAction.update({
        where: { id: financialActionId },
        data: {
          actionResult: 'SUCCESS',
          actionResultData: JSON.stringify({
            status: 'SUCCESS',
            tradeId: trade.id || '',
            amountSent: amount,
            trade: JSON.stringify(trade)
          }),
          actionResultUserFriendlyMessage: `Successfully swapped ${amount} ${fromCurrency} to ${toCurrency}.`,
          actionResultDate: new Date(),
          actionInputWalletBalanceBefore: parseFloat(balanceBeforeStr),
          actionInputWalletBalanceAfter: parseFloat(balanceAfterFromStr),
          actionOutputWalletBalanceBefore: null,
          actionOutputWalletBalanceAfter: parseFloat(balanceAfterToStr)
        }
      });

      return {
        tradeId: trade.id || '',
        fromCurrency,
        toCurrency,
        amountSent: amount,
        amountReceived: trade.toAssetAmount || 0,
        exchangeRate: (trade.toAssetAmount || 0) / amount,
        financialActionId,
        status: trade.status || 'COMPLETED'
      };
    } catch (error: any) {
      console.error(`${logPrefix}Error creating trade on Coinbase: ${error.message || error.apiMessage || error}`);

      // Update financial action with error status if it was created
      if (financialActionId) {
        await this.prisma.financialChatAction.update({
          where: { id: financialActionId },
          data: {
            actionResult: 'ERROR',
            actionResultData: JSON.stringify({
              status: 'ERROR',
              error: error.message,
              stack: error.stack
            }),
            actionResultUserFriendlyMessage: `Failed to swap ${amount} ${fromCurrency} to ${toCurrency}: ${error.message}`,
            actionResultDate: new Date()
          }
        });
      }

      throw error;
    }
  }

  public async getDefaultRpcProvider(): Promise<ethers.JsonRpcProvider> {
    const rpcProvider = await this.prisma.rpcProvider.findUnique({
      where: {
        currency: "ETH"
      }
    });

    const provider = new ethers.JsonRpcProvider(rpcProvider.networkUrl);
    return provider;
  }

  private getBaseChainTokenAddressFromList(symbol: string): string | null {
    try {
      //Token list is taken from: https://github.com/sushiswap/list/blob/master/lists/token-lists/default-token-list/tokens/base.json
      const tokenListPath = path.resolve(process.cwd(), 'src', 'server', 'services', 'data', 'baseTokenList.json');
      var tokenList = JSON.parse(fs.readFileSync(tokenListPath, 'utf8'));


      // var manuallyAddedTokens = [
      //   {
      //     "address": "0x2f6c17fa9f9bC3600346ab4e48C0701e1d5962AE",
      //     "chainId": 8453,
      //     "decimals": 18,
      //     "logoURI": "https://raw.githubusercontent.com/sushiswap/list/master/logos/token-logos/network/base/0x2f6c17fa9f9bC3600346ab4e48C0701e1d5962AE.jpg",
      //     "name": "Based Fartcoin",
      //     "symbol": "Fartcoin"
      //   }
      // ]

      // tokenList = tokenList.concat(manuallyAddedTokens);

      const token = tokenList.find(
        (t: any) => t.symbol.toUpperCase() === symbol.toUpperCase() && t.chainId === 8453
      );
      return token ? token.address : null;
    } catch (err) {
      console.error('Error reading baseTokenList.json:', err);
      return null;
    }
  }

  /**
 * Get token contract address from blockchain explorer API
 * @param chainId The blockchain network ID
 * @returns Token contract address or null if not found
 */
public async getAllTokenAddressesFromExplorer(chainId: number): Promise<string | null> {
  try {
    // Get the appropriate API key and base URL for the chain
    let apiKey = '';
    let baseUrl = '';
    
    if (chainId === 8453) { // Base
      apiKey = process.env.BASESCAN_API_KEY || '';
      baseUrl = 'https://api.basescan.org/api';
    // } else if (chainId === 1) { // Ethereum
    //   apiKey = process.env.ETHERSCAN_API_KEY || '';
    //   baseUrl = 'https://api.etherscan.io/api';
    } else {
      return null; // Unsupported chain
    }

    // Query the explorer API to search for token by symbol
    const response = await fetch(`${baseUrl}?module=token&action=tokenlist&apikey=${apiKey}`);
    
    if (!response.ok) {
      throw new Error(`Explorer API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.status !== '1' || !Array.isArray(data.result)) {
      return null;
    }
    
    return data.result;
  } catch (error) {
    console.error(`Error fetching token address from explorer: ${error}`);
    return null;
  }
}

} 