import type { Participant } from "@/domain";

export const participants: Participant[] = [
  { id: "prd-akmola-agro", name: "Akmola Agro LLP", type: "PRODUCER" },
  { id: "prd-kostanay-grain", name: "Steppe Grain LLP", type: "PRODUCER" },
  { id: "prd-north-steppe", name: "North Fields LLP", type: "PRODUCER" },
  { id: "prd-pavlodar-harvest", name: "Saryarka Agro LLP", type: "PRODUCER" },
  { id: "inv-demo-a", name: "Demo Investor A", type: "INVESTOR" },
  { id: "inv-demo-b", name: "Demo Investor B", type: "INVESTOR" },
  { id: "inv-demo-c", name: "Demo Investor C", type: "INVESTOR" },
  { id: "iss-demo-agro", name: "Demo Agro Issuer Ltd", type: "ISSUER" },
];
