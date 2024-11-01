import { validateSolAddress, getKeypairFromBs58, ConstructOptimalTransaction, getRandomNumber, buildBundle, onBundleResult, getCurrentDateTime, roundUpToNonZeroString, addTradeEntry, decodeCreateV3AndGetValues, compareNames, compareTickers, fetchPrice, calculatePnl } from "../utils";
import idl from "../constants/idl.json";
import { TransactionInstruction, Connection, LAMPORTS_PER_SOL, PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram, Transaction, PartiallyDecodedInstruction, ParsedInstruction, ParsedTransactionWithMeta, } from "@solana/web3.js"
import { Account, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createAssociatedTokenAccountInstruction, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { parseSignatures } from "../utils";
import { sleep, getUserInput, getBlockInfo, getOptionPromptText } from "../utils";
import { searcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import { getCreateMetadataAccountV3InstructionDataSerializer } from "@metaplex-foundation/mpl-token-metadata";
import {
    programID,
    MEMO_PROGRAM_ID,
    feeRecipient,
    EVENT_AUTH,
    pumpTokenDecimals
} from "../constants"
import { ASSOCIATED_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import chalk, { Chalk } from "chalk";
import { clearConsole } from '../utils/cli';
import { BlockInfo } from "../constants/types";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

export async function monitorSnipe() {
    try {

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


        const connection = new Connection(process.env.RPC_URL as string, { commitment: 'confirmed', });
        const signerKeypair = getKeypairFromBs58(pk);
        const jitoAuthKeypair = getKeypairFromBs58(jitoAuthPrivateKey);
        const search = searcherClient(blockEngineUrl, jitoAuthKeypair);
        //initializing program
        const program = new Program(idl as anchor.Idl, programID, new anchor.AnchorProvider(connection, new NodeWallet(signerKeypair), anchor.AnchorProvider.defaultOptions()));



        console.log('\n')
        console.log(chalk.blueBright.bold('Choose one of the options below:\n'));
        console.log(chalk.gray(chalk.gray('[1] - Track specific creator wallet')));
        console.log(chalk.gray(chalk.gray('[2] - Monitor for specific name' + chalk.red(' (Caution)'))));
        console.log(chalk.gray(chalk.gray('[3] - Monitor for specific ticker/symbol' + chalk.red(' (Caution)'))));
        console.log('\n')
        const option = (await getUserInput(chalk.grey('Choice: ')))
        if (!['1', '2', '3'].includes(option)) {
            console.log(chalk.red.bold('Invalid Choice'));
            await sleep(3000); return;
        }

        //getting the option to track:
        const inputtedWallet = (await getUserInput(chalk.grey(getOptionPromptText(option))));
        if (option == '1' && !validateSolAddress(inputtedWallet)) {
            console.log(chalk.red.bold('Invalid input for option'));
            await sleep(3000); return;
        }

        const inputtedAmount = (await getUserInput(chalk.grey("Enter the amount of sol to snipe with: ")));
        const numberAmount = Number(inputtedAmount);
        if (!numberAmount) {
            console.log(chalk.red.bold('Invalid sol amount'));
            await sleep(3000); return;
        }


        const minMaxAmount = numberAmount + (numberAmount * 0.15);

        const inputtedMaxSolCost = (await getUserInput(chalk.grey(`Enter the maximum amount of SOL accounting to slippage (min ${roundUpToNonZeroString(parseFloat((minMaxAmount).toFixed(6)))} SOL): `)));
        const maxSolCost = Number(inputtedMaxSolCost);
        if (!maxSolCost || maxSolCost < minMaxAmount) {
            console.log(chalk.red.bold('Invalid Maximum sol amount'));
            await sleep(3000); return;
        }


        //getting the micro lamports for compute budget price:
        let priorityFee: number = -1;
        const inputtedPriorityFee = (await getUserInput(chalk.grey("Enter Priority-fee in micro-lamports ('default' for default high fee): ")));
        if (inputtedPriorityFee.toUpperCase() != 'DEFAULT') {
            priorityFee = Number(inputtedPriorityFee);
            if (!priorityFee || priorityFee < 0) {
                console.log(chalk.red.bold('Invalid priority fee Input'));
                await sleep(3000); return;
            }
        }
        clearConsole()
        console.log('\n');

        if (option == '1') {
            console.log(chalk.blueBright.bold(`Monitoring wallet ${chalk.whiteBright.bold(inputtedWallet)} for new coins\n`));
        } else if (option == '2') {
            console.log(chalk.blueBright.bold(`Monitoring for token with name: ${chalk.whiteBright.bold(inputtedWallet)}\n`));
        } else {
            console.log(chalk.blueBright.bold(`Monitoring for token with ticker: ${chalk.whiteBright.bold(inputtedWallet)}\n`));
        }


        var blockInfoProvider = await getBlockInfo(connection);
        const blockInterval = setInterval(() => {
            getBlockInfo(connection)
                .then(res => blockInfoProvider = res)
                .catch(e => { })
        }, 3 * 1000);


        //start monitoring

        let neededInstruction: PartiallyDecodedInstruction | ParsedInstruction | null = null;
        let parsedSig: ParsedTransactionWithMeta | null = null

        while (neededInstruction == null) {
            const data = await connection.getConfirmedSignaturesForAddress2(new PublicKey(option == '1' ? inputtedWallet : 'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM'), { limit: 10, },);
            const confirmed_sigs: string[] = data.filter(e => !e.err).map(e => e.signature);
            //console.log(blockInfoProvider);

            if (confirmed_sigs.length === 0) {
                await sleep(500);
                console.log('\n')
                console.log(chalk.red.bold('No signatures found, polling for new signatures..'))
                continue
            }
            //console.log(confirmed_sigs);

            const parsed_sigs = await parseSignatures(connection, confirmed_sigs);


            for (var i = 0; i < parsed_sigs.length; i++) {
                try {
                    const sig = parsed_sigs[i];
                    if (!sig) { continue }

                    const blockTime = sig.blockTime;
                    const currentTime = Math.floor(Date.now() / 1000);

                    //@ts-ignore
                    const instructions = (sig.transaction.message.instructions);
                    for (let ix of instructions) {
                        try {
                            const hasNeededProgramId = (ix.programId.toBase58() == programID);
                            //@ts-ignore
                            //console.log(ix.accounts.length);
                            //console.log(ix.programId.toBase58());
                            //console.log(confirmed_sigs[i])


                            //@ts-ignore
                            const hasNeededAccounts = ix.accounts.length == 14;

                            if (hasNeededProgramId && hasNeededAccounts) {
                                //transaction should should be processed within one minute of detecting it here
                                if (blockTime && currentTime - blockTime <= 60) {
                                    //console.log(`${getCurrentDateTime()} Old Bonding Curve detected, Ignoring stale pool...`)

                                    if (option != '1') {
                                        //@ts-ignore
                                        const data = sig!.meta!.innerInstructions[0]!.instructions[8].data as string
                                        const [name, ticker] = decodeCreateV3AndGetValues(data);
                                        const validationRes = option == '2' ? compareNames(inputtedWallet, name) : compareTickers(inputtedWallet, ticker);
                                        //console.log(name, ticker);
                                        //console.log(validationRes);
                                        //console.log(`${chalk.blueBright.bold(getCurrentDateTime())} ${chalk.grey(`Found token with name: ${chalk.whiteBright.bold(name)} and ticker: ${chalk.whiteBright.bold(name)}`)}`);
                                        if (validationRes) {
                                            console.log(chalk.greenBright.bold('MATCH!'));
                                            console.log('\n');
                                            neededInstruction = ix;
                                            parsedSig = sig
                                            break
                                        }
                                    } else {
                                        neededInstruction = ix;
                                        parsedSig = sig
                                        break;
                                    }

                                }
                            }
                        } catch (e) {
                            continue
                        }
                    }
                    if (neededInstruction) { break };

                } catch (e) {
                    continue
                }
                if (neededInstruction) { break };
            }

            if (neededInstruction) { break };

            console.log(`${chalk.blueBright.bold(getCurrentDateTime())} ${chalk.grey('No Bonding Curves found. Polling for new signatures... (ctrl + c to cancel)')}`);
            await sleep(500);
        }


        if (!neededInstruction) { return }

        console.log(chalk.gray(`\nFound new pool/bonding-curve, Sniping with ${chalk.whiteBright.bold(numberAmount)} SOL..\n\n`));



        //@ts-ignore

        //getting needed accounts
        const accounts = neededInstruction.accounts
        const mint = accounts[0];
        //const mintAuth = accounts[1];
        const bondingCurve = accounts[2];
        const bondingCurveAta = accounts[3];
        const globalState = accounts[4];
        const user = signerKeypair.publicKey;
        const userAta = getAssociatedTokenAddressSync(mint, user, true);
        const signerTokenAccount = getAssociatedTokenAddressSync(mint, user, true, TOKEN_PROGRAM_ID,);


        const [bondingCurveData] = await Promise.all([
            program.account.bondingCurve.fetch(bondingCurve),
            //connection.getParsedAccountInfo(mint),
            //connection.getAccountInfo(signerTokenAccount, 'processed')
        ]);


        //@ts-ignore
        const virtualTokenReserves = (bondingCurveData.virtualTokenReserves as any).toNumber();
        const virtualSolReserves = (bondingCurveData.virtualSolReserves as any).toNumber();

        const adjustedVirtualTokenReserves = virtualTokenReserves / (10 ** pumpTokenDecimals);
        const adjustedVirtualSolReserves = virtualSolReserves / LAMPORTS_PER_SOL;


        const virtualTokenPrice = adjustedVirtualSolReserves / adjustedVirtualTokenReserves;
        const finalAmount = (numberAmount / virtualTokenPrice);


        //console.log(adjustedVirtualSolReserves);
        //console.log(adjustedVirtualTokenReserves);
        //
        //console.log(finalAmount);
        //console.log(virtualTokenPrice);
        //console.log(virtualTokenReserves);
        //console.log(virtualSolReserves);
        //console.log(decimals);
        //console.log(mint);
        //console.log(bondingCurve);
        //console.log(finalAmount);



        let retries = 0;
        while (retries <= (maxRetries ? Math.max(1, maxRetries) : 5)) {

            //creating tx;
            const tx = new Transaction();

            tx.add(
                createAssociatedTokenAccountIdempotentInstruction(
                    user,
                    signerTokenAccount,
                    user,
                    mint,
                )
            )
            const snipeIx = await program.methods.buy(
                new BN((finalAmount * (10 ** pumpTokenDecimals))),
                new BN(maxSolCost * LAMPORTS_PER_SOL),
            ).accounts({
                global: globalState,
                feeRecipient: feeRecipient,
                mint: mint,
                bondingCurve: bondingCurve,
                associatedBondingCurve: bondingCurveAta,
                associatedUser: userAta,
                user: user,
                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                rent: SYSVAR_RENT_PUBKEY,
                eventAuthority: EVENT_AUTH,
                program: program.programId,
            }).instruction();
            tx.add(snipeIx);


            //const memoix = new TransactionInstruction({
            //    programId: new PublicKey(MEMO_PROGRAM_ID),
            //    keys: [],
            //    data: Buffer.from(getRandomNumber().toString(), "utf8")
            //})
            //tx.add(memoix);

            //preparing transaction

            tx.recentBlockhash = blockInfoProvider.blockHash;
            tx.lastValidBlockHeight = blockInfoProvider.blockHeight;
            tx.minNonceContextSlot = blockInfoProvider.minContextSlot;
            tx.feePayer = user;
            const finalTx = await ConstructOptimalTransaction(tx, connection, priorityFee);
            finalTx.sign(signerKeypair);

            const bundleTransactionLimit = 1;

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
                    console.log(chalk.red('Could not confirm bundle status for more than 30 seconds.'));
                    console.log(chalk.red('Check Solscan for confirmation.'));
                    await sleep(3000);
                    console.log('\n');
                    bundleResult[1]();
                    break
                }


                if (bundleResult[0]) {
                    console.log(chalk.greenBright.bold('Successful! '));
                    addTradeEntry('buy', mint.toBase58(), finalAmount)
                    console.log('\n')
                    await sleep(500)
                    bundleResult[1]()
                    break
                } else {
                    console.log(chalk.gray('Retries left: '), chalk.whiteBright.bold(maxRetries - retries), '\n');
                    console.log('\n');
                    bundleResult[1]()
                    retries += 1;
                    continue
                }
            } else {
                console.log(chalk.red('an error has occurred'));
            }
        }

        if (retries >= maxRetries) {
            console.log('\n')
            console.log(chalk.red('Max Retries Reached.\n\n'));
            await sleep(4000);
            return
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
        const sellInputtedAmount = (await getUserInput(chalk.grey("Enter Amount to sell: ")));
        let sellNumberAmount: 'max' | 'half' | number;
        if (sellInputtedAmount.toLowerCase() == 'max') { sellNumberAmount = 'max' }
        else if (sellInputtedAmount.toLowerCase() == 'half') { sellNumberAmount = 'half' }
        else { sellNumberAmount = Number(sellInputtedAmount) }

        if (!numberAmount) {
            console.log(chalk.red.bold('Invalid token amount'));
            await sleep(3000); return;
        }



        let userAtaData: Account | null = null
        await getAccount(connection, userAta, 'processed')
            .then(e => { userAtaData = e })
            .catch(e => { userAtaData = null });

        if (userAtaData == null) {
            console.log(chalk.red.bold('No balance found for provided token'));
            await sleep(3000); return;
        } else if (typeof sellNumberAmount === 'number' && Number((userAtaData as Account).amount) / (10 ** pumpTokenDecimals) < sellNumberAmount) {
            console.log(chalk.red.bold('insufficient balance'));
            await sleep(3000); return;
        } else if (sellNumberAmount == 0 || sellNumberAmount as number < 0) {
            console.log(chalk.red.bold('invalid amount'));
            await sleep(3000); return;
        }

        let sellAmount: number = 0;
        if (sellNumberAmount == 'half') {
            sellAmount = Math.floor(Number((userAtaData as Account).amount) / 2)
        } else if (sellNumberAmount == 'max') {
            sellAmount = Number((userAtaData as Account).amount);
        } else {
            sellAmount = Math.floor(sellNumberAmount * (10 ** pumpTokenDecimals))
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
        let currentPrice = virtualTokenPrice;
        let shouldSell: boolean = false;
        clearConsole();


        while (!shouldSell) {

            const newPrice = await fetchPrice(
                pumpTokenDecimals,
                bondingCurve,
                program,
                currentPrice,
            );
            clearConsole();
            console.log('\n');


            console.log(chalk.gray(`Intent/Spot Price: ${chalk.whiteBright.bold(virtualTokenPrice.toFixed(13))}`));
            console.log(chalk.gray(`Live Price: ${chalk.whiteBright.bold(newPrice.toFixed(13))}`));
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
                console.log(chalk.greenBright.bold(`Target % Gain Hit, Selling ${chalk.whiteBright.bold(sellInputtedAmount)} ${mint.toBase58().substring(0, 8)}..`))
                shouldSell = true
            }

            if (direction == -1 && (pnlPercentage * -1) >= percentageLoss) {
                console.log('\n')
                console.log(chalk.blue.bold(`Target % Loss Hit, Selling ${chalk.whiteBright.bold(sellInputtedAmount)} ${mint.toBase58().substring(0, 8)}..`))
                shouldSell = true
            }

            if (!shouldSell) {
                await sleep(1000);
            }
        }


        const tx = new Transaction();
        let sellRetries = 0;

        while (sellRetries >= 0 && sellRetries <= (maxRetries ? Math.max(1, maxRetries) : 5)) {

            const SellIx = await program.methods.sell(
                new BN(sellAmount),
                new BN(0)
            ).accounts({
                global: globalState,
                feeRecipient: feeRecipient,
                mint: mint,
                bondingCurve: bondingCurve,
                associatedBondingCurve: bondingCurveAta,
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

            tx.recentBlockhash = blockInfoProvider.blockHash;
            tx.lastValidBlockHeight = blockInfoProvider.blockHeight;
            tx.minNonceContextSlot = blockInfoProvider.minContextSlot;
            tx.feePayer = user;


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
                    addTradeEntry('sell', mint.toBase58(), Math.floor(sellAmount / (10 ** pumpTokenDecimals)));
                    bundleResult[1]();
                    await sleep(5000);
                    break
                } else {
                    console.log(chalk.gray('Retries left: '), chalk.whiteBright.bold(maxRetries - sellRetries), '\n');
                    console.log('\n');
                    bundleResult[1]()
                }
            } else {
                console.log(chalk.red('an error has occurred'));
            }
        }

        if (sellRetries >= maxRetries) {
            console.log('\n')
            console.log(chalk.red('Max Retries Reached.\n\n'));
            await sleep(5000);
        }

        //process.exit(0)

    } catch (e) {
        console.log(e);
        console.log(chalk.red('an error has occurred'));
        process.exit(1);
    }
}

//monitorSnipe()