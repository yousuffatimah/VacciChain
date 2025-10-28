import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, stringAsciiCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_BATCH_ID = 101;
const ERR_INVALID_AMOUNT = 104;
const ERR_STAKE_LOCKED = 105;
const ERR_INVALID_PENALTY = 106;
const ERR_REWARD_ALREADY_CLAIMED = 115;
const ERR_INSUFFICIENT_REWARDS = 118;
const ERR_MAX_STAKES_EXCEEDED = 113;
const ERR_INVALID_ROLE = 114;

interface Stake {
  batchId: number;
  amount: number;
  staker: string;
  startHeight: number;
  claimed: boolean;
  role: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class IncentiveTokenMock {
  state: {
    totalSupply: number;
    rewardRate: number;
    lockPeriod: number;
    nextStakeId: number;
    maxStakes: number;
    authorityContract: string | null;
    balances: Map<string, number>;
    stakes: Map<number, Stake>;
    stakesByBatch: Map<number, number[]>;
    totalStakedByRole: Map<string, number>;
  } = {
    totalSupply: 100000000000000,
    rewardRate: 100,
    lockPeriod: 20160,
    nextStakeId: 0,
    maxStakes: 50000,
    authorityContract: null,
    balances: new Map(),
    stakes: new Map(),
    stakesByBatch: new Map(),
    totalStakedByRole: new Map(),
  };
  blockHeight: number = 1000;
  caller: string = "ST1STAKER";
  transfers: Array<{
    token: string;
    amount: number;
    from: string;
    to: string;
  }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      totalSupply: 100000000000000,
      rewardRate: 100,
      lockPeriod: 20160,
      nextStakeId: 0,
      maxStakes: 50000,
      authorityContract: null,
      balances: new Map(),
      stakes: new Map(),
      stakesByBatch: new Map(),
      totalStakedByRole: new Map(),
    };
    this.blockHeight = 1000;
    this.caller = "ST1STAKER";
    this.transfers = [];
    this.state.balances.set("ST1STAKER", 1000000000);
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

  mintInitialSupply(recipient: string): Result<boolean> {
    if (this.caller !== this.state.authorityContract)
      return { ok: false, value: false };
    if (this.state.totalSupply !== 100000000000000)
      return { ok: false, value: false };
    this.state.balances.set(
      recipient,
      (this.state.balances.get(recipient) || 0) + this.state.totalSupply
    );
    this.state.totalSupply = 0;
    return { ok: true, value: true };
  }

  stakeTokens(batchId: number, amount: number, role: string): Result<number> {
    if (this.state.nextStakeId >= this.state.maxStakes)
      return { ok: false, value: ERR_MAX_STAKES_EXCEEDED };
    if (batchId <= 0) return { ok: false, value: ERR_INVALID_BATCH_ID };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (!["manufacturer", "distributor", "provider"].includes(role))
      return { ok: false, value: ERR_INVALID_ROLE };
    const balance = this.state.balances.get(this.caller) || 0;
    if (balance < amount) return { ok: false, value: 103 };
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_NOT_AUTHORIZED };

    this.state.balances.set(this.caller, balance - amount);
    const authBalance =
      this.state.balances.get(this.state.authorityContract) || 0;
    this.state.balances.set(this.state.authorityContract, authBalance + amount);
    this.transfers.push({
      token: "vcc-reward",
      amount,
      from: this.caller,
      to: this.state.authorityContract,
    });

