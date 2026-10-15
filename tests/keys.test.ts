import { describe, expect, it } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { bytesToHex, hexToBytes } from 'viem';
import {
  deriveWallets,
  evmFromMnemonic,
  evmFromPrivateKey,
  exportSolanaSecret,
  parseSolanaSecret,
  slip10Ed25519,
  solanaFromMnemonic,
} from '@/lib/wallet/keys';

describe('SLIP-0010 ed25519 (Phantom path)', () => {
  // Test vector 1 from the SLIP-0010 spec.
  const seed = hexToBytes('0x000102030405060708090a0b0c0d0e0f');
  it.each([
    [[], '2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7'],
    [[0], '68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3'],
    [[0, 1], 'b1d0bad404bf35da785a64ca1ac54b2617211d2777696fbffaf208f746ae84f2'],
    [[0, 1, 2], '92a5b23c0b8a99e37d07df3fb9966917f5d06e02ddbd909c7e184371463e9fc9'],
  ])('path %j', (path, expected) => {
    expect(bytesToHex(slip10Ed25519(seed, path as number[]))).toBe(`0x${expected}`);
  });
});

describe('wallet derivation', () => {
  const HARDHAT = 'test test test test test test test test test test test junk';

  it('EVM matches MetaMask (Hardhat accounts #0 and #1)', () => {
    expect(evmFromMnemonic(HARDHAT, 0).address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    expect(evmFromMnemonic(HARDHAT, 1).address).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
  });

  it('Solana: different account per index, deterministic', () => {
    const a = solanaFromMnemonic(HARDHAT, 0);
    const b = solanaFromMnemonic(HARDHAT, 1);
    expect(a.address).not.toBe(b.address);
    expect(solanaFromMnemonic(HARDHAT, 0).address).toBe(a.address);
    expect(base58.decode(a.address)).toHaveLength(32);
  });

  it('Solana private key export/import in Phantom format (base58, 64 bytes) round-trips', () => {
    const w = solanaFromMnemonic(HARDHAT, 0);
    const exported = exportSolanaSecret(w);
    expect(base58.decode(exported)).toHaveLength(64);
    expect(parseSolanaSecret(exported).address).toBe(w.address);
    // solana-keygen format (JSON array)
    expect(parseSolanaSecret(JSON.stringify([...base58.decode(exported)])).address).toBe(w.address);
  });

  it('rejects a Solana private key whose public key does not match', () => {
    const bytes = base58.decode(exportSolanaSecret(solanaFromMnemonic(HARDHAT, 0)));
    bytes[63] ^= 1;
    expect(() => parseSolanaSecret(base58.encode(bytes))).toThrow();
  });

  it('EVM private key with / without 0x', () => {
    const pk = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    expect(evmFromPrivateKey(pk).address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    expect(evmFromPrivateKey(pk.slice(2)).address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    expect(() => evmFromPrivateKey('0x1234')).toThrow();
  });

  it('private key override takes precedence over the seed', () => {
    const solOther = solanaFromMnemonic(HARDHAT, 5);
    const w = deriveWallets({ mnemonic: HARDHAT, solanaSecret: exportSolanaSecret(solOther), createdAt: 0 });
    expect(w.solana?.address).toBe(solOther.address);
    expect(w.evm?.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  });

  it('public key matches the ed25519 seed', () => {
    const w = solanaFromMnemonic(HARDHAT, 0);
    expect(base58.encode(ed25519.getPublicKey(w.seed))).toBe(w.address);
  });
});
