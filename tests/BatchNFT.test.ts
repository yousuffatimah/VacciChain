import { describe, it, expect, beforeEach } from "vitest";
import {
  uintCV,
  stringUtf8CV,
  stringAsciiCV,
  intCV,
} from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_BATCH_ID = 101;
const ERR_BATCH_NOT_FOUND = 102;
const ERR_INVALID_DOSE_COUNT = 111;
const ERR_INVALID_PRODUCTION_DATE = 112;
const ERR_INVALID_EXPIRATION_DATE = 113;
const ERR_INVALID_MANUFACTURER = 114;
const ERR_INVALID_TEMP = 103;
const ERR_INVALID_TRANSPORT_MODE = 116;
const ERR_INVALID_LOCATION = 118;
const ERR_MAX_BATCHES_EXCEEDED = 120;

interface BatchMetadata {
  vaccineType: string;
  doseCount: number;
  productionDate: number;
  expirationDate: number;
  manufacturer: string;
  storageMin: number;
  storageMax: number;
  transportMode: string;
  origin: string;
  destination: string;
  status: string;
  compromised: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class BatchNFTMock {
  state: {
    nextBatchId: number;
    maxBatches: number;
    mintFee: number;
    authorityContract: string | null;
    nfts: Map<number, string>;
    metadata: Map<number, BatchMetadata>;
    owners: Map<number, string>;
  } = {
    nextBatchId: 0,
    maxBatches: 100000,
    mintFee: 1000,
    authorityContract: null,
    nfts: new Map(),
    metadata: new Map(),
    owners: new Map(),
  };
  blockHeight: number = 100;
  caller: string = "ST1MANUFACTURER";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextBatchId: 0,
      maxBatches: 100000,
      mintFee: 1000,
      authorityContract: null,
      nfts: new Map(),
      metadata: new Map(),
      owners: new Map(),
    };
    this.blockHeight = 100;
    this.caller = "ST1MANUFACTURER";
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMintFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.mintFee = newFee;
    return { ok: true, value: true };
  }

  mintBatch(
    vaccineType: string,
    doseCount: number,
    productionDate: number,
    expirationDate: number,
    manufacturer: string,
    storageMin: number,
    storageMax: number,
    transportMode: string,
    origin: string,
    destination: string
  ): Result<number> {
    if (this.state.nextBatchId >= this.state.maxBatches)
      return { ok: false, value: ERR_MAX_BATCHES_EXCEEDED };
    if (!vaccineType || vaccineType.length > 50)
      return { ok: false, value: 114 };
    if (doseCount <= 0) return { ok: false, value: ERR_INVALID_DOSE_COUNT };
    if (productionDate > this.blockHeight)
      return { ok: false, value: ERR_INVALID_PRODUCTION_DATE };
    if (expirationDate <= this.blockHeight)
      return { ok: false, value: ERR_INVALID_EXPIRATION_DATE };
    if (expirationDate <= productionDate)
      return { ok: false, value: ERR_INVALID_EXPIRATION_DATE };
    if (!manufacturer || manufacturer.length > 100)
      return { ok: false, value: ERR_INVALID_MANUFACTURER };
    if (storageMin < -50 || storageMin > 50)
      return { ok: false, value: ERR_INVALID_TEMP };
    if (storageMax < -50 || storageMax > 50)
      return { ok: false, value: ERR_INVALID_TEMP };
    if (storageMax <= storageMin) return { ok: false, value: ERR_INVALID_TEMP };
    if (!["air", "sea", "road", "rail"].includes(transportMode))
      return { ok: false, value: ERR_INVALID_TRANSPORT_MODE };
    if (!origin || origin.length > 100)
      return { ok: false, value: ERR_INVALID_LOCATION };
    if (!destination || destination.length > 100)
      return { ok: false, value: ERR_INVALID_LOCATION };
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_NOT_AUTHORIZED };

    this.stxTransfers.push({
      amount: this.state.mintFee,
      from: this.caller,
      to: this.state.authorityContract,
    });

    const id = this.state.nextBatchId;
    this.state.nfts.set(id, this.caller);
    this.state.metadata.set(id, {
      vaccineType,
      doseCount,
      productionDate,
      expirationDate,
      manufacturer,
      storageMin,
      storageMax,
      transportMode,
      origin,
      destination,
      status: "produced",
      compromised: false,
    });
    this.state.owners.set(id, this.caller);
    this.state.nextBatchId++;
    return { ok: true, value: id };
  }

  getBatchMetadata(batchId: number): BatchMetadata | null {
    return this.state.metadata.get(batchId) || null;
  }

  getBatchOwner(batchId: number): string | null {
    return this.state.nfts.get(batchId) || null;
  }

  transferBatch(batchId: number, recipient: string): Result<boolean> {
    const owner = this.state.nfts.get(batchId);
    if (!owner) return { ok: false, value: false };
    if (this.caller !== owner) return { ok: false, value: false };
    this.state.nfts.set(batchId, recipient);
    this.state.owners.set(batchId, recipient);
    return { ok: true, value: true };
  }

  updateBatchStatus(batchId: number, newStatus: string): Result<boolean> {
    const owner = this.state.nfts.get(batchId);
    const metadata = this.state.metadata.get(batchId);
    if (!owner || !metadata) return { ok: false, value: false };
    if (this.caller !== owner) return { ok: false, value: false };
    if (
      !["produced", "in-transit", "delivered", "compromised"].includes(
        newStatus
      )
    ) {
      return { ok: false, value: false };
    }
    this.state.metadata.set(batchId, { ...metadata, status: newStatus });
    return { ok: true, value: true };
  }

  flagCompromised(batchId: number): Result<boolean> {
    const metadata = this.state.metadata.get(batchId);
    if (!metadata) return { ok: false, value: false };
    if (this.caller !== this.state.authorityContract)
      return { ok: false, value: false };
    if (metadata.compromised) return { ok: false, value: false };
    this.state.metadata.set(batchId, {
      ...metadata,
      compromised: true,
      status: "compromised",
    });
    return { ok: true, value: true };
  }

  getBatchCount(): Result<number> {
    return { ok: true, value: this.state.nextBatchId };
  }
}