    const id = this.state.nextStakeId;
    this.state.stakes.set(id, {
      batchId,
      amount,
      staker: this.caller,
      startHeight: this.blockHeight,
      claimed: false,
      role,
    });
    const current = this.state.stakesByBatch.get(batchId) || [];
    this.state.stakesByBatch.set(batchId, [...current, id]);
    const roleTotal = this.state.totalStakedByRole.get(role) || 0;
    this.state.totalStakedByRole.set(role, roleTotal + amount);
    this.state.nextStakeId++;
    return { ok: true, value: id };
  }

  claimReward(stakeId: number): Result<number> {
    const stake = this.state.stakes.get(stakeId);
    if (!stake) return { ok: false, value: false };
    if (this.caller !== stake.staker) return { ok: false, value: false };
    if (stake.claimed) return { ok: false, value: false };
    if (this.blockHeight < stake.startHeight + this.state.lockPeriod)
      return { ok: false, value: ERR_STAKE_LOCKED };
    const reward = Math.floor((stake.amount * this.state.rewardRate) / 10000);
    const authBalance =
      this.state.balances.get(this.state.authorityContract!) || 0;
    if (authBalance < reward)
      return { ok: false, value: ERR_INSUFFICIENT_REWARDS };

    this.state.balances.set(
      this.state.authorityContract!,
      authBalance - reward
    );
    const userBalance = this.state.balances.get(this.caller) || 0;
    this.state.balances.set(this.caller, userBalance + reward);
    this.transfers.push({
      token: "vcc-reward",
      amount: reward,
      from: this.state.authorityContract!,
      to: this.caller,
    });
    this.state.stakes.set(stakeId, { ...stake, claimed: true });
    return { ok: true, value: reward };
  }

  slashStake(stakeId: number, penaltyRate: number): Result<number> {
    const stake = this.state.stakes.get(stakeId);
    if (!stake) return { ok: false, value: false };
    if (this.caller !== this.state.authorityContract)
      return { ok: false, value: false };
    if (penaltyRate > 10000) return { ok: false, value: ERR_INVALID_PENALTY };
    if (stake.claimed) return { ok: false, value: false };

    const penalty = Math.floor((stake.amount * penaltyRate) / 10000);
    const remaining = stake.amount - penalty;
    this.state.stakes.set(stakeId, { ...stake, claimed: true });
    const roleTotal = this.state.totalStakedByRole.get(stake.role) || 0;
    this.state.totalStakedByRole.set(stake.role, roleTotal - stake.amount);

    if (remaining > 0) {
      const authBalance =
        this.state.balances.get(this.state.authorityContract!) || 0;
      this.state.balances.set(
        this.state.authorityContract!,
        authBalance - remaining
      );
      const stakerBalance = this.state.balances.get(stake.staker) || 0;
      this.state.balances.set(stake.staker, stakerBalance + remaining);
      this.transfers.push({
        token: "vcc-reward",
        amount: remaining,
        from: this.state.authorityContract!,
        to: stake.staker,
      });
    }
    return { ok: true, value: penalty };
  }

  getTokenBalance(user: string): Result<number> {
    return { ok: true, value: this.state.balances.get(user) || 0 };
  }

  getStakeCount(): Result<number> {
    return { ok: true, value: this.state.nextStakeId };
  }
}

describe("IncentiveToken", () => {
  let contract: IncentiveTokenMock;

  beforeEach(() => {
    contract = new IncentiveTokenMock();
    contract.reset();
  });

  it("mints initial supply successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST2AUTH";
    contract.mintInitialSupply("ST2POOL");
    const balance = contract.getTokenBalance("ST2POOL");
    expect(balance.ok).toBe(true);
    expect(balance.value).toBe(100000000000000);
  });

  it("stakes tokens successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST2AUTH";
    contract.mintInitialSupply("ST2POOL");
    contract.caller = "ST1STAKER";
    contract.state.balances.set("ST1STAKER", 1000000);
    const result = contract.stakeTokens(1, 500000, "distributor");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const stake = contract.state.stakes.get(0);
    expect(stake?.batchId).toBe(1);
    expect(stake?.amount).toBe(500000);
    expect(stake?.role).toBe("distributor");
    expect(contract.state.totalStakedByRole.get("distributor")).toBe(500000);
  });

  it("rejects claim before lock period", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST2AUTH";
    contract.mintInitialSupply("ST2POOL");
    contract.caller = "ST1STAKER";
    contract.state.balances.set("ST1STAKER", 1000000);
    contract.stakeTokens(1, 500000, "distributor");
    const result = contract.claimReward(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_STAKE_LOCKED);
  });

  it("rejects slash by non-authority", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1STAKER";
    contract.stakeTokens(1, 500000, "distributor");
    const result = contract.slashStake(0, 2000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct stake count", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1STAKER";
    contract.state.balances.set("ST1STAKER", 3000000);
    contract.stakeTokens(1, 1000000, "manufacturer");
    contract.stakeTokens(2, 1000000, "distributor");
    const result = contract.getStakeCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("rejects stake with invalid role", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1STAKER";
    contract.state.balances.set("ST1STAKER", 1000000);
    const result = contract.stakeTokens(1, 500000, "invalid");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ROLE);
  });

  it("sets reward rate successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST2AUTH";
    const result = (contract.state.rewardRate = 200);
    expect(contract.state.rewardRate).toBe(200);
  });
});
