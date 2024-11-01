import { PublicKey } from "@solana/web3.js"
import * as anchor from '@coral-xyz/anchor';

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

//global state pda 
export function getGlobalState(programId: PublicKey,) {
    const [pda, _] = PublicKey.findProgramAddressSync(
        [
            anchor.utils.bytes.utf8.encode("global"),
        ],
        programId,
    )
    return pda
}

//mint authority pda 
export function getMintAuthority( programId: PublicKey,) {
    const [pda, _] = PublicKey.findProgramAddressSync(
        [
            anchor.utils.bytes.utf8.encode("mint-authority"),
        ],
        programId,
    )
    return pda
}


//bonding curve pda 
export function getBondingCurve(mint: PublicKey, programId: PublicKey,) {
    const [pda, _] = PublicKey.findProgramAddressSync(
        [
            anchor.utils.bytes.utf8.encode("bonding-curve"),
            mint.toBuffer(),
        ],
        programId,
    )
    return pda
}