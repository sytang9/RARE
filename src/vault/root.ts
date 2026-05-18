export interface VaultRoot {
  root: string;
}

export const wikiDir = (v: VaultRoot): string => `${v.root}/wiki`;
export const rawDir = (v: VaultRoot): string => `${v.root}/raw`;
export const rareDir = (v: VaultRoot): string => `${v.root}/.rare`;
