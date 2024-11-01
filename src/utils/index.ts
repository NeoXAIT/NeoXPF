
import { Connection, Keypair, LAMPORTS_PER_SOL, ParsedTransactionMeta, ParsedTransactionWithMeta, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, sendAndConfirmRawTransaction } from "@solana/web3.js";
import base58 from "bs58";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Transaction, ComputeBudgetProgram, } from "@solana/web3.js";
import readline from 'readline'
import { SearcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import { isError } from "jito-ts/dist/sdk/block-engine/utils";
import { BundleResult } from "jito-ts/dist/gen/block-engine/bundle";
import { searcherClient } from 'jito-ts/dist/sdk/block-engine/searcher';
import { Bundle } from "jito-ts/dist/sdk/block-engine/types";
import * as anchor from '@coral-xyz/anchor';
import { BlockInfo, CacheEntry, instructionType, KeyBalances, TradeEntry } from "../constants/types";
import chalk from "chalk";
import { Program } from "@coral-xyz/anchor";
import fs from "fs"
import { tipAccount as tipAddress, tradeHistoryPath } from '../constants/index';
import { getCreateMetadataAccountV3InstructionDataSerializer } from "@metaplex-foundation/mpl-token-metadata";
export async function send_transactions(
    Transactions: Transaction[],
    connection: Connection
) {
    try {
        var staggeredTransactions: Promise<string>[] = []
        var i = 1
        Transactions.forEach((tx, idx) => {
            const prms = new Promise<string>((resolve) => {
                setTimeout(() => {
                    sendAndConfirmRawTransaction(connection, tx.serialize(), { skipPreflight: true, commitment: 'processed', maxRetries: 2 })
                        .then(async (sig) => {
                            //console.log(`Transaction successful.`)
                            resolve(sig);
                        })
                        .catch(error => {
                            //console.log('Transaction failed :c')
                            resolve('failed');
                        })
                }, 100 * i)
            })
            staggeredTransactions.push(prms);
            i += 1
        })
        const result = await Promise.allSettled(staggeredTransactions)
        const values = []
        for (var entry of result) {
            //@ts-ignore      
            values.push(entry.value)
        }
        return values

    } catch (e) {
        return ['failed'];
    }
};

export function getRandomNumber() {
    // Generate a random number between 0 and 1
    var randomNumber = Math.random();

    // Scale the random number to the desired range (1 to 5000)
    var scaledNumber = Math.floor(randomNumber * 5000) + 1;

    return scaledNumber;
}


export function getCurrentDateTime(): string {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `[${date} ${hours}:${minutes}:${seconds}]`;
}

export function roundUpToNonZeroString(num: number): string {
    const numString = num.toString();
    const decimalIndex = numString.indexOf('.');

    if (decimalIndex === -1) {
        return numString;
    } else {
        const integerPart = numString.substring(0, decimalIndex);

        let decimalPart = numString.substring(decimalIndex + 1);
        decimalPart = decimalPart.replace(/0+$/, '');

        return decimalPart === '' ? integerPart : integerPart + '.' + decimalPart;
    }
}

export function getKeypairFromBs58(bs58String: string): Keypair {
    try {
        const privateKeyObject = base58.decode(bs58String);
        const privateKey = Uint8Array.from(privateKeyObject);
        const keypair = Keypair.fromSecretKey(privateKey);
        return keypair;
    } catch (e) {
        const errorString = bs58String.length > 8 ? bs58String.substring(0, 8) + '...' : bs58String;
        console.log(chalk.redBright.bold(`Invalid Keypair: ${errorString} `));
        console.log('\n');
        process.exit(1);
    }

}

export function generate_transactions(serializedTransactions: Array<string>) {
    const transactionBuffers = serializedTransactions
        .map((transaction) => Buffer.from(transaction, 'base64'));
    const rawTransactions = transactionBuffers
        .map((transactionBuffer) => Transaction.from(transactionBuffer));
    return rawTransactions;
}

export function serializeTransactions(rawTxs: Transaction[]) {
    return rawTxs.map((trans: Transaction) => {
        const temp = trans.serialize({ requireAllSignatures: false, verifySignatures: false })
        return Buffer.from(temp).toString('base64');
    })
}

export async function getComputeUnitsForTransaction(tx: Transaction, connection: Connection) {
    try {
        const newTx = new Transaction();
        newTx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000000 }));
        newTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
        newTx.add(...tx.instructions);
        newTx.recentBlockhash = tx.recentBlockhash;
        newTx.lastValidBlockHeight = tx.lastValidBlockHeight;
        newTx.feePayer = tx.feePayer;
        const simulation = await connection.simulateTransaction(newTx);

        if (simulation.value.err) {
            return 0;
        }
        return simulation.value.unitsConsumed ?? 200_000;

    } catch (e) {
        console.log(e);
        return 0
    }
}
export async function getPriorityFeeEstimateForTransaction(tx: Transaction) {
    try {
        const endpoint = process.env.RPC_URL as string;
        const jsonPayload = {
            jsonrpc: '2.0',
            id: '1',
            method: 'getPriorityFeeEstimate',
            params: [
                {
                    transaction: bs58.encode(tx.serialize({ verifySignatures: false, requireAllSignatures: false })), // Pass the serialized transaction in Base58
                    options: { includeAllPriorityFeeLevels: true },
                },
            ]
        }
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(jsonPayload)
        }).then(res => res.json());

        //const highFee = res.result.priorityFeeLevels.high as number;
        const veryHighFee = res.result.priorityFeeLevels.veryHigh as number;
        const finalFee = Math.min(Math.floor((veryHighFee * 2)), 20_000_000);
        return finalFee;

    } catch (e) {
        console.log(e);
        return 1000000;
    }
}
export async function getOptimalPriceAndBudget(hydratedTransaction: Transaction, connection: Connection) {

    const [priorityFee, ComputeUnits] = await Promise.all([
        getPriorityFeeEstimateForTransaction(hydratedTransaction),
        getComputeUnitsForTransaction(hydratedTransaction, connection),
    ])
    return [priorityFee, ComputeUnits];
}
export async function ConstructOptimalTransaction(prevTx: Transaction, connection: Connection, fee: number): Promise<Transaction> {

    const microLamports = fee == -1 ? 50_000_000 : fee;
    const units = 59_000 + getRandomNumber();
    //getComputeUnitsForTransaction(prevTx, connection);
    //console.log(`Compute units to consume: ${units}`);
    //console.log(`Micro-lamports per compute unit: ${fee}\n`)

    const newTx = new Transaction();
    newTx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
    newTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units }));
    newTx.add(...prevTx.instructions);
    newTx.recentBlockhash = prevTx.recentBlockhash;
    newTx.lastValidBlockHeight = prevTx.lastValidBlockHeight;
    newTx.feePayer = prevTx.feePayer;
    return newTx;
}


export function validateSolAddress(address: string) {
    try {
        let pubkey = new PublicKey(address)
        let isSolana = PublicKey.isOnCurve(pubkey.toBuffer())
        return isSolana
    } catch (error) {
        return false
    }
}


//parsing signatures
export async function parseSignatures(connection: Connection, signatures: string[]) {
    const parsedSignatures = await connection.getParsedTransactions(signatures, { maxSupportedTransactionVersion: 2 });
    return parsedSignatures
}


export const getUserInput = (prompt: string): Promise<string> => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question(prompt, (userInput) => {
            resolve(userInput);
            rl.close();
        });
    });
};

//sleep function
export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


export async function buildBundle(
    search: SearcherClient,
    bundleTransactionLimit: number,
    tx: Transaction,
    signer: Keypair,
    tip: number,
) {

    //console.log("tip account:", _tipAccount);
    const tipAccount = new PublicKey(tipAddress);
    const bund = new Bundle([], bundleTransactionLimit);



    const tipIx = SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: tipAccount,
        lamports: Math.max(Math.floor(tip * LAMPORTS_PER_SOL), 5001),
    })

    //creating versionedTx
    const messageV0 = new TransactionMessage({
        payerKey: tx.feePayer!,
        recentBlockhash: tx.recentBlockhash!,
        instructions: [...tx.instructions, tipIx],
    }).compileToV0Message();


    const vTransaction = new VersionedTransaction(messageV0);
    vTransaction.sign([signer]);

    const txSig = bs58.encode(vTransaction.signatures[0]);

    const buildBundle = bund.addTransactions(vTransaction);


    if (isError(buildBundle)) {
        console.log('Error while creating bundle');
        //console.log(buildBundle)
        return null;
    }

    try {
        const res = await search.sendBundle(buildBundle);
        return txSig;
        //console.log('reponse_bundle:', res);
    } catch (e) {
        console.log('error sending bundle:\n', e);
        return null
    }
}


export const onBundleResult = (c: SearcherClient, txSig: string, connection: Connection): Promise<[number, any, any]> => {


    return new Promise((resolve) => {


        let state = 0;
        let isResolved = false;
        //console.log('tx sig:' txSig);

        //tx signature listener plz save my sanity
        let sigSubId = connection.onSignature(txSig, (res) => {
            if (isResolved) {
                connection.removeSignatureListener(sigSubId);
                return;
            }

            //console.log('inside signature sub');
            //console.log(sigSubId);

            if (!res.err) {
                isResolved = true
                resolve([1, () => { }, 0]);
            }
        },
            'confirmed');


        //SUPER FUCKING BUGGY LISTENER HOLY FUCK I HATE THIS SOO MCUH
        const listener = c.onBundleResult(
            //@ts-ignore
            (result) => {
                //console.log('inside bundle sub');

                if (isResolved) return state;


                const bundleId = result.bundleId;
                const isAccepted = result.accepted;
                const isRejected = result.rejected;

                if (isResolved == false) {

                    if (isAccepted) {
                        //console.log(result);

                        console.log(
                            chalk.gray(
                                ("bundle accepted, ID:"),
                                chalk.whiteBright.bold(bundleId),
                                " Slot: ",
                                chalk.blueBright.bold(result?.accepted?.slot)
                            ));
                        state += 1;
                        isResolved = true;
                        resolve([state, listener, 0]); // Resolve with 'first' when a bundle is accepted
                        return
                    }

                    if (isRejected) {
                        console.log(chalk.red('Failed to send Bundle, retrying... (ctrl + c to abort)'));
                        isResolved = true;

                        if (isRejected.simulationFailure) {
                            if (isRejected.simulationFailure.msg?.toLowerCase().includes('partially')) {
                                resolve([1, listener, 0]);
                                return
                            }
                            console.log(chalk.gray(isRejected.simulationFailure.msg ?? ''));

                        }

                        if (isRejected.internalError) {
                            if (isRejected.internalError.msg?.toLowerCase().includes('partially')) {
                                resolve([1, listener, 0]);
                                return
                            }
                            console.log(chalk.gray(isRejected.internalError.msg));
                        }

                        if (isRejected.stateAuctionBidRejected) {
                            if (isRejected.stateAuctionBidRejected.msg?.toLowerCase().includes('partially')) {
                                resolve([1, listener, 0]);
                                return
                            }
                            console.log(chalk.gray(isRejected.stateAuctionBidRejected.msg ?? ''));

                        }

                        if (isRejected.droppedBundle) {
                            if (isRejected.droppedBundle.msg?.toLowerCase().includes('partially')) {
                                resolve([1, listener, 0]);
                                return
                            }
                            console.log(chalk.gray(isRejected.droppedBundle.msg ?? ''));
                        }

                        if (isRejected.winningBatchBidRejected) {
                            if (isRejected.winningBatchBidRejected.msg?.toLowerCase().includes('partially')) {
                                resolve([1, listener, 0]);
                                return
                            }
                            console.log(chalk.gray(isRejected.winningBatchBidRejected?.msg ?? ''));
                        }
                        resolve([state, listener, 0]);
                    }
                }
            },
            (e) => {
                //resolve([state, listener]);
                //console.error(chalk.red(e));
            }
        );

        setTimeout(() => {
            resolve([state, listener, 1]);
            isResolved = true
        }, 30000);

    });
};


//metadata pda

