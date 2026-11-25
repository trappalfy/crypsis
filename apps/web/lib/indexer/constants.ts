// Public program addresses (brief §2). Same on mainnet and devnet. [VERIFIED against @heliuslabs/spr 0.9.0-alpha]
export const RING_PROGRAM = "ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW";
/** Owner (authority) of every per-mint Ring vault token account. Equals SHIELDED_POOL_CPI_AUTHORITY in the SDK. */
export const RING_CPI_AUTHORITY = "CaM8DbtJ2mSecgaHYo9xeT7VSKq7AnaqEUm5p7e5LW4a";
export const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMP_AMM_PROGRAM = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const METAPLEX_METADATA_PROGRAM = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
/** Ring mainnet launch (brief §2.1). Backfill starts here. */
export const RING_MAINNET_START = Date.UTC(2026, 10, 10);
/** Asset registry account: 48 bytes, discriminator byte 5 at offset 0 (SDK StateDiscriminator.splAssetRegistry). */
export const REGISTRY_DATA_SIZE = 48;
export const REGISTRY_DISCRIMINATOR = 5;
