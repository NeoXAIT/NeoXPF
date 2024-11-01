
import chalk from "chalk";
import { loginEndpoint, registerEndpoint } from "../constants";
import { convertIPFSURL, extractAddressFromUrl, getKeypairFromBs58, getUserInput, sleep } from "../utils";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getCurrentDateTime } from "../utils";
import { decodeUTF8 } from "tweetnacl-util";
import nacl from "tweetnacl"
import { GeneratedWalletEntry } from '../constants/types';
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import comments from "../constants/comments.json";
import * as pdas from "../utils/pdas";
import { Program } from "@coral-xyz/anchor";
import idl from "../constants/idl.json"
import * as anchor from "@coral-xyz/anchor"
import { programID } from "../constants";
import { Connection } from "@solana/web3.js";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { Metaplex } from "@metaplex-foundation/js";
import { repliesEndpoint } from "../constants";


//logging in to receiver authentication bearer token
async function login(keypair: Keypair) {

    try {
        const time = Date.now();

        const signingMessage = ('Sign in to pump.fun: '.concat(time.toString()));
        const messageBytes = decodeUTF8(signingMessage);
        const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
        const hexString = Buffer.from(signature).toString('hex');

        const base58Encoded = bs58.encode(Buffer.from(hexString, 'hex'));
        //console.log(base58Encoded)
        //console.log(b64);
        //console.log(signature)
        //console.log(time)
        const loginRes = await fetch(loginEndpoint, {
            method: 'POST',
            mode: 'cors',
            headers: {
                "Content-Type": "application/json",
                "Origin": "https://pump.fun",
                "Referer": "https://pump.fun/",
                "Host": "client-api-2-74b1891ee9f9.herokuapp.com",
                "Accept": "*/*"
            },
            body: JSON.stringify({
                address: keypair.publicKey.toBase58(),
                signature: base58Encoded,
                timestamp: time,
            })
        }).then(res => res.json())
            .catch(e => console.log(e));


        return loginRes.access_token ?? null;

    } catch (e) {
        return null
    }
}


async function register(entry: GeneratedWalletEntry) {

    const res = await fetch(registerEndpoint, {
        method: 'POST',
        mode: 'cors',
        headers: {
            "Content-Type": "application/json",
            "Origin": "https://pump.fun",
            "Referer": "https://pump.fun/",
            "Host": "client-api-2-74b1891ee9f9.herokuapp.com",
            "Accept": "*/*",
            "Authorization": "Bearer ".concat(entry.token),
        },
        body: JSON.stringify({
            address: entry.address,
        })
    }).then(res => res.json())
        .catch(e => console.log(e));
}


async function reply(entry: GeneratedWalletEntry, mint: string) {

    const res = await fetch(repliesEndpoint, {
        method: 'POST',
        mode: 'cors',
        headers: {
            "Content-Type": "application/json",
            "Origin": "https://pump.fun",
            "Referer": "https://pump.fun/",
            "Host": "client-api-2-74b1891ee9f9.herokuapp.com",
            "Accept": "*/*",
            "Authorization": "Bearer ".concat(entry.token),
        },
        body: JSON.stringify({
            mint: mint,
            text: entry.comment
        })
    }).then(res => { })
        .catch(e => console.log(e));
}

function getRandomAndRemove(set: Set<string>) {
    const setArray = Array.from(set);


    if (setArray.length === 0) {
        throw new Error('no more comments, nothing to remove');
    }

    const randomIndex = Math.floor(Math.random() * setArray.length);

    const randomValue = setArray[randomIndex];

    set.delete(randomValue);

    return randomValue;
}


function replaceToken(text: string, token: string, replacement: string): string {
    const escapedToken = token.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(escapedToken, 'g');

    return text.replace(regex, replacement);
}


