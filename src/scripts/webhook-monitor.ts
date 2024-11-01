import { validateSolAddress, getKeypairFromBs58, ConstructOptimalTransaction, getRandomNumber, buildBundle, onBundleResult, getCurrentDateTime } from "../utils";
import idl from "../constants/idl.json";
import { TransactionInstruction, Connection, LAMPORTS_PER_SOL, PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram, Transaction, PartiallyDecodedInstruction, ParsedInstruction, ParsedTransactionWithMeta, } from "@solana/web3.js"
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import dotenv from "dotenv";
import { parseSignatures } from "../utils";
import WebSocket from "ws";
import { sleep, getUserInput } from "../utils";
import { searcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import { programID } from "../constants";
import chalk from "chalk";
import fs from "fs"
import { Metaplex, toPurchaseReceiptAccount } from "@metaplex-foundation/js";
import disc from "discord.js";
import { convertIPFSURL } from "../utils";
import readline from "readline";
async function fetch_metadata(connection: Connection, mint_address: PublicKey) {
    try {
        const metaplex = Metaplex.make(connection);
        const data = await metaplex.nfts().findByMint({ mintAddress: mint_address, loadJsonMetadata: false, }, { commitment: 'processed', });
        return data;
    } catch (e) {
        return {}
    }
}

//sending discord ember notifier
async function send_to_discord(connection: Connection, neededIx: any, client: disc.WebhookClient) {

    try {

        //getting needed accounts
        const accounts = neededIx.accounts
        const mint = accounts[0];
        const mintAuth = accounts[1];
        const bondingCurve = accounts[2];
        const bondingCurveAta = accounts[3];
        const globalState = accounts[4];
        //console.log(neededIx);
        //console.log(accounts);

        await sleep(1500);
        const metadata = await fetch_metadata(connection, new PublicKey(mint));

        let mintImage: string;
        let mintSymbol = '---';
        let mintName = 'Unknown';


        try {
            //@ts-ignore
            const brokenUrl = metadata.uri;
            //console.log(brokenUrl);
            const newURL = convertIPFSURL(brokenUrl);
            //console.log(newURL)
            const metadataJson = await fetch(newURL).then(e => e.json());
            const brokenImageUrl = metadataJson.image;
            mintName = metadataJson.name;
            mintSymbol = metadataJson.symbol

            //console.log(brokenImageUrl)
            mintImage = convertIPFSURL(brokenImageUrl);
            //console.log(mintImage);
        } catch (e) {
            console.log(e);
            mintImage = 'https://pump.fun/_next/image?url=%2Flogo.png&w=64&q=75';
        }

        mintImage = convertIPFSURL(mintImage);
        //console.log(mintImage);

        var good_embed = new disc.EmbedBuilder();
        good_embed.setTitle("PumpX - New Coins")
        good_embed.setDescription("New Coin detected!\n" + "\n[Pump.fun](https://pump.fun/" + mint + ") [Solscan](https://solscan.io/token/" + mint + ")");
        good_embed.setColor(0x581672)
        good_embed.addFields({ name: 'Token Address', value: typeof mint === 'string' ? mint : mint.toBase58(), inline: true }, { name: "Ticker", value: "$" + mintSymbol.toUpperCase(), inline: false }, { name: "Name", value: mintName, inline: true });
        good_embed.setThumbnail('https://cdn.discordapp.com/icons/1229669816906809364/2a621b9a243e532239b8f9a4c01d11aa.webp?size=240');
        good_embed.setAuthor({
            name: 'iSy',
            url: 'https://github.com/iSyqozz/',
            iconURL: 'https://pump.fun/_next/image?url=%2Flogo.png&w=64&q=75',
        })

        //console.log(mintImage);
        good_embed.setImage(mintImage);
        good_embed.setFooter({ text: "@PumpX", iconURL: "https://cdn.discordapp.com/icons/1229669816906809364/2a621b9a243e532239b8f9a4c01d11aa.webp?size=240" })
        good_embed.setTimestamp(Date.now());
        //console.log('before sending to channel')
        await client.send({ embeds: [good_embed] });
        console.log(chalk.blueBright.bold(`${getCurrentDateTime()} Discord Channel notified.`));
    } catch (e) {

    }
};





export async function webhookMonitor() {

    try {


        //const pk = process.env.SIGNER_PRIVATE_KEY as string;
        //if (!pk || pk == '<YOUR SIGNER KEYPAIR HERE>') {
        //    console.log('missing signer keypair');
        //    console.log('please fill it in .env file');
        //    return
        //}

        const url = process.env.RPC_URL as string;
        if (!url || url == '<YOUR RPC URL HERE>') {
            console.log(chalk.red.bold.bold('Missing rpc endpoint'));
            console.log(chalk.red.bold.bold('Please fill it in .env file'));
            await sleep(3000); return;
        }

        const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL as string;
        if (!discordWebhookUrl || discordWebhookUrl == '<YOUR DISCORD WEBHOOK URL HERE>') {
            console.log(chalk.red.bold.bold('Missing discord webhook link'));
            console.log(chalk.red.bold.bold('Please fill it in .env file'));
            await sleep(3000); return;
        }


        let heliusKey: string;

        const heliusAPIkeyString = process.env.HELIUS_API_KEY as string;
        if (!heliusAPIkeyString || heliusAPIkeyString == '<YOUR DISCORD WEBHOOK URL HERE>') {
            heliusKey = '';
        } else {
            heliusKey = heliusAPIkeyString
        }




        console.log('\n');
        console.log(chalk.cyan.bold(`Monitoring for new coins..`));
        console.log('\n');
        console.log(chalk.magenta('enter "b" to return to menu...'));

        console.log('\n')

        const discordClient = new disc.WebhookClient({ url: discordWebhookUrl });



        async function runWithPolling() {
            const connection = new Connection(process.env.RPC_URL as string, { commitment: 'confirmed', });

            const cache = new Set<string>();
            setInterval(() => { cache.clear() }, 120 * 1000);
            var Stopped = false;

            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });

            rl.on('line', (input) => {
                if (input.toLowerCase() === 'b') {
                    Stopped = true;
                    rl.close();
                }
            });


            while (!Stopped) {

                const data = await connection.getConfirmedSignaturesForAddress2(new PublicKey(programID), { limit: 10, },);
                const confirmed_sigs: string[] = data.filter(e => !e.err).map(e => e.signature);

                if (confirmed_sigs.length === 0) {
                    await sleep(1000);
                    console.log('\n')
                    console.log(chalk.red.bold('Failed to fetch Signatures retrying'))
                    continue
                }

                const parsed_sigs = await parseSignatures(connection, confirmed_sigs);


                for (var i = 0; i < parsed_sigs.length; i++) {
                    try {
                        const sig = parsed_sigs[i];
                        if (!sig) { continue }

                        const blockTime = sig.blockTime ?? 0;
                        const currentTime = Math.floor(Date.now() / 1000);

                        //@ts-ignore
                        const instructions = (sig.transaction.message.instructions);
                        for (let ix of instructions) {
                            try {
                                //@ts-ignore
                                const hasNeededAccounts = ix.accounts.length == 14;

                                if (hasNeededAccounts) {
                                    if (blockTime && currentTime - blockTime <= 60 && !cache.has(confirmed_sigs[i])) {
                                        cache.add(confirmed_sigs[i]);
                                        console.log(chalk.blueBright.bold(`${getCurrentDateTime()} New Coin Detected..,`))
                                        send_to_discord(connection, ix, discordClient);
                                        break
                                    }
                                }
                            } catch (e) {
                                continue
                            }
                        }
                        if (Stopped) { return }

                    } catch (e) {
                        continue
                    }
                }
                if (Stopped) { return }
            }
        }

        async function runWithTxSubscribe() {

            return new Promise<void>((resolve, reject) => {
                const websocket = new WebSocket('wss://atlas-mainnet.helius-rpc.com?api-key=' + process.env.HELIUS_API_KEY as string,);
                const connection = new Connection(process.env.RPC_URL as string, { commitment: 'processed', });

                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout,
                });


                rl.on('line', async (input) => {
                    if (input.toLowerCase() === 'b') {
                        websocket.close(1000, 'user requested to close socket');
                        resolve();
                        rl.close();
                    }
                });


                if (!websocket) { return }

                // Function to send a request to the WebSocket server
                function sendRequest(ws: WebSocket) {
                    const request = {
                        jsonrpc: "2.0",
                        id: 1,
                        method: "transactionSubscribe",
                        params: [
                            {
                                accountInclude: ['TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM'],
                                vote: false,
                                failed: false,
                            },
                            {
                                commitment: "processed",
                                encoding: "jsonParsed",
                                transactionDetails: "full",
                                showRewards: false,
                                maxSupportedTransactionVersion: 0,
                            }
                        ]
                    };
                    ws.send(JSON.stringify(request));
                }


                websocket.onopen = () => {
                    console.log(chalk.gray.bold('Successfully initiated websocket connection.'));
                    console.log('\n');
                    sendRequest(websocket);  // Send a request once the WebSocket is open
                }

                websocket.onmessage = (data) => {
                    const messageStr = data.data.toString('utf8');
                    try {

                        const messageObj = JSON.parse(messageStr);
                        const txData = (messageObj.params.result.transaction);
                        if (txData.meta.err) { return }

                        const instructions = (txData.transaction.message.instructions);


                        for (let ix of instructions) {
                            try {
                                const hasNeededAccounts = ix.accounts.length == 14;

                                if (hasNeededAccounts) {
                                    console.log(chalk.blueBright.bold(`${getCurrentDateTime()} New Coin Detected..,`))
                                    send_to_discord(connection, ix, discordClient);
                                    break
                                }
                            } catch (e) {
                                continue
                            }
                        }

                    } catch (e) {
                        //console.log(chalk.red.bold(`${getCurrentDateTime()} failed to parse data.`));
                    }
                }

            })

        }


        if (!heliusKey) {
            await runWithPolling();
        } else {
            await runWithTxSubscribe()
        }


        //while (true){
        //    
        //}

    } catch (e) {
        console.log(e);
        console.log(chalk.red('an error has occurred'));
        process.exit(1);
    }
}

//webhookMonitor()