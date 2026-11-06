import { describe, expect, it } from "vitest";
import { readTextBounded } from "../src/http";

describe("bounded request bodies", () => {
  it("stops reading a chunked body as soon as it crosses the limit", async () => {
    const request = new Request("https://api.example.test/body", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(8));
          controller.enqueue(new Uint8Array(8));
          controller.close();
        },
      }),
      // Node requires this for a streaming request; Workers ignore the field.
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    await expect(readTextBounded(request, 10)).rejects.toMatchObject({
      code: "payload_too_large",
      status: 413,
    });
  });
});
