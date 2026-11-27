import { describe, expect, it } from "vitest";
import { ipfsImageUrl } from "./media";

const V1 = "bafkreifqy3iesc5utguhgfj6cvblu5azogmf56ogbm5d7zazae732w2lwi"; // a live Pons logo
const V0 = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

describe("ipfsImageUrl", () => {
  it("maps ipfs:// CIDs (v0, v1, with a path) to the gateway", () => {
    expect(ipfsImageUrl(`ipfs://${V1}`)).toBe(`https://gateway.pinata.cloud/ipfs/${V1}`);
    expect(ipfsImageUrl(` ipfs://${V0} `)).toBe(`https://gateway.pinata.cloud/ipfs/${V0}`);
    expect(ipfsImageUrl(`ipfs://ipfs/${V1}/logo.png`)).toBe(
      `https://gateway.pinata.cloud/ipfs/${V1}/logo.png`,
    );
  });

  it("drops everything that is not a clean IPFS reference", () => {
    for (const bad of [
      null,
      "",
      "https://evil.example/x.png",
      "data:image/svg+xml;base64,AAAA",
      "javascript:alert(1)",
      "ipfs://not-a-cid",
      `ipfs://${V1}/../x`,
      `ipfs://${V1}/a?b=c`,
      `ipfs://${V1}/a"onerror=x`,
    ]) {
      expect(ipfsImageUrl(bad)).toBeNull();
    }
  });
});