export function getMetadataPda(mint: PublicKey) {
    const [metadataPda, _] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("metadata"),
            new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
            mint.toBuffer(),
        ],
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'),
    )
    return metadataPda
}

//master edition pda 
export function getMasterEditionPda(mint: PublicKey) {
    const [masterEditionPda, _] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("metadata"),
            new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
            mint.toBuffer(),
            Buffer.from("edition"),
        ],
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'),
    )
    return masterEditionPda
}

//token record pda 
export function getTokenRecord(mint: PublicKey, ata: PublicKey) {
    const [TokenRecord, _] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("metadata"),
            new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
            mint.toBuffer(),
            Buffer.from("token_record"),
            ata.toBuffer(),
        ],
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'),
    )
    return TokenRecord
}

//master edition pda 
export function getMetadataDelegateRecord(mint: PublicKey, ata: PublicKey, delegate: PublicKey, updateAuthority: PublicKey,) {
    const [pda, _] = PublicKey.findProgramAddressSync(
        [
            anchor.utils.bytes.utf8.encode("metadata"),
            new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
            mint.toBuffer(),
            anchor.utils.bytes.utf8.encode("update"),
            updateAuthority.toBuffer(),
            delegate.toBuffer(),
        ],
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'),
    )
    return pda
}


export function getInstructionType(parsedTx: ParsedTransactionWithMeta, instructionAccounts: PublicKey[]): instructionType {

    try {
        //first we map the transaction accounts to their respective balances
        const balanceArray = constructBalancesArray(parsedTx);
        //console.log(balanceArray)

        //now we cross check with accounts from the concerned instruction 


        //we get user, bonding curve and fee recipient pubkeys from instruction accounts
        const user = instructionAccounts[6]
        const bondingCurve = instructionAccounts[3];
        const associatedBondingCurve = instructionAccounts[4];
        const associatedUser = instructionAccounts[5];
        const feeRecipient = instructionAccounts[1];
        const mint = instructionAccounts[2];


        //console.log(
        //    user.toBase58(),
        //    '\n',
        //    bondingCurve.toBase58(),
        //    '\n',
        //    associatedBondingCurve.toBase58(),
        //    '\n',
        //    associatedUser.toBase58(),
        //    '\n',
        //    feeRecipient.toBase58(),
        //    '\n',
        //    mint.toBase58(),
        //    '\n',
        //)
        //
        //console.log(instructionAccounts);


        //then we get their respective balances
        const userKeyBalances = balanceArray.filter(e => e.key.equals(user))[0];
        const associatedUserBalances = balanceArray.filter(e => e.key.equals(associatedUser))[0];
        const associatedBondingCurveBalances = balanceArray.filter(e => e.key.equals(associatedBondingCurve))[0];
        const bondingCurveKeyBalances = balanceArray.filter(e => e.key.equals(bondingCurve))[0];
        const feeRecipientKeyBalances = balanceArray.filter(e => e.key.equals(feeRecipient))[0];

        //console.log(
        //    associatedUserBalances,
        //    '\n',
        //    associatedBondingCurveBalances,
        //    '\n',
        //    bondingCurveKeyBalances,
        //    '\n',
        //    feeRecipientKeyBalances,
        //    '\n',
        //)

        //now we determine the type of operation by inspecting the balance change direction
        if (bondingCurveKeyBalances.preSolBalance > bondingCurveKeyBalances.postSolBalance) {
            const soldTokens = (associatedUserBalances.preTokenBalance - associatedUserBalances.postTokenBalance) / (10 ** associatedBondingCurveBalances.tokenDecimals);
            const SolReceived = (bondingCurveKeyBalances.preSolBalance - bondingCurveKeyBalances.postSolBalance);
            const text = chalk.gray(`${chalk.blueBright.bold(getCurrentDateTime())} Wallet ${chalk.whiteBright.bold(user.toBase58().substring(0, 8))}.. sold ${chalk.blueBright.bold(soldTokens)} ${chalk.whiteBright.bold(mint.toBase58().substring(0, 8))}.. for ${chalk.blue(roundUpToNonZeroString(parseFloat((SolReceived / LAMPORTS_PER_SOL).toFixed(8))))} SOL`)
            console.log(text)

            return 'sell'

        } else {
            const boughtTokens = (associatedUserBalances.postTokenBalance - (isNaN(associatedUserBalances.preTokenBalance) ? 0 : associatedUserBalances.preTokenBalance)) / (10 ** associatedBondingCurveBalances.tokenDecimals);
            const solSpent = (bondingCurveKeyBalances.postSolBalance - bondingCurveKeyBalances.preSolBalance + feeRecipientKeyBalances.postSolBalance - feeRecipientKeyBalances.preSolBalance);
            const text = chalk.gray(`${chalk.blueBright.bold(getCurrentDateTime())} Wallet ${chalk.whiteBright.bold(user.toBase58().substring(0, 8))}.. bought ${chalk.blueBright.bold(boughtTokens)} ${chalk.whiteBright.bold(mint.toBase58().substring(0, 8))}.. for ${chalk.blue(roundUpToNonZeroString(parseFloat((solSpent / LAMPORTS_PER_SOL).toFixed(8))))} SOL`)
            console.log(text)
            return 'buy'
        }

    } catch (e) {
        console.log(e);
        return 'sell'
    }



}

