import { describe, it, expect, beforeEach } from "vitest";
import { intCV, stringAsciiCV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_BATCH_ID = 101;
const ERR_INVALID_TEMP = 102;
const ERR_INVALID_MIN_TEMP = 103;
const ERR_INVALID_MAX_TEMP = 104;
const ERR_INVALID_THRESHOLD = 105;
const ERR_ALERT_ALREADY_EXISTS = 106;
const ERR_ALERT_NOT_FOUND = 107;
const ERR_ORACLE_NOT_VERIFIED = 109;
const ERR_INVALID_GRACE_PERIOD = 117;
const ERR_INVALID_LOCATION = 118;
const ERR_INVALID_SENSOR_ID = 119;
const ERR_INVALID_SEVERITY = 116;
const ERR_INVALID_ALERT_TYPE = 115;
const ERR_MAX_ALERTS_EXCEEDED = 114;
const ERR_INVALID_UPDATE_PARAM = 113;
const ERR_BATCH_NOT_ACTIVE = 112;
const ERR_INVALID_STATUS = 120;

interface BatchRules {
  minTemp: number;
  maxTemp: number;
  deviationThreshold: number;
  gracePeriod: number;
  active: boolean;
}

interface Alert {
  batchId: number;
  tempRecorded: number;
  timestamp: number;
  sensorId: string;
  location: string;
  severity: number;
  alertType: string;
  status: boolean;
  penaltyApplied: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class DeviationAlertMock {
  state: {
    nextAlertId: number;
    maxAlerts: number;
    alertFee: number;
    oracleContract: string | null;
    batchRules: Map<number, BatchRules>;
    alerts: Map<number, Alert>;
    alertsByBatch: Map<number, number[]>;
    deviationCounts: Map<number, number>;
  } = {
    nextAlertId: 0,
    maxAlerts: 10000,
    alertFee: 500,
    oracleContract: null,
    batchRules: new Map(),
    alerts: new Map(),
    alertsByBatch: new Map(),
    deviationCounts: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  oracles: Set<string> = new Set(["ST1TEST"]);
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextAlertId: 0,
      maxAlerts: 10000,
      alertFee: 500,
      oracleContract: null,
      batchRules: new Map(),
      alerts: new Map(),
      alertsByBatch: new Map(),
      deviationCounts: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.oracles = new Set(["ST1TEST"]);
    this.stxTransfers = [];
  }

  isVerifiedOracle(principal: string): Result<boolean> {
    return { ok: true, value: this.oracles.has(principal) };
  }

  setOracleContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.oracleContract !== null) {
      return { ok: false, value: false };
    }
    this.state.oracleContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setAlertFee(newFee: number): Result<boolean> {
    if (!this.state.oracleContract) return { ok: false, value: false };
    this.state.alertFee = newFee;
    return { ok: true, value: true };
  }

  setBatchRules(
    batchId: number,
    minTemp: number,
    maxTemp: number,
    deviationThreshold: number,
    gracePeriod: number
  ): Result<boolean> {
    if (batchId <= 0) return { ok: false, value: ERR_INVALID_BATCH_ID };
    if (minTemp < -50 || minTemp > 50) return { ok: false, value: ERR_INVALID_MIN_TEMP };
    if (maxTemp < -50 || maxTemp > 50) return { ok: false, value: ERR_INVALID_MAX_TEMP };
    if (maxTemp <= minTemp) return { ok: false, value: ERR_INVALID_MAX_TEMP };
    if (deviationThreshold <= 0) return { ok: false, value: ERR_INVALID_THRESHOLD };
    if (gracePeriod > 144) return { ok: false, value: ERR_INVALID_GRACE_PERIOD };
    if (this.caller !== this.state.oracleContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.batchRules.set(batchId, {
      minTemp,
      maxTemp,
      deviationThreshold,
      gracePeriod,
      active: true,
    });
    return { ok: true, value: true };
  }

  triggerAlert(
    batchId: number,
    tempRecorded: number,
    sensorId: string,
    location: string,
    severity: number,
    alertType: string
  ): Result<number> {
    if (this.state.nextAlertId >= this.state.maxAlerts) return { ok: false, value: ERR_MAX_ALERTS_EXCEEDED };
    const rules = this.state.batchRules.get(batchId);
    if (!rules) return { ok: false, value: ERR_INVALID_BATCH_ID };
    if (!rules.active) return { ok: false, value: ERR_BATCH_NOT_ACTIVE };
    if (tempRecorded < -50 || tempRecorded > 50) return { ok: false, value: ERR_INVALID_TEMP };
    if (!sensorId || sensorId.length > 50) return { ok: false, value: ERR_INVALID_SENSOR_ID };
    if (!location || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (severity > 3) return { ok: false, value: ERR_INVALID_SEVERITY };
    if (!["high", "low", "extreme"].includes(alertType)) return { ok: false, value: ERR_INVALID_ALERT_TYPE };
    if (this.caller !== this.state.oracleContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (tempRecorded >= rules.minTemp && tempRecorded <= rules.maxTemp) return { ok: false, value: ERR_INVALID_TEMP };
    if (!this.state.oracleContract) return { ok: false, value: ERR_ORACLE_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.alertFee, from: this.caller, to: this.state.oracleContract });

    const id = this.state.nextAlertId;
    const alert: Alert = {
      batchId,
      tempRecorded,
      timestamp: this.blockHeight,
      sensorId,
      location,
      severity,
      alertType,
      status: true,
      penaltyApplied: false,
    };
    this.state.alerts.set(id, alert);
    const currentAlerts = this.state.alertsByBatch.get(batchId) || [];
    this.state.alertsByBatch.set(batchId, [...currentAlerts, id]);
    const devCount = this.state.deviationCounts.get(batchId) || 0;
    this.state.deviationCounts.set(batchId, devCount + 1);
    this.state.nextAlertId++;
    return { ok: true, value: id };
  }

  getBatchRules(batchId: number): BatchRules | null {
    return this.state.batchRules.get(batchId) || null;
  }

  getAlert(alertId: number): Alert | null {
    return this.state.alerts.get(alertId) || null;
  }

  resolveAlert(alertId: number, applyPenalty: boolean): Result<boolean> {
    const alert = this.state.alerts.get(alertId);
    if (!alert) return { ok: false, value: false };
    if (this.caller !== this.state.oracleContract) return { ok: false, value: false };
    if (!alert.status) return { ok: false, value: false };
    this.state.alerts.set(alertId, { ...alert, status: false, penaltyApplied: applyPenalty });
    return { ok: true, value: true };
  }

  getAlertCount(): Result<number> {
    return { ok: true, value: this.state.nextAlertId };
  }

  isBatchInDeviation(batchId: number): Result<boolean> {
    const count = this.state.deviationCounts.get(batchId) || 0;
    return { ok: true, value: count > 0 };
  }
}

describe("DeviationAlert", () => {
  let contract: DeviationAlertMock;

  beforeEach(() => {
    contract = new DeviationAlertMock();
    contract.reset();
  });

  it("sets batch rules successfully", () => {
    contract.setOracleContract("ST2TEST");
    contract.caller = "ST2TEST";
    const result = contract.setBatchRules(1, 2, 8, 1, 24);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);

    const rules = contract.getBatchRules(1);
    expect(rules?.minTemp).toBe(2);
    expect(rules?.maxTemp).toBe(8);
    expect(rules?.deviationThreshold).toBe(1);
    expect(rules?.gracePeriod).toBe(24);
    expect(rules?.active).toBe(true);
  });

  it("rejects invalid min temp", () => {
    contract.setOracleContract("ST2TEST");
    contract.caller = "ST2TEST";
    const result = contract.setBatchRules(1, -51, 8, 1, 24);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_MIN_TEMP);
  });

  it("rejects max temp less than min", () => {
    contract.setOracleContract("ST2TEST");
    contract.caller = "ST2TEST";
    const result = contract.setBatchRules(1, 8, 2, 1, 24);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_MAX_TEMP);
  });

  it("triggers alert successfully for high temp", () => {
    contract.setOracleContract("ST2TEST");
    contract.caller = "ST2TEST";
    contract.setBatchRules(1, 2, 8, 1, 24);
    const result = contract.triggerAlert(1, 10, "sensor123", "Warehouse A", 2, "high");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const alert = contract.getAlert(0);
    expect(alert?.batchId).toBe(1);
    expect(alert?.tempRecorded).toBe(10);
    expect(alert?.sensorId).toBe("sensor123");
    expect(alert?.location).toBe("Warehouse A");
    expect(alert?.severity).toBe(2);
    expect(alert?.alertType).toBe("high");
    expect(alert?.status).toBe(true);
    expect(alert?.penaltyApplied).toBe(false);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST2TEST", to: "ST2TEST" }]);
    expect(contract.state.deviationCounts.get(1)).toBe(1);
  });

  it("triggers alert successfully for low temp", () => {
    contract.setOracleContract("ST2TEST");
    contract.caller = "ST2TEST";
    contract.setBatchRules(1, 2, 8, 1, 24);
    const result = contract.triggerAlert(1, 0, "sensor456", "Transport B", 1, "low");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
  });

  it("rejects alert for temp within range", () => {
    contract.setOracleContract("ST2TEST");
    contract.caller = "ST2TEST";
    contract.setBatchRules(1, 2, 8, 1, 24);
    const result = contract.triggerAlert(1, 5, "sensor123", "Warehouse A", 2, "high");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TEMP);
  });

  it("rejects invalid sensor id", () => {
    contract.setOracleContract("ST2TEST");
    contract.caller = "ST2TEST";
    contract.setBatchRules(1, 2, 8, 1, 24);
    const result = contract.triggerAlert(1, 10, "", "Warehouse A", 2, "high");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SENSOR_ID);
  });

  it("resolves alert successfully with penalty", () => {
    contract.setOracleContract("ST2TEST");
    contract.caller = "ST2TEST";
    contract.setBatchRules(1, 2, 8, 1, 24);
    contract.triggerAlert(1, 10, "sensor123", "Warehouse A", 2, "high");
    const result = contract.resolveAlert(0, true);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const alert = contract.getAlert(0);
    expect(alert?.status).toBe(false);
    expect(alert?.penaltyApplied).toBe(true);
  });

  it("resolves alert successfully without penalty", () => {
    contract.setOracleContract("ST2TEST");
    contract.caller = "ST2TEST";
    contract.setBatchRules(1, 2, 8, 1, 24);
    contract.triggerAlert(1, 10, "sensor123", "Warehouse A", 2, "high");
    const result = contract.resolveAlert(0, false);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const alert = contract.getAlert(0);
    expect(alert?.status).toBe(false);
    expect(alert?.penaltyApplied).toBe(false);
  });

  it("rejects resolve for non-existent alert", () => {
    contract.setOracleContract("ST2TEST");
    contract.caller = "ST2TEST";
    const result = contract.resolveAlert(99, true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects resolve by non-oracle", () => {
    contract.setOracleContract("ST2TEST");
    contract.caller = "ST2TEST";
    contract.setBatchRules(1, 2, 8, 1, 24);
    contract.triggerAlert(1, 10, "sensor123", "Warehouse A", 2, "high");
    contract.caller = "ST3FAKE";
    const result = contract.resolveAlert(0, true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets alert fee successfully", () => {
    contract.setOracleContract("ST2TEST");
    const result = contract.setAlertFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.alertFee).toBe(1000);
    contract.caller = "ST2TEST";
    contract.setBatchRules(1, 2, 8, 1, 24);
    contract.triggerAlert(1, 10, "sensor123", "Warehouse A", 2, "high");
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST2TEST", to: "ST2TEST" }]);
  });

  it("rejects alert fee change without oracle", () => {
    const result = contract.setAlertFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct alert count", () => {
    contract.setOracleContract("ST2TEST");
    contract.caller = "ST2TEST";
    contract.setBatchRules(1, 2, 8, 1, 24);
    contract.triggerAlert(1, 10, "sensor123", "Warehouse A", 2, "high");
    contract.triggerAlert(1, 0, "sensor456", "Transport B", 1, "low");
    const result = contract.getAlertCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks batch in deviation correctly", () => {
    contract.setOracleContract("ST2TEST");
    contract.caller = "ST2TEST";
    contract.setBatchRules(1, 2, 8, 1, 24);
    contract.triggerAlert(1, 10, "sensor123", "Warehouse A", 2, "high");
    const result = contract.isBatchInDeviation(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.isBatchInDeviation(2);
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("rejects trigger alert with max alerts exceeded", () => {
    contract.setOracleContract("ST2TEST");
    contract.caller = "ST2TEST";
    contract.state.maxAlerts = 1;
    contract.setBatchRules(1, 2, 8, 1, 24);
    contract.triggerAlert(1, 10, "sensor123", "Warehouse A", 2, "high");
    const result = contract.triggerAlert(1, 0, "sensor456", "Transport B", 1, "low");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_ALERTS_EXCEEDED);
  });

  it("sets oracle contract successfully", () => {
    const result = contract.setOracleContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.oracleContract).toBe("ST2TEST");
  });

  it("rejects invalid oracle contract", () => {
    const result = contract.setOracleContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});