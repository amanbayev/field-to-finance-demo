import type { Participant } from "@/domain";

export const participants: Participant[] = [
  { id: "prd-akmola-agro", name: "Akmola Agro LLP", type: "PRODUCER" },
  { id: "prd-kostanay-grain", name: "Kostanay Grain LLP", type: "PRODUCER" },
  { id: "prd-north-steppe", name: "North Steppe Farming JSC", type: "PRODUCER" },
  { id: "prd-pavlodar-harvest", name: "Pavlodar Harvest LLP", type: "PRODUCER" },
  { id: "inv-demo-a", name: "Demo Investor A", type: "INVESTOR" },
  { id: "inv-demo-b", name: "Demo Investor B", type: "INVESTOR" },
  { id: "inv-demo-c", name: "Demo Investor C", type: "INVESTOR" },
  { id: "iss-demo-agro", name: "Demo Agro Issuer Ltd", type: "ISSUER" },
];
