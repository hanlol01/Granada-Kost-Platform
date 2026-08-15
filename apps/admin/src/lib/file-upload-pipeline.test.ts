import assert from "node:assert/strict";
import test from "node:test";
import { File as NodeFile } from "node:buffer";
import { FilePreparationError, detectFileContentType, prepareFileForUpload } from "./file-utils";

const FileCtor = NodeFile as unknown as typeof File;

function pngFile(name: string, size: number): File {
  const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new FileCtor([signature, new Uint8Array(Math.max(0, size - signature.length))], name, {
    type: "image/png",
  });
}

function jpegBlob(size: number): Blob {
  const signature = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
  return new Blob([signature, new Uint8Array(Math.max(0, size - signature.length))], {
    type: "image/jpeg",
  });
}

test("detects supported file content from magic bytes", async () => {
  assert.equal(await detectFileContentType(pngFile("proof.png", 32)), "image/png");
  assert.equal(await detectFileContentType(jpegBlob(32)), "image/jpeg");
});

test("compresses a 4 MB PNG before applying the 2 MB payment-proof limit", async () => {
  const prepared = await prepareFileForUpload(
    pngFile("transfer.png", 4 * 1024 * 1024),
    "payment_proof",
    {
      compressor: async () => jpegBlob(700 * 1024),
    },
  );

  assert.equal(prepared.file.name, "transfer.jpg");
  assert.equal(prepared.file.type, "image/jpeg");
  assert.equal(prepared.file.size, 700 * 1024);
  assert.equal(prepared.wasCompressed, true);
});

test("normalizes a mismatched image filename to its detected safe content type", async () => {
  const disguised = new FileCtor([jpegBlob(256)], "camera.png", { type: "image/png" });
  const prepared = await prepareFileForUpload(disguised, "payment_proof", {
    compressor: async (file) => file,
  });

  assert.equal(prepared.file.name, "camera.jpg");
  assert.equal(prepared.file.type, "image/jpeg");
});

test("uses compressed magic bytes instead of trusting the compressor MIME label", async () => {
  const prepared = await prepareFileForUpload(pngFile("receipt.png", 512), "payment_proof", {
    compressor: async () => new Blob([jpegBlob(256)], { type: "image/png" }),
  });

  assert.equal(prepared.file.name, "receipt.jpg");
  assert.equal(prepared.file.type, "image/jpeg");
});

test("rejects an image that remains above the policy limit after compression", async () => {
  await assert.rejects(
    prepareFileForUpload(pngFile("large.png", 4 * 1024 * 1024), "payment_proof", {
      compressor: async () => jpegBlob(3 * 1024 * 1024),
    }),
    (error: unknown) =>
      error instanceof FilePreparationError &&
      error.code === "CLIENT_FILE_TOO_LARGE_AFTER_COMPRESSION",
  );
});

test("rejects bytes that are not a supported image or PDF", async () => {
  const invalid = new FileCtor([new Uint8Array(64)], "proof.jpg", { type: "image/jpeg" });
  await assert.rejects(
    prepareFileForUpload(invalid, "payment_proof"),
    (error: unknown) =>
      error instanceof FilePreparationError && error.code === "CLIENT_FILE_CONTENT_UNSUPPORTED",
  );
});
