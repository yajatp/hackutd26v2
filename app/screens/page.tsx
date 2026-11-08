import { Home } from "../home/Home";
import { siteParam } from "../home/screens";

// Every screen in demo order. The site is read here on the server, so the index links carry
// ?site= even before any JavaScript runs. The landing at / is the VR station.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const site = siteParam((await searchParams).site);
  return <Home site={site} />;
}