async function fetch_metadata(connection: Connection, mint_address: PublicKey) {
    try {
        const metaplex = Metaplex.make(connection);

        const data = await metaplex.nfts().findByMint({ mintAddress: mint_address, loadJsonMetadata: false });

        const brokenUrl = data.uri;
        //console.log(brokenUrl);
        const newURL = convertIPFSURL(brokenUrl);
        const metadataJson = await fetch(newURL).then(e => e.json());
        return metadataJson
    } catch (e) {
        return {}
    }
}
export async function commentBomb() {

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



    const commentCount = (await getUserInput(chalk.grey("How many comments do you want to bomb with Anon (1-200)?: ")));
    let commentAmount: number = Number(commentCount);
    if (!commentAmount || commentAmount < 0 || commentAmount > 200) {
        console.log(chalk.red.bold('Invalid comment amount'));
        await sleep(3000); return;
    }

    const connection = new Connection(url as string, { commitment: 'confirmed', });
    const signerKeypair = getKeypairFromBs58(pk);
    //initializing program
    const program = new Program(idl as anchor.Idl, programID, new anchor.AnchorProvider(connection, new NodeWallet(signerKeypair), anchor.AnchorProvider.defaultOptions()));

    //getting the coin to bomb:
    let inputtedMint = (await getUserInput(chalk.grey("Enter Token Address or pump link: ")));
    inputtedMint = extractAddressFromUrl(inputtedMint) ?? inputtedMint;

    const bondingCurvePda = pdas.getBondingCurve(new PublicKey(inputtedMint), program.programId);
    const bondingCurveData = await program.account.bondingCurve.fetchNullable(bondingCurvePda);
    if (!bondingCurveData) {
        console.log(chalk.red.bold('No Pump pool found for for this address'));
        await sleep(3000); return;
    }


    const metadata = await fetch_metadata(connection, new PublicKey(inputtedMint));
    //console.log(metadata);


    //clearConsole();


    const generatedKeypairs: Keypair[] = new Array<any>(commentAmount).fill(0).map(() => Keypair.generate());
    const walletEntries: GeneratedWalletEntry[] = [];


    //console.log(generatedKeypairs.map(e => e.publicKey.toBase58()));

    console.log('\n')
    console.log(chalk.blueBright.bold(`Generating ${chalk.whiteBright.bold(commentAmount)} fake users..`));
    console.log('\n')
    console.log(chalk.blueBright.bold('Authneticating..'));





    const batchSize = 15

    //first we authenticate and register wallets
    for (let i = 0; i < generatedKeypairs.length; i += batchSize) {
        const batch = generatedKeypairs.slice(i, i + batchSize);
        const promiseArray: Promise<void>[] = [];

        for (let key of batch) {
            const promise = new Promise<void>(async (resolve, reject) => {
                try {
                    const token = await login(key);
                    if (token) {
                        console.log(chalk.gray.bold(`${chalk.whiteBright.bold(getCurrentDateTime())} Authenticated Wallet ${chalk.whiteBright.bold(key.publicKey.toBase58().substring(0, 8))} and registered new user. ✅.`))
                        const entry = {
                            address: key.publicKey,
                            token: token
                        }
                        await register(entry);
                        walletEntries.push(entry)
                        resolve();
                    } else {
                        console.log(chalk.gray.bold(`${chalk.whiteBright.bold(getCurrentDateTime())} Failed to authenticate Wallet ${chalk.whiteBright.bold(key.publicKey.toBase58().substring(0, 8))} ❌.`));
                        resolve();
                    }
                } catch (e) {
                    console.log(chalk.red('Error while performing operation.'))
                    resolve();
                }
            })
            promiseArray.push(promise);
        }

        await Promise.all(promiseArray)
    }


    console.log('DONE ✅');
    console.log('\n')
    console.log(chalk.blueBright.bold('Preparing Comments..'));
    //now we prepare the comments
    const commentsSet = new Set(comments as Array<string>);
    for (let entry of walletEntries) {
        let pickedComment = getRandomAndRemove(commentsSet);
        if (pickedComment.includes('$TOKEN')) {
            //@ts-ignore
            pickedComment = replaceToken(pickedComment, '$TOKEN', '$' + (metadata?.symbol) ?? '')
        };
        entry.comment = pickedComment;
    };

    console.log('DONE ✅');
    console.log('\n')
    console.log(chalk.blueBright.bold('Sending Comments'))



    //now we bomb
    const replyBatchSize = 8
    for (let i = 0; i < walletEntries.length; i += replyBatchSize) {
        const batch = walletEntries.slice(i, i + replyBatchSize);
        const promiseArray: Promise<void>[] = [];

        for (let entry of batch) {
            const promise = new Promise<void>(async (resolve, reject) => {
                try {
                    await reply(entry, inputtedMint);
                    console.log(chalk.gray.bold(`${chalk.whiteBright.bold(getCurrentDateTime())} Wallet ${chalk.whiteBright.bold(entry.address.toBase58().substring(0, 8))} comment sent. ✅.`))
                    resolve();
                } catch (e) {
                    console.log(chalk.red('Error while performing operation.'))
                    resolve();
                }
            })
            promiseArray.push(promise);
        }

        await Promise.all(promiseArray);
        await sleep(500);
    };
    console.log('\n');
    console.log('BOMBED SUCCESSFULY :) ✅');
    await sleep(3000);


    //await sleep(32045872395);
}


//commentBomb();