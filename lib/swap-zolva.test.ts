import { decodeAbiParameters, decodeFunctionData, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { USDG } from "./live/contracts";
import { afterFee, DEAD, ETH_NATIVE, EXECUTE_ABI, PONS_HOOK, ponsPoolKey, PERMIT2_ABI, v3FeeSwapCall, wrapCall, PERMIT2_TTL_SECONDS, permit2ApproveCall, poolId, UNIVERSAL_ROUTER, WETH, ZOLVA, ZOLVA_POOL_ID, ZOLVA_POOL_KEY, zolvaLeg, zolvaSwapCall } from "./swap-zolva";

const decode = (data: Hex) => {
  const { args } = decodeFunctionData({ abi: EXECUTE_ABI, data });
  const [commands, inputs, deadline] = args;
  return { commands, inputs, deadline };
};

describe("the Pons pool key", () => {
  it("hashes to ZOLVA's pool id, so no other pool can be swapped by mistake", () => {
    expect(poolId(ZOLVA_POOL_KEY)).toBe(ZOLVA_POOL_ID);
  });
});

describe("zolvaLeg", () => {
  it("routes ZOLVA against USDG or ETH, either way", () => {
    expect(zolvaLeg(USDG, ZOLVA)).toEqual({ buy: true, other: "usdg" });
    expect(zolvaLeg(WETH, ZOLVA)).toEqual({ buy: true, other: "weth" });
    expect(zolvaLeg(ZOLVA, USDG)).toEqual({ buy: false, other: "usdg" });
    expect(zolvaLeg(ZOLVA, WETH)).toEqual({ buy: false, other: "weth" });
  });
  it("has no route for anything else", () => {
    expect(zolvaLeg(USDG, WETH)).toBeNull();
    expect(zolvaLeg("0x00000000000000000000000000000000000000c1", ZOLVA)).toBeNull();
  });
});

describe("zolvaSwapCall", () => {
  const base = { amountIn: 10_000_000n, minOut: 123n, wethUsdgFee: 100, deadline: 1_800_000_000 };

  it("buys with USDG: pull USDG, v3 to WETH from the router's balance, unwrap, v4 swap", () => {
    const { commands, inputs, deadline } = decode(zolvaSwapCall({ ...base, leg: { buy: true, other: "usdg" } }));
    expect(commands).toBe("0x02000c10");
    expect(deadline).toBe(1_800_000_000n);
    const [token, , pulled] = decodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint160" }], inputs[0]);
    expect(token.toLowerCase()).toBe(USDG);
    expect(pulled).toBe(10_000_000n);
    const [recipient, amountIn, , , payerIsUser] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }, { type: "bool" }], inputs[1]);
    expect(recipient).toBe("0x0000000000000000000000000000000000000002");
    expect(amountIn).toBe(1n << 255n);
    expect(payerIsUser).toBe(false);
    // The v4 swap: settle, swap, take all ZOLVA with the minimum out.
    const [actions, params] = decodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], inputs[3]);
    expect(actions).toBe("0x0b060f");
    const [currency, minAmount] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], params[2]);
    expect(currency.toLowerCase()).toBe(ZOLVA);
    expect(minAmount).toBe(123n);
  });

  it("buys with ETH: pulls WETH through Permit2 first", () => {
    const { commands, inputs } = decode(zolvaSwapCall({ ...base, leg: { buy: true, other: "weth" } }));
    expect(commands).toBe("0x020c10");
    const [token, , amount] = decodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint160" }], inputs[0]);
    expect(token.toLowerCase()).toBe(WETH);
    expect(amount).toBe(10_000_000n);
  });

  it("sells for USDG: v4 swap into the router, wrap, v3 to the user with the minimum", () => {
    const { commands, inputs } = decode(zolvaSwapCall({ ...base, leg: { buy: false, other: "usdg" } }));
    expect(commands).toBe("0x100b00");
    const [actions, params] = decodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], inputs[0]);
    expect(actions).toBe("0x0b060e");
    const [currency, amount, payerIsUser] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "bool" }], params[0]);
    expect(currency.toLowerCase()).toBe(ZOLVA);
    expect(amount).toBe(10_000_000n);
    expect(payerIsUser).toBe(true);
    const [recipient, , minOut, , fromUser] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }, { type: "bool" }], inputs[2]);
    expect(recipient).toBe("0x0000000000000000000000000000000000000001");
    expect(minOut).toBe(123n);
    expect(fromUser).toBe(false);
  });

  it("sells for ETH: wraps and sweeps WETH to the user with the minimum", () => {
    const { commands, inputs } = decode(zolvaSwapCall({ ...base, leg: { buy: false, other: "weth" } }));
    expect(commands).toBe("0x100b04");
    const [token, recipient, minOut] = decodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], inputs[2]);
    expect(token.toLowerCase()).toBe(WETH);
    expect(recipient).toBe("0x0000000000000000000000000000000000000001");
    expect(minOut).toBe(123n);
  });
});

describe("permit2ApproveCall", () => {
  it("approves the router for exactly the amount, for 30 minutes", () => {
    const { args } = decodeFunctionData({ abi: PERMIT2_ABI, data: permit2ApproveCall(ZOLVA, 5n, 1_000) });
    expect(args).toEqual([expect.stringMatching(new RegExp(ZOLVA, "i")), expect.stringMatching(new RegExp(UNIVERSAL_ROUTER, "i")), 5n, 1_000 + PERMIT2_TTL_SECONDS]);
  });
});

describe("Zolva's swap fee", () => {
  const base = { amountIn: 10_000_000n, minOut: 123n, wethUsdgFee: 100, deadline: 1_800_000_000 };
  const wallet = "0x3333333333333333333333333333333333333333" as Hex;

  it("takes floor(amount * bps / 10000) off what the user receives", () => {
    expect(afterFee(1_000_000n, { bps: 25, to: DEAD })).toBe(997_500n);
    expect(afterFee(999n, { bps: 25, to: DEAD })).toBe(997n);
    expect(afterFee(1_000_000n, null)).toBe(1_000_000n);
  });

  it("burns on ZOLVA buys: ZOLVA into the router, a portion to the dead address, the rest to the user", () => {
    const { commands, inputs } = decode(zolvaSwapCall({ ...base, leg: { buy: true, other: "usdg" }, fee: { bps: 25, to: DEAD } }));
    expect(commands).toBe("0x02000c100604");
    const [token, to, bips] = decodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], inputs[4]);
    expect([token.toLowerCase(), to.toLowerCase(), bips]).toEqual([ZOLVA, DEAD, 25n]);
    const [swept, recipient, minOut] = decodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], inputs[5]);
    expect([swept.toLowerCase(), recipient, minOut]).toEqual([ZOLVA, "0x0000000000000000000000000000000000000001", 123n]);
  });

  it("sends the fee to the fee wallet on ZOLVA sells, then the rest to the user", () => {
    expect(decode(zolvaSwapCall({ ...base, leg: { buy: false, other: "usdg" }, fee: { bps: 25, to: wallet } })).commands).toBe("0x100b000604");
    expect(decode(zolvaSwapCall({ ...base, leg: { buy: false, other: "weth" }, fee: { bps: 25, to: wallet } })).commands).toBe("0x100b0604");
  });

  it("swaps v3 fee pairs through the router: pull, swap, fee, rest to the user", () => {
    const { commands, inputs } = decode(v3FeeSwapCall({ tokenIn: USDG, tokenOut: WETH, path: "0x01", amountIn: 5n, minOut: 4n, fee: { bps: 25, to: wallet }, deadline: 1 }));
    expect(commands).toBe("0x02000604");
    const [, to, bips] = decodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], inputs[2]);
    expect([to.toLowerCase(), bips]).toEqual([wallet, 25n]);
  });
});

describe("native ETH", () => {
  const base = { amountIn: 10n ** 15n, minOut: 7n, wethUsdgFee: 100, deadline: 1_800_000_000 };
  it("buys ZOLVA with the ETH sent along: no pull, no unwrap, straight to the v4 swap", () => {
    expect(decode(zolvaSwapCall({ ...base, leg: { buy: true, other: "eth" } })).commands).toBe("0x10");
    expect(decode(zolvaSwapCall({ ...base, leg: { buy: true, other: "eth" }, fee: { bps: 25, to: DEAD } })).commands).toBe("0x100604");
  });
  it("sells ZOLVA for ETH paid out as ETH (router ETH is address zero)", () => {
    const { commands, inputs } = decode(zolvaSwapCall({ ...base, leg: { buy: false, other: "eth" } }));
    expect(commands).toBe("0x1004");
    const [token, , minOut] = decodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], inputs[1]);
    expect([token, minOut]).toEqual(["0x0000000000000000000000000000000000000000", 7n]);
  });
  it("wraps ETH in and unwraps ETH out on v3 routes", () => {
    expect(decode(v3FeeSwapCall({ tokenIn: ETH_NATIVE, tokenOut: USDG, path: "0x01", amountIn: 5n, minOut: 4n, fee: null, deadline: 1 })).commands).toBe("0x0b0004");
    expect(decode(v3FeeSwapCall({ tokenIn: USDG, tokenOut: ETH_NATIVE, path: "0x01", amountIn: 5n, minOut: 4n, fee: null, deadline: 1 })).commands).toBe("0x02000c04");
  });
  it("wraps and unwraps 1:1 on WETH itself", () => {
    expect(wrapCall("wrap", 5n)).toBe("0xd0e30db0");
    expect(wrapCall("unwrap", 5n).slice(0, 10)).toBe("0x2e1a7d4d");
  });
});

describe("any Pons token", () => {
  const LETRO = "0xa2753fd0bc86b8ceb55ffd2698679c7f214785f1" as Hex;
  it("uses the standard Pons pool key (ETH first, fee 0, tickSpacing 200, the Pons hook)", () => {
    expect(ponsPoolKey(LETRO)).toEqual({ currency0: "0x0000000000000000000000000000000000000000", currency1: LETRO, fee: 0, tickSpacing: 200, hooks: PONS_HOOK });
    expect(poolId(ponsPoolKey(ZOLVA))).toBe(ZOLVA_POOL_ID);
  });
  it("routes only the Pons tokens it is told about", () => {
    expect(zolvaLeg(USDG, LETRO)).toBeNull();
    expect(zolvaLeg(USDG, LETRO, [ZOLVA, LETRO])).toEqual({ buy: true, other: "usdg", token: LETRO });
    expect(zolvaLeg(LETRO, ETH_NATIVE, [ZOLVA, LETRO])).toEqual({ buy: false, other: "eth", token: LETRO });
  });
  it("takes the fee in ETH before the swap on non-ZOLVA buys (not burnt)", () => {
    const wallet = "0x3333333333333333333333333333333333333333" as Hex;
    const { commands, inputs } = decode(zolvaSwapCall({ leg: { buy: true, other: "eth", token: LETRO }, amountIn: 10n ** 15n, minOut: 9n, wethUsdgFee: 100, deadline: 1, fee: { bps: 25, to: wallet } }));
    expect(commands).toBe("0x0610");
    const [token, to, bips] = decodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], inputs[0]);
    expect([token, to.toLowerCase(), bips]).toEqual(["0x0000000000000000000000000000000000000000", wallet, 25n]);
  });
});