describe("BatchNFT", () => {
  let contract: BatchNFTMock;

  beforeEach(() => {
    contract = new BatchNFTMock();
    contract.reset();
  });

  it("mints a batch successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.mintBatch(
      "mRNA-1273",
      1000,
      90,
      180,
      "Moderna Inc.",
      2,
      8,
      "air",
      "Boston, USA",
      "Lagos, Nigeria"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const metadata = contract.getBatchMetadata(0);
    expect(metadata?.vaccineType).toBe("mRNA-1273");
    expect(metadata?.doseCount).toBe(1000);
    expect(metadata?.status).toBe("produced");
    expect(metadata?.compromised).toBe(false);
    expect(contract.stxTransfers).toEqual([
      { amount: 1000, from: "ST1MANUFACTURER", to: "ST2AUTH" },
    ]);
  });

  it("rejects mint with future production date", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.mintBatch(
      "mRNA-1273",
      1000,
      150,
      180,
      "Moderna Inc.",
      2,
      8,
      "air",
      "Boston, USA",
      "Lagos, Nigeria"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PRODUCTION_DATE);
  });

  it("rejects mint with invalid storage range", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.mintBatch(
      "mRNA-1273",
      1000,
      90,
      180,
      "Moderna Inc.",
      8,
      2,
      "air",
      "Boston, USA",
      "Lagos, Nigeria"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TEMP);
  });

  it("transfers batch ownership successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.mintBatch(
      "mRNA-1273",
      1000,
      90,
      180,
      "Moderna Inc.",
      2,
      8,
      "air",
      "Boston, USA",
      "Lagos, Nigeria"
    );
    const result = contract.transferBatch(0, "ST2DISTRIBUTOR");
    expect(result.ok).toBe(true);
    expect(contract.getBatchOwner(0)).toBe("ST2DISTRIBUTOR");
  });

  it("rejects transfer by non-owner", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.mintBatch(
      "mRNA-1273",
      1000,
      90,
      180,
      "Moderna Inc.",
      2,
      8,
      "air",
      "Boston, USA",
      "Lagos, Nigeria"
    );
    contract.caller = "ST3HACKER";
    const result = contract.transferBatch(0, "ST2DISTRIBUTOR");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("updates batch status successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.mintBatch(
      "mRNA-1273",
      1000,
      90,
      180,
      "Moderna Inc.",
      2,
      8,
      "air",
      "Boston, USA",
      "Lagos, Nigeria"
    );
    const result = contract.updateBatchStatus(0, "in-transit");
    expect(result.ok).toBe(true);
    const metadata = contract.getBatchMetadata(0);
    expect(metadata?.status).toBe("in-transit");
  });

  it("flags batch as compromised by authority", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST2AUTH";
    contract.mintBatch(
      "mRNA-1273",
      1000,
      90,
      180,
      "Moderna Inc.",
      2,
      8,
      "air",
      "Boston, USA",
      "Lagos, Nigeria"
    );
    const result = contract.flagCompromised(0);
    expect(result.ok).toBe(true);
    const metadata = contract.getBatchMetadata(0);
    expect(metadata?.compromised).toBe(true);
    expect(metadata?.status).toBe("compromised");
  });

  it("rejects flag compromised by non-authority", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.mintBatch(
      "mRNA-1273",
      1000,
      90,
      180,
      "Moderna Inc.",
      2,
      8,
      "air",
      "Boston, USA",
      "Lagos, Nigeria"
    );
    const result = contract.flagCompromised(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("parses batch parameters with Clarity types", () => {
    const typeCv = stringUtf8CV("mRNA-1273");
    const doseCv = uintCV(1000);
    const tempCv = intCV(2);
    expect(typeCv.value).toBe("mRNA-1273");
    expect(doseCv.value).toEqual(BigInt(1000));
    expect(tempCv.value).toEqual(BigInt(2));
  });

  it("rejects mint with max batches exceeded", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.state.maxBatches = 1;
    contract.mintBatch(
      "mRNA-1273",
      1000,
      90,
      180,
      "Moderna Inc.",
      2,
      8,
      "air",
      "Boston, USA",
      "Lagos, Nigeria"
    );
    const result = contract.mintBatch(
      "BNT162b2",
      500,
      95,
      185,
      "Pfizer Inc.",
      -70,
      -60,
      "air",
      "New York, USA",
      "Accra, Ghana"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_BATCHES_EXCEEDED);
  });

  it("sets mint fee successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.setMintFee(2000);
    expect(result.ok).toBe(true);
    expect(contract.state.mintFee).toBe(2000);
    contract.mintBatch(
      "mRNA-1273",
      1000,
      90,
      180,
      "Moderna Inc.",
      2,
      8,
      "air",
      "Boston, USA",
      "Lagos, Nigeria"
    );
    expect(contract.stxTransfers).toEqual([
      { amount: 2000, from: "ST1MANUFACTURER", to: "ST2AUTH" },
    ]);
  });
});
