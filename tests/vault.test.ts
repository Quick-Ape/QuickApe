import { describe, expect, it } from 'vitest';
import { createVault, decryptWithKey, exportKey, importKey, openVault } from '@/lib/wallet/vault';

describe('vault', () => {
  const data = { mnemonic: 'test test test test test test test test test test test junk', createdAt: 1 };

  it('encrypt -> open with the correct password', async () => {
    const { vault } = await createVault(data, 'password-123');
    expect(vault.ct).not.toContain('test');
    expect((await openVault(vault, 'password-123')).data).toEqual(data);
  });

  it('wrong password is rejected', async () => {
    const { vault } = await createVault(data, 'password-123');
    await expect(openVault(vault, 'password-124')).rejects.toThrow('Incorrect password');
  });

  it('session key (raw export/import) can decrypt again without PBKDF2', async () => {
    const { vault, key } = await createVault(data, 'password-123');
    const restored = await importKey(await exportKey(key));
    expect(await decryptWithKey(vault, restored)).toEqual(data);
  });
});
