import { validateSolAddress, getKeypairFromBs58, ConstructOptimalTransaction, getRandomNumber, buildBundle, onBundleResult, getCurrentDateTime, roundUpToNonZeroString, addTradeEntry, extractAddressFromUrl } from "../utils";
import idl from "../constants/idl.json";
import { TransactionInstruction, Connection, LAMPORTS_PER_SOL, PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram, Transaction, PartiallyDecodedInstruction, ParsedInstruction, ParsedTransactionWithMeta, } from "@solana/web3.js"
import { Account, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { sleep, getUserInput } from "../utils";
import { searcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import { getInstructionType, addToCache, removeExpiredEntries, fetchPrice, calculatePnl } from "../utils";
import {
    programID,
    MEMO_PROGRAM_ID,
    feeRecipient,
    EVENT_AUTH,
} from "../constants"
import { ASSOCIATED_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import chalk from "chalk";
import { clearConsole } from '../utils/cli';
import * as pdas from "../utils/pdas";


export async function buy() {

    try {
        console.log('\n');

        const pk = process.env.SIGNER_PRIVATE_KEY as string;
        if (!pk || pk == '<YOUR SIGNER KEYPAIR HERE>') {
            console.log('\n')
            console.log(chalk.red.bold.bold('Missing signer keypair'));
            console.log(chalk.red.bold.bold('Please fill it in .env file'));
            await sleep(3000); return;
        }

        const url = process.env.RPC_URL as string;
        if (!url || url == '<YOUR RPC URL HERE>') {
            console.log('\n')
            console.log(chalk.red.bold.bold('Missing rpc endpoint'));
            console.log(chalk.red.bold.bold('Please fill it in .env file'));
            await sleep(3000); return;
        }

        const jitoAuthPrivateKey = process.env.JITO_AUTH_PRIVATE_KEY as string;
        if (!jitoAuthPrivateKey || jitoAuthPrivateKey == '<YOUR AUTH KEYPAIR HERE>') {
            console.log('\n')
            console.log(chalk.red.bold.bold('Missing jito authentication private key'));
            console.log(chalk.red.bold.bold('Please fill it in the .env file.'));
            await sleep(3000); return;
        }

        const blockEngineUrl = process.env.BLOCK_ENGINE_URL as string;
        if (!blockEngineUrl) {
            console.log('\n')
            console.log(chalk.red.bold.bold('Missing block engine url'));
            console.log(chalk.red.bold.bold('Please fill it in the .env file.'));
            await sleep(3000); return;
        }

        const envTip = process.env.JITO_TIP as string;
        const jitoTip = Number(envTip);
        if (!jitoTip) {
            console.log('\n')
            console.log(chalk.red.bold.bold('Invalid jito tip'));
            console.log(chalk.red.bold.bold('Please fix it in the .env file.'));
            await sleep(3000); return;
        }

        const maxRetriesString = process.env.MAX_RETRIES as string;
        const maxRetries = Number(maxRetriesString);


        const connection = new Connection(url as string, { commitment: 'confirmed', });
        const signerKeypair = getKeypairFromBs58(pk);
        //initializing program
        const program = new Program(idl as anchor.Idl, programID, new anchor.AnchorProvider(connection, new NodeWallet(signerKeypair), anchor.AnchorProvider.defaultOptions()));


        let inputtedMint = (await getUserInput(chalk.grey("Enter Token Address or pump link: ")));
        inputtedMint = extractAddressFromUrl(inputtedMint) ?? inputtedMint;
        //console.log(inputtedMint);


        const bondingCurvePda = pdas.getBondingCurve(new PublicKey(inputtedMint), program.programId);
        const bondingCurveData = await program.account.bondingCurve.fetchNullable(bondingCurvePda);
        if (!bondingCurveData) {
            console.log(chalk.red.bold('No Pump pool found for for this address'));
            await sleep(3000); return;
        }
        const mintData = await connection.getParsedAccountInfo(new PublicKey(inputtedMint));
        //@ts-ignore
        const decimals = mintData.value?.data.parsed.info.decimals;



        const inputtedBuyAmount = (await getUserInput(chalk.grey("Enter the amount of sol to buy with: ")));
        let buyNumberAmount: number = Number(inputtedBuyAmount);
        if (!buyNumberAmount) {
            console.log(chalk.red.bold('Invalid sol amount'));
            await sleep(3000); return;
        }

        const minMaxAmount = buyNumberAmount + (buyNumberAmount * 0.15);
        const inputtedMaxSolCost = (await getUserInput(chalk.grey(`Enter the maximum amount of SOL accounting to slippage (min ${roundUpToNonZeroString(parseFloat((minMaxAmount).toFixed(6)))} SOL): `)));
        const buyMaxSolCost = Number(inputtedMaxSolCost);
        if (!buyMaxSolCost || buyMaxSolCost < minMaxAmount) {
            console.log(chalk.red.bold('Invalid Maximum sol amount'));
            await sleep(3000); return;
        }

        let priorityFee: number = -1;
        const inputtedPriorityFee = (await getUserInput(chalk.grey("Enter Priority-fee in micro-lamports ('default' for default high fee): ")));
        if (inputtedPriorityFee.toUpperCase() != 'DEFAULT') {
            priorityFee = Number(inputtedPriorityFee);
            if (!priorityFee || priorityFee < 0) {
                console.log(chalk.red.bold('Invalid priority fee Input'));
                await sleep(3000); return;
            }
        }


        console.log('\n')
        console.log(chalk.blueBright.bold('Buying Tokens..'))
        console.log('\n')


        const signerTokenAccount = getAssociatedTokenAddressSync(new PublicKey(inputtedMint), signerKeypair.publicKey, true, TOKEN_PROGRAM_ID,);
        const globalStatePda = pdas.getGlobalState(program.programId);
        const bondingCurveata = getAssociatedTokenAddressSync(new PublicKey(inputtedMint), bondingCurvePda, true)


        let account = await connection.getAccountInfo(signerTokenAccount, 'processed')



        let buyRetries = 0;
        while (buyRetries <= (maxRetries ? Math.max(1, maxRetries) : 5)) {
            const tokenPrice = await fetchPrice(decimals, bondingCurvePda, program, 0);
            const finalAmount = buyNumberAmount / tokenPrice;

            const buyTx = new Transaction();

            if (!account) {
                buyTx.add(
                    createAssociatedTokenAccountInstruction(
                        signerKeypair.publicKey,
                        signerTokenAccount,
                        signerKeypair.publicKey,
                        new PublicKey(inputtedMint),
                    )
                )
            };

            const buyIx = await program.methods.buy(
                new BN((finalAmount * (10 ** decimals))),
                new BN(buyMaxSolCost * LAMPORTS_PER_SOL),
            ).accounts({
                global: pdas.getGlobalState(program.programId),
                feeRecipient: feeRecipient,
                mint: new PublicKey(inputtedMint),
                bondingCurve: bondingCurvePda,
                associatedBondingCurve: bondingCurveata,
                associatedUser: signerTokenAccount,
                user: signerKeypair.publicKey,
                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                rent: SYSVAR_RENT_PUBKEY,
                eventAuthority: EVENT_AUTH,
                program: program.programId,
            }).instruction();
            buyTx.add(buyIx);


            const memoix = new TransactionInstruction({
                programId: new PublicKey(MEMO_PROGRAM_ID),
                keys: [],
                data: Buffer.from(getRandomNumber().toString(), "utf8")
            })
            buyTx.add(memoix);

            //preparing transaction
            const hashAndCtx = await connection.getLatestBlockhashAndContext('processed');
            const recentBlockhash = hashAndCtx.value.blockhash;
            const lastValidBlockHeight = hashAndCtx.value.lastValidBlockHeight;

            buyTx.recentBlockhash = recentBlockhash;
            buyTx.lastValidBlockHeight = lastValidBlockHeight;
            buyTx.feePayer = signerKeypair.publicKey;

            const finalTx = await ConstructOptimalTransaction(buyTx, connection, priorityFee);

            finalTx.sign(signerKeypair);

            const jitoAuthKeypair = getKeypairFromBs58(jitoAuthPrivateKey);


            const bundleTransactionLimit = 1;
            const search = searcherClient(blockEngineUrl, jitoAuthKeypair);

            const bundleCtx = await buildBundle(
                search,
                bundleTransactionLimit,
                finalTx,
                signerKeypair,
                jitoTip,
            );

            if (bundleCtx != null) {
                const bundleResult = await onBundleResult(search, bundleCtx, connection);

                if (bundleResult[2]) {
                    console.log(chalk.red('Could not confirm bundle status in 30 seconds.'));
                    console.log(chalk.red('Check Solscan for confirmation.'));
                    await sleep(3000);
                    console.log('\n');
                    //clearInterval(blockInterval);
                    bundleResult[1]()
                    break
                }
                if (bundleResult[0]) {
                    console.log(chalk.greenBright.bold('Successful! '));
                    addTradeEntry('buy', inputtedMint, finalAmount)
                    console.log('\n');
                    break
                    //return
                } else {
                    console.log(chalk.gray('Retries left: '), chalk.whiteBright.bold(maxRetries - buyRetries), '\n');
                    console.log('\n');
                    bundleResult[1]()
                    buyRetries += 1;
                    continue
                }
            } else {
                throw new Error
            }
        }

        if (buyRetries >= maxRetries) {
            console.log('\n')
            console.log(chalk.red('Max Retries Reached.\n\n'));
            await sleep(5000);
        }





        console.log('\n\n');
        let isSelling: boolean;
        const isSellingInput = (await getUserInput(chalk.grey("Want to auto sell(Y/n)?: ")));
        if (isSellingInput.toLowerCase() == 'y') {
            isSelling = true;
        } else if (isSellingInput.toLowerCase() == 'n') {
            isSelling = false;
        } else {
            console.log(chalk.red.bold('Invalid Input'));
            await sleep(3000); return;
        }

        if (!isSelling) { return }

        console.log('\n');
        console.log(chalk.gray('enter MAX or HALF for convenience'));
        const inputtedAmount = (await getUserInput(chalk.grey("Enter Amount to sell: ")));
        let numberAmount: 'max' | 'half' | number;
        if (inputtedAmount.toLowerCase() == 'max') { numberAmount = 'max' }
        else if (inputtedAmount.toLowerCase() == 'half') { numberAmount = 'half' }
        else { numberAmount = Number(inputtedAmount) }

        if (!numberAmount) {
            console.log(chalk.red.bold('Invalid token amount'));
            await sleep(3000); return;
        }


        let userAta = getAssociatedTokenAddressSync(new PublicKey(inputtedMint), signerKeypair.publicKey, false);
        let userAtaData: Account | null = null
        await getAccount(connection, userAta, 'processed')
            .then(e => { userAtaData = e })
            .catch(e => { userAtaData = null });

        if (userAtaData == null) {
            console.log(chalk.red.bold('No balance found for provided token'));
            await sleep(3000); return;
        } else if (typeof numberAmount === 'number' && Number((userAtaData as Account).amount) / (10 ** decimals) < numberAmount) {
            console.log(chalk.red.bold('insufficient balance'));
            await sleep(3000); return;
        } else if (numberAmount == 0 || numberAmount as number < 0) {
            console.log(chalk.red.bold('invalid amount'));
            await sleep(3000); return;
        }

        let sellAmount: number = 0;
        if (numberAmount == 'half') {
            sellAmount = Math.floor(Number((userAtaData as Account).amount) / 2)
        } else if (numberAmount == 'max') {
            sellAmount = Number((userAtaData as Account).amount);
        } else {
            sellAmount = Math.floor(numberAmount * (10 ** decimals))
        }


        let percentageGain: number = 0;
        let percentageLoss: number = 0;
        console.log('\n');


        console.log(chalk.gray('eg: 69 (+69% from current price.)'));
        console.log(chalk.gray('eg: 300 (+300% from current price.)'));
        console.log(chalk.gray('eg: 420 (+420% from current price.)'));
        const percentageGainString = (await getUserInput(chalk.grey("Enter percentage gain to profit at: ")));
        percentageGain = Number(percentageGainString);
        if (!percentageGain || percentageGain >= 100000 || percentageGain < 0) {
            console.log(chalk.red.bold('Invalid percentage gain Input'));
            await sleep(3000); return;
        }
        console.log('\n');

        console.log(chalk.gray('eg: 69 (-69% from current price.)'));
        console.log(chalk.gray('eg: 300 (-300% from current price.)'));
        console.log(chalk.gray('eg: 420 (-420% from current price.)'));
        const percentageLossString = (await getUserInput(chalk.grey("Enter percentage loss to cut losses at: ")));
        percentageLoss = Number(percentageLossString);
        if (!percentageLoss || percentageLoss >= 100000 || percentageLoss < 0) {
            console.log(chalk.red.bold('Invalid percentage loss Input'));
            await sleep(3000); return;
        }



        //@ts-ignore
        const supply = mintData.value?.data.parsed.info.supply;

        const virtualTokenReserves = (bondingCurveData.virtualTokenReserves as any).toNumber();
        const virtualSolReserves = (bondingCurveData.virtualSolReserves as any).toNumber();

        const adjustedVirtualTokenReserves = virtualTokenReserves / (10 ** decimals);
        const adjustedVirtualSolReserves = virtualSolReserves / LAMPORTS_PER_SOL;


        const virtualTokenPrice = adjustedVirtualSolReserves / adjustedVirtualTokenReserves;
        let currentPrice = virtualTokenPrice;

        let shouldSell: boolean = false;
        clearConsole();


        while (!shouldSell) {

            const newPrice = await fetchPrice(
                decimals,
                bondingCurvePda,
                program,
                currentPrice,
            );
            clearConsole();
            console.log('\n');

            console.log(chalk.gray(`Intent/Spot Price: ${chalk.whiteBright.bold(virtualTokenPrice.toFixed(15))}`));
            console.log(chalk.gray(`Live Price: ${chalk.whiteBright.bold(newPrice.toFixed(15))}`));
            const [pnlPercentage, direction] = calculatePnl(virtualTokenPrice, newPrice);

            if (direction == -1) {
                console.log(chalk.gray(`PNL: ${chalk.redBright.bold(pnlPercentage.toFixed(3))}%`))
            } else if (direction == 0) {
                console.log(chalk.gray(`PNL: ${chalk.whiteBright.bold(pnlPercentage.toFixed(3))}%`))
            } else {
                console.log(chalk.gray(`PNL: ${chalk.greenBright.bold(pnlPercentage.toFixed(3))}%`))
            }

            console.log('Ctrl + c to cancel...')


            if (direction == 1 && pnlPercentage >= percentageGain) {
                console.log('\n')
                console.log(chalk.greenBright.bold(`Target % Gain Hit, Selling ${chalk.whiteBright.bold(inputtedAmount)} ${inputtedMint.substring(0, 8)}..`))
                shouldSell = true
            }

            if (direction == -1 && (pnlPercentage * -1) >= percentageLoss) {
                console.log('\n')
                console.log(chalk.blue.bold(`Target % Loss Hit, Selling ${chalk.whiteBright.bold(inputtedAmount)} ${inputtedMint.substring(0, 8)}..`))
                shouldSell = true
            }

            if (!shouldSell) {
                await sleep(1000);
            }



        }

        const tx = new Transaction();


        let retries = 0;
        while (retries >= 0 && retries <= (maxRetries ? Math.max(1, maxRetries) : 5)) {


            const SellIx = await program.methods.sell(
                new BN(sellAmount),
                new BN(0)
            ).accounts({
                global: globalStatePda,
                feeRecipient: feeRecipient,
                mint: inputtedMint,
                bondingCurve: bondingCurvePda,
                associatedBondingCurve: bondingCurveata,
                associatedUser: userAta,
                user: signerKeypair.publicKey,
                associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
                rent: SYSVAR_RENT_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
                eventAuthority: EVENT_AUTH,
                program: program.programId,
            }).instruction();


            tx.add(SellIx);

            const memoix = new TransactionInstruction({
                programId: new PublicKey(MEMO_PROGRAM_ID),
                keys: [],
                data: Buffer.from(getRandomNumber().toString(), "utf8")
            })
            tx.add(memoix);

            //preparing transaction
            const hashAndCtx = await connection.getLatestBlockhashAndContext('confirmed');
            const recentBlockhash = hashAndCtx.value.blockhash;
            const lastValidBlockHeight = hashAndCtx.value.lastValidBlockHeight;

            tx.recentBlockhash = recentBlockhash;
            tx.lastValidBlockHeight = lastValidBlockHeight;
            tx.minNonceContextSlot = hashAndCtx.context.slot;
            tx.feePayer = signerKeypair.publicKey;

            const finalTx = await ConstructOptimalTransaction(tx, connection, priorityFee);

            finalTx.sign(signerKeypair);


            const jitoAuthKeypair = getKeypairFromBs58(jitoAuthPrivateKey);


            const bundleTransactionLimit = 1;
            const search = searcherClient(blockEngineUrl, jitoAuthKeypair);

            const bundleCtx = await buildBundle(
                search,
                bundleTransactionLimit,
                finalTx,
                signerKeypair,
                jitoTip,
            );

            if (bundleCtx != null) {
                const bundleResult = await onBundleResult(search, bundleCtx, connection);

                if (bundleResult[2]) {
                    console.log(chalk.red('Could not confirm bundle status in 30 seconds.'));
                    console.log(chalk.red('Check Solscan for confirmation.'));
                    await sleep(3000);
                    console.log('\n');
                    //clearInterval(blockInterval);
                    bundleResult[1]()
                    process.exit(1);
                }

                if (bundleResult[0]) {
                    console.log(chalk.greenBright.bold('Successful! '));
                    console.log('\n')
                    addTradeEntry('sell', inputtedMint, Math.floor(sellAmount / (10 ** decimals)));
                    bundleResult[1]();
                    await sleep(5000);
                    break
                } else {
                    console.log(chalk.gray('Retries left: '), chalk.whiteBright.bold(maxRetries - retries), '\n');
                    console.log('\n');
                    bundleResult[1]()
                }
            } else {
                console.log(chalk.red('an error has occurred'));
            }
        }

        if (retries >= maxRetries) {
            console.log('\n')
            console.log(chalk.red('Max Retries Reached.\n\n'));
            await sleep(5000);
        }



        // Clear expired entries from the cache every second
        //setInterval(() => {
        //    removeExpiredEntries(cache)
        //}, 1000);




    } catch (e) {
        console.log(e);
        console.log(chalk.red('An error has occurred, check inputs or try again'));
        process.exit(1);
    }
}

//buy()