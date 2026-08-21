/**
 * Public, non-secret transaction signatures recorded after Devnet registration.
 * The live account remains the source of truth; these help Explorer links if
 * RPC signature history is truncated.
 */
export interface RecordedContractProof {
  createSignature?: string;
  verifySignature?: string;
  allocateSignature?: string;
}

export interface RecordedPoolProof {
  createSignature?: string;
  coverageSignature?: string;
  activateSignature?: string;
  snapshotHashHex?: string;
}

export const recordedContractProof: Record<string, RecordedContractProof> = {
  "DAC-2027-0001": {
    createSignature:
      "3Nwom4nYQTNtwp8iSzPHEnHxK1F2L7phf6kRBUdGB2h7m1JJxsHuN8ygpQM3cmMZxeKMJQeCkuM3diyWmmigUFfo",
    verifySignature:
      "bMy4TH3uosXjBR2CpchADUQiiCpkkAzUSGVKNJhjwF88d5UHnFiAUDsc6ENJPaSypqAemWwxDk8nGCDpZVfvDy5",
    allocateSignature:
      "3scHJJ2keYU9PEyjcJGvSjpvje6rU1rXw1X3DbjwW8G7eFxioDmyEVLge7gDcqRmtiJR8pKaj5vaoHKftv9W1yjR",
  },
  "DAC-2027-0002": {
    createSignature:
      "4wmfQmeJ9nRPFX8A3HV1DNBy2RDoT3ptxemZpqoyRxZVCWKYPXJvJXcRkypWbPJd2PM7tR58bGBthd8YB1cgWhaG",
    verifySignature:
      "3PTwKnx4ha3z8snzjanKHaVEqfYEkELtQwmx28Rj7UzNR5kLtA4oM1fepZ4F9RH3serggkiWc5fxKeyjxMrut3VH",
    allocateSignature:
      "2UpnNBD3WT93sLZUEg32q94cxdFUXpQR58MV5cj6ijequUSgNsnrKRLD6anjBXMdVefaLbir8HTCkAmPGi1jZHiX",
  },
  "DAC-2027-0003": {
    createSignature:
      "5YXfYc2YhK3DTxEMJCrRM4AFMbC9orra9y8r1QHmz4AufsQxydniZEvwgH9T6XnRBizCTVRnZHx1qoiLzFnXW2nb",
    verifySignature:
      "2r9x5L1AEAaXsjBKYa42M2CfPQuB3FaqTQwcRkhfuETFNW3mFB1oZJCdE72jwG9PLhYgJ43jy6sYyQVfcsJc1nDq",
    allocateSignature:
      "5LqNrA1CXE9rsEEfKswhcEnMzQytcbcBN68CrW99hgBe6r9vRhHBhGEjkosnCmbbT7AHnKW2u5SbkqU9gT6uGUVr",
  },
  "DAC-2027-0004": {
    createSignature:
      "4WNHs9Mvp383fZE7EuiYwMVUpFF2oM1v9yGruak9pE1vJLe5cixWiorVCeVjUN2Wea5RewLiDims7iAtkTuzHuzw",
    verifySignature:
      "238Xz3rxCN6kQKkGrSttitucjxUk3nhBtvxSPCnH98DBo88TgebJNrjv7zrnttR7JWrU472Sy7ddLGHww9SG8vz5",
    allocateSignature:
      "3dmc7aUMbStEdYFeSmevzqwU3kC6ErmBQgSrvHTvzZ3LubkQMVb3gv3bLcAPVPRwvk7L6ctCzqtCB1zUwE2rtffm",
  },
};

export const recordedPoolProof: Record<string, RecordedPoolProof> = {
  "POOL-WHEAT-2027-01": {
    createSignature:
      "5QF6Wi1h2n1VgJEFvtESKaVKGtj3tMDqg2Q87V5CScjgTrGbBKUByZu4GPfvThTjKKxwkrjkKib3XCEKvSjRE3vz",
    coverageSignature:
      "Pb7EEttR68YnWPfZD2zDXwxroeHNabrx71UEMfMZfZon5iYPNBjJkcCaEjfkedG9hDVVGG88dsAuepCqV94kj26",
    activateSignature:
      "5uJF5TiiHVDHEn8NC5nYurqw2pMCoY2EFpcLAeaUuvgfKzGV1XoEeusC2TZVCwoF5jbs3F6yUpioU22uJjCGJB1b",
    snapshotHashHex:
      "4b93b012e8c95c8133aa73faa4720db3b61f4ef83d7750a7b05d4a97417388b2",
  },
};

export const PROGRAM_UPGRADE_SIGNATURE =
  "65qMYg7XFhjXP8QQNvvN7YAea574NaeCo8bmCE2wEyzhtz2qYv5pdbbUpCk2S37ntojq4LnQQHArtW999w455VDc";
