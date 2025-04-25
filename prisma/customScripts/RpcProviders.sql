INSERT INTO "RpcProvider" ("id", "name", "currency", "explorerUrl", "networkUrl", "notes", "isNative")
VALUES 
(gen_random_uuid(), 'Monad', 'MON', 'https://testnet.monadexplorer.com', 'https://monad-testnet.g.alchemy.com/v2/tnkGNjehMMdij0yzBLWWBS81P4_A3FUJ', 'Monad network provider', true),
(gen_random_uuid(), 'Ethereum', 'ETH', 'https://etherscan.io', 'https://eth-mainnet.g.alchemy.com/v2/tnkGNjehMMdij0yzBLWWBS81P4_A3FUJ', 'Ethereum network provider', true),
(gen_random_uuid(), 'Base', 'USDC', 'https://basescan.org', 'https://base-mainnet.g.alchemy.com/v2/tnkGNjehMMdij0yzBLWWBS81P4_A3FUJ', 'Base network provider for USDC', false);
