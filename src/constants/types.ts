import { PublicKey } from "@solana/web3.js";

export type instructionType = 'buy' | 'sell';

export interface KeyBalances {
    key: PublicKey,
    preSolBalance: number
    postSolBalance: number
    preTokenBalance: number
    postTokenBalance: number
    tokenDecimals: number
}

export interface CacheEntry {
    timestamp: number
    type: instructionType
};


export interface GeneratedWalletEntry {
    token: string,
    address: PublicKey,
    comment?: string,
}


export interface TradeEntry {
    type: 'buy' | 'sell' | 'create',
    mint: string,
    timestamp: number,
    amount?: number,
}

export interface BlockInfo {
    blockHash: string | undefined,
    blockHeight: number | undefined,
    minContextSlot: number | undefined,
}


export interface heldCoinEntry {
    mint: PublicKey,
    amount: number,
    metadata?: any,
    curve: any,
}
