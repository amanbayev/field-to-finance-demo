import type { FinancingPosition } from "@/domain";

export const financingModules: FinancingPosition[] = [
  {
    id: "fin-secured-loan",
    module: "SECURED_LOAN",
    title: "Secured Loan",
    status: "COMING_NEXT",
    steps: ["Agricultural Token", "Pledged", "Financing", "Repayment", "Token Released"],
  },
  {
    id: "fin-repo",
    module: "REPO",
    title: "Repo",
    status: "EXPERIMENTAL",
    legalNote: "Potential financing module subject to legal structuring.",
    steps: [
      "Token Sale",
      "Financing",
      "Repurchase Obligation",
      "Token Returned",
    ],
  },
];