export function constructBalancesArray(parsedTx: ParsedTransactionWithMeta): KeyBalances[] {

    const txKeys = (parsedTx.transaction.message.accountKeys);
    const preBalances = (parsedTx.meta?.preBalances);
    const postBalances = (parsedTx.meta?.postBalances);
    const preTokenBalances = (parsedTx.meta?.preTokenBalances)
    const postTokenBalances = (parsedTx.meta?.postTokenBalances);
    //console.log(txKeys.length);
    //console.log(preBalances?.length);
    //console.log(postBalances?.length);
    //console.log(preTokenBalances?.length);
    //console.log(postTokenBalances?.length);

    const keysMap = txKeys.map((key, idx) => {
        return {
            key: key.pubkey,
            preSolBalance: preBalances![idx],
            postSolBalance: postBalances![idx],
            preTokenBalance: NaN,
            postTokenBalance: NaN,
            tokenDecimals: NaN,
        } as KeyBalances
    });

    preTokenBalances?.map((e) => {
        keysMap[e.accountIndex].preTokenBalance = Number(e.uiTokenAmount.amount)
        keysMap[e.accountIndex].tokenDecimals = (e.uiTokenAmount.decimals)
    });
    postTokenBalances?.map((e) => {
        keysMap[e.accountIndex].postTokenBalance = Number(e.uiTokenAmount.amount)
        keysMap[e.accountIndex].tokenDecimals = (e.uiTokenAmount.decimals)
    });

    //console.log(keysMap);
    //console.log(keysMap.length);
    //preTokenBalances?.map(e => {
    //    console.log(e.accountIndex);
    //})
    //postTokenBalances?.map(e => {
    //    console.log(e.accountIndex);
    //})

    return keysMap
}


// Function to add an entry to the cache
export function addToCache(key: string, cache: Map<string, CacheEntry>, type: instructionType) {
    cache.set(key, { timestamp: Date.now(), type: type });
}

// Function to remove expired entries from the cache
export function removeExpiredEntries(cache: Map<string, CacheEntry>) {
    const now = Date.now();
    cache.forEach((value, key) => {
        if (now - value.timestamp > 120000) { // Check if entry has expired (61 seconds)
            cache.delete(key);
        }
    });
}



export function convertIPFSURL(originalURL: string): string {
    const ipfsIdentifier = originalURL.split('/ipfs/')[1];
    if (ipfsIdentifier) {
        return `https://pump.mypinata.cloud/ipfs/${ipfsIdentifier}`;
    } else {
        // If the URL format is not correct, return the original URL
        return originalURL;
    }
}


