declare module "exifr/dist/lite.esm.mjs" {
  const exifr: {
    parse(input: Blob | ArrayBuffer | Uint8Array): Promise<Record<string, unknown> | null>
  }
  export default exifr
}
