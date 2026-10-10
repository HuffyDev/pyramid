import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';

// deterministic test keypairs — never funded, never used on-chain
export const creator = Keypair.fromSeed(new Uint8Array(32).fill(7));
export const mint = Keypair.fromSeed(new Uint8Array(32).fill(9));
export const stranger = Keypair.fromSeed(new Uint8Array(32).fill(3));
const PUMP_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

/** Mimics the shape PumpPortal returns: v0 message, payer = creator, mint as 2nd signer. */
export function fakeCreateTx(opts: { payer?: Keypair; mintKp?: Keypair; extraSigner?: Keypair } = {}) {
  const payer = opts.payer ?? creator;
  const m = opts.mintKp ?? mint;
  const keys = [
    { pubkey: m.publicKey, isSigner: true, isWritable: true },
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
  ];
  if (opts.extraSigner) keys.push({ pubkey: opts.extraSigner.publicKey, isSigner: true, isWritable: false });
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: [
      new TransactionInstruction({ programId: PUMP_PROGRAM, keys, data: Buffer.from([0x18, 0x1e, 0xc8, 0x28, 0x05, 0x1c, 0x07, 0x77]) }),
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: m.publicKey, lamports: 1 }),
    ],
  }).compileToV0Message();
  return new VersionedTransaction(msg);
}
