export const copyBin = new Map<string, string>();

export type FileAsset = {
  dataUrl: string;
  filename: string;
  alt: string;
};

export const fileBin = new Map<string, FileAsset>();

export function resetBins(): void {
  copyBin.clear();
  fileBin.clear();
}
