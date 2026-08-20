import type { Producer } from "@/domain";

export const producers: Producer[] = [
  {
    id: "prd-akmola-agro",
    legalName: "Akmola Agro LLP",
    region: "Akmola",
    score: { value: 84, maxValue: 100, asOf: "2026-06-01" },
  },
  {
    id: "prd-kostanay-grain",
    legalName: "Kostanay Grain LLP",
    region: "Kostanay",
    score: { value: 79, maxValue: 100, asOf: "2026-06-01" },
  },
  {
    id: "prd-north-steppe",
    legalName: "North Steppe Farming JSC",
    region: "North Kazakhstan",
    score: { value: 88, maxValue: 100, asOf: "2026-06-01" },
  },
  {
    id: "prd-pavlodar-harvest",
    legalName: "Pavlodar Harvest LLP",
    region: "Pavlodar",
    score: { value: 76, maxValue: 100, asOf: "2026-06-01" },
  },
  {
    id: "prd-karaganda-fields",
    legalName: "Karaganda Fields LLP",
    region: "Karaganda",
    score: { value: 71, maxValue: 100, asOf: "2026-06-01" },
  },
  {
    id: "prd-aktobe-grain",
    legalName: "Aktobe Grain Cooperative",
    region: "Aktobe",
    score: { value: 68, maxValue: 100, asOf: "2026-06-01" },
  },
  {
    id: "prd-east-steppe",
    legalName: "East Steppe Holdings",
    region: "Abai",
    score: { value: 62, maxValue: 100, asOf: "2026-06-01" },
  },
  {
    id: "prd-south-wheat",
    legalName: "Turkistan Wheat LLP",
    region: "Turkistan",
    score: { value: 58, maxValue: 100, asOf: "2026-06-01" },
  },
];
