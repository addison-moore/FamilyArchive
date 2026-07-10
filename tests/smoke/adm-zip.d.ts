/**
 * Minimal typing for `adm-zip` (CJS) covering what the export smoke test
 * reads — DefinitelyTyped's `export =` form clashes with verbatimModuleSyntax.
 */
declare module "adm-zip" {
  interface ZipEntry {
    entryName: string;
    getData(): Buffer;
  }

  class AdmZip {
    constructor(buffer?: Buffer);
    getEntries(): ZipEntry[];
    getEntry(name: string): ZipEntry | null;
    readAsText(name: string): string;
  }

  export default AdmZip;
}