export async function fetchPrice(
    tokenDecimals: number,
    bondingCurvePda: PublicKey,
    program: Program,
    currentPrice: number,
) {

    try {
        const bondingCurveData = await program.account.bondingCurve.fetchNullable(bondingCurvePda);

        const virtualTokenReserves = (bondingCurveData!.virtualTokenReserves as any).toNumber();
        const virtualSolReserves = (bondingCurveData!.virtualSolReserves as any).toNumber();

        const adjustedVirtualTokenReserves = virtualTokenReserves / (10 ** tokenDecimals);
        const adjustedVirtualSolReserves = virtualSolReserves / LAMPORTS_PER_SOL;


        const virtualTokenPrice = adjustedVirtualSolReserves / adjustedVirtualTokenReserves;
        return virtualTokenPrice;
    } catch (e) {
        return currentPrice;
    }
}



export function calculatePnl(previousPrice: number, currentPrice: number): [number, number] {
    const pnl: number = currentPrice - previousPrice;
    const pnlPercentage: number = (pnl / previousPrice) * 100;

    if (pnl > 0) {
        return [pnlPercentage, 1];
    } else if (pnl < 0) {
        return [pnlPercentage, -1];
    } else {
        return [pnlPercentage, 0];
    }
}


export function getOrCreateTrades(): TradeEntry[] {

    if (fs.existsSync('trades.json')) {
        const fileContent = JSON.parse(fs.readFileSync(tradeHistoryPath, 'utf-8')) as TradeEntry[];
        return fileContent;
    } else {
        const emptyArray: TradeEntry[] = [];
        fs.writeFileSync(tradeHistoryPath, JSON.stringify(emptyArray, null, 2), 'utf-8');
        return emptyArray;
    }
}


export function addTradeEntry(
    type: 'buy' | 'sell' | 'create',
    mint: string,
    amount?: number,
) {
    const tradeHistory = getOrCreateTrades();
    tradeHistory.push({
        type: type,
        mint: mint,
        amount: amount,
        timestamp: Date.now(),
    })
    fs.writeFileSync(tradeHistoryPath, JSON.stringify(tradeHistory, null, 2), 'utf-8');
}


export function extractAddressFromUrl(url: string): string | null {
    try {
        // Trim leading/trailing spaces and slashes
        url = url.trim().replace(/^\/+|\/+$/g, "");

        // Handle URLs with or without "www" and "https"
        const regex = /^(https:\/\/)?(www\.)?pump\.fun\/([\w-]+)$/;
        const match = regex.exec(url);

        if (match) {
            // Return the matched group (3rd capturing group)
            return match[3];
        } else {
            return url;
        }

    } catch (e) {
        console.log("Error extracting address from URL:", e);
        return url;
    }
}



export async function getBlockInfo(connection: Connection): Promise<BlockInfo> {

    try {
        const hashAndCtx = await connection.getLatestBlockhashAndContext('processed');
        return {
            minContextSlot: hashAndCtx.context.slot,
            blockHeight: hashAndCtx.value.lastValidBlockHeight,
            blockHash: hashAndCtx.value.blockhash,
        }
    } catch (e) {
        return {
            minContextSlot: undefined,
            blockHeight: undefined,
            blockHash: undefined,
        }
    }
}

export function getOptionPromptText(option: string): string {
    if (option == '1') {
        return "Enter wallet address to track: "
    } else if (option == '2') {
        return "Enter token name: "
    } else {
        return "Enter token ticker: "
    }

}

export function compareTickers(input: string, comparedTicker: string) {
    const adjustedInput = (input.startsWith('$') ? input.substring(1, undefined) : input).toLowerCase().trim();
    const adjustedTicker = (comparedTicker.startsWith('$') ? comparedTicker.substring(1, undefined) : comparedTicker).toLowerCase().trim();
    return adjustedInput == adjustedTicker;
}

export function compareNames(input: string, comparedName: string) {
    const adjustedInput = input.toLowerCase().trim();
    const adjutedName = comparedName.toLowerCase().trim();
    return adjustedInput == adjutedName;
}


export function decodeCreateV3AndGetValues(data: string) {
    try {
        const serializer = getCreateMetadataAccountV3InstructionDataSerializer();
        const decodedData = serializer.deserialize(bs58.decode(data));
        const name = decodedData[0].data.name;
        const ticker = decodedData[0].data.symbol;
        return [name, ticker]
    } catch (e) {
        return ['', '']
    }
}


