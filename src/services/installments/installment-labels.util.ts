/** Parsea labels MP tipo "CFT_70,21%|TEA_89,43%". */
export function parseCftTeaFromLabels(labels: string[] | undefined): {
  cft: string | null;
  tea: string | null;
} {
  if (!labels?.length) return { cft: null, tea: null };
  let cft: string | null = null;
  let tea: string | null = null;
  for (const label of labels) {
    const cftMatch = label.match(/CFT_([^|]+)/i);
    const teaMatch = label.match(/TEA_([^|]+)/i);
    if (cftMatch?.[1]) cft = cftMatch[1].trim();
    if (teaMatch?.[1]) tea = teaMatch[1].trim();
  }
  return { cft, tea };
}
