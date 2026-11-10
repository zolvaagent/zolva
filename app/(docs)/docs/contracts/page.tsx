import type { Metadata } from "next";
import Link from "next/link";

import { Callout, DocsArticle, H2 } from "@/components/site/Docs";
import { TokenAddress } from "@/components/site/TokenAddress";
import { EXPLORER_URL, LIVE_TRADING_WALLET } from "@/lib/chain";
import { docPage } from "@/lib/docs";
import { env } from "@/lib/env";
import { QUOTER_V2, SWAP_ROUTER_02, USDG } from "@/lib/live/contracts";
import { X_HANDLE } from "@/lib/social";
import { BURN_ADDRESS } from "@/lib/zolva-topup";
import { zolvaTokenCard } from "@/lib/zolva-token";

const page = docPage("contracts");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };
// Zolva's own addresses come from the Worker's env, which is not there at build time.
export const dynamic = "force-dynamic";

type Row = { name: string; address: string; note: string };

function AddressTable({ rows }: { rows: Row[] }) {
  return (
    <div className="docs-table-wrap">
      <table className="docs-table">
        <thead>
          <tr>
            <th>What</th>
            <th>Address</th>
            <th>Used for</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>
                <a className="mono" href={`${EXPLORER_URL}/address/${row.address}`} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: "anywhere" }}>
                  {row.address}
                </a>
              </td>
              <td>{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Every address Zolva uses on Robinhood Chain, each linked to Blockscout. */
export default function Contracts() {
  const token = zolvaTokenCard();
  const relayer = env.x402Relayer;
  const x402PayTo = env.x402?.payTo ?? null;
  const creditsPayTo = env.creditsPayTo;

  const own: Row[] = [
    { name: "Real money trading wallet", address: LIVE_TRADING_WALLET, note: "The live real money agent trades from here. Every trade is a transaction you can open." },
    ...(x402PayTo ? [{ name: "Payments received", address: x402PayTo, note: "Receives USDG for Premium API calls (x402)." }] : []),
    ...(creditsPayTo && creditsPayTo !== x402PayTo ? [{ name: "Credit top-ups received", address: creditsPayTo, note: "Receives USDG paid for AI credits." }] : []),
    ...(relayer ? [{ name: "x402 relayer", address: relayer.address, note: "Settles x402 payments and pays their gas. It can only move USDG to the payments address." }] : []),
    { name: "Burn address", address: BURN_ADDRESS, note: "ZOLVA paid for AI credits is sent here and can never move again." },
  ];
  const protocols: Row[] = [
    { name: "USDG", address: USDG, note: "The dollar stablecoin agents, payments and top-ups use." },
    { name: "Uniswap SwapRouter02", address: SWAP_ROUTER_02, note: "Executes the live agent's trades and swaps on /swap." },
    { name: "Uniswap QuoterV2", address: QUOTER_V2, note: "Prices a trade before it is sent." },
  ];

  return (
    <DocsArticle slug={page.slug}>
      <p>
        Every address Zolva uses on Robinhood Chain (chain ID 4663), each linked to Blockscout. If an address is not on this page, it is not Zolva&apos;s.
      </p>

      <H2 id="token">ZOLVA token</H2>
      {token ? (
        <TokenAddress token={token} />
      ) : (
        <Callout kind="warn" title="No token yet">
          There is no ZOLVA token today. Its address will be added here and posted from @{X_HANDLE} at launch.
        </Callout>
      )}

      <H2 id="zolva">Zolva&apos;s wallets</H2>
      <AddressTable rows={own} />
      {creditsPayTo && creditsPayTo === x402PayTo && <p>The payments address also receives USDG paid for AI credits.</p>}

      <H2 id="protocols">Contracts Zolva calls</H2>
      <AddressTable rows={protocols} />

      <H2 id="markets">Market tokens and pools</H2>
      <p>
        Each market&apos;s page on <Link href="/markets">Markets</Link> links to its token contract and the pool its hourly price is read from. Stock tokens are
        checked against Robinhood&apos;s official list; see <Link href="/docs/markets-and-prices">Markets and prices</Link>.
      </p>
    </DocsArticle>
  );
}
