import { describe, expect, it, vi } from "vitest";
import { createPinataPinner, PINATA_UPLOAD_URL, PinUnavailableError, sniffImage } from "./ipfs";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const bytes = (s: string) => new TextEncoder().encode(s);

describe("sniffImage", () => {
  it("detects PNG, JPEG, GIF and WebP from their first bytes", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(bytes("GIF89a...."))).toBe("image/gif");
    expect(sniffImage(bytes("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });
  it("refuses SVG, HTML and anything else", () => {
    expect(sniffImage(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImage(bytes("<html>"))).toBeNull();
    expect(sniffImage(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe("createPinataPinner", () => {
  it("uploads publicly with the bearer JWT and returns the ipfs:// URI", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ data: { cid: CID } }), { status: 200 }),
    );
    const uri = await createPinataPinner("jwt-123", fetchImpl).pin(PNG, "image/png");
    expect(uri).toBe(`ipfs://${CID}`);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(PINATA_UPLOAD_URL);
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer jwt-123");
    const form = init!.body as FormData;
    expect(form.get("network")).toBe("public");
    expect((form.get("file") as Blob).type).toBe("image/png");
  });

  it("fails closed on an error status, a network error or an unusable CID", async () => {
    const reply = (body: unknown, status = 200) =>
      createPinataPinner("j", async () => new Response(JSON.stringify(body), { status }));
    await expect(reply({}, 401).pin(PNG, "image/png")).rejects.toBeInstanceOf(PinUnavailableError);
    await expect(reply({ data: { cid: "../../x" } }).pin(PNG, "image/png")).rejects.toBeInstanceOf(
      PinUnavailableError,
    );
    const down = createPinataPinner("j", async () => {
      throw new TypeError("fetch failed");
    });
    await expect(down.pin(PNG, "image/png")).rejects.toBeInstanceOf(PinUnavailableError);
  });
});
