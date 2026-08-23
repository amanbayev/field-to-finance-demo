/**
 * Read-only capability audit: can agricultural_market settle a SECONDARY trade?
 *
 * Primary instruction `settle_primary_placement` is not a secondary DvP.
 * No programme change or deploy is performed here.
 */

export const SECONDARY_DVP_INSTRUCTION = null;

export const PRIMARY_DVP_INSTRUCTION = "settle_primary_placement";

export interface SecondaryDvpAudit {
  canExecuteSecondaryAtomicDvpWithCurrentProgram: false;
  primaryInstruction: typeof PRIMARY_DVP_INSTRUCTION;
  requiredNewInstruction: "settle_secondary_dvp";
  programRedeployRequired: true;
  primaryAccounts: {
    signers: ["registrar", "investor"];
    wheatSource: "registrar_instrument_ata (authority = registrar)";
    wheatDestination: "investor_instrument_ata (ATA for investor, init_if_needed)";
    demoKztSource: "investor_settlement_ata (authority = investor)";
    demoKztDestination: "issuer_settlement_ata (authority = issuer_settlement_owner)";
  };
  secondaryWouldNeed: {
    signers: ["seller", "buyer"];
    wheatSource: "seller WHEAT Token-2022 ATA";
    wheatDestination: "buyer WHEAT Token-2022 ATA";
    demoKztSource: "buyer DEMO-KZT Token-2022 ATA";
    demoKztDestination: "seller DEMO-KZT Token-2022 ATA";
  };
  whyPrimaryCannotBeReused: string[];
}

export const SECONDARY_DVP_AUDIT: SecondaryDvpAudit = {
  canExecuteSecondaryAtomicDvpWithCurrentProgram: false,
  primaryInstruction: PRIMARY_DVP_INSTRUCTION,
  requiredNewInstruction: "settle_secondary_dvp",
  programRedeployRequired: true,
  primaryAccounts: {
    signers: ["registrar", "investor"],
    wheatSource: "registrar_instrument_ata (authority = registrar)",
    wheatDestination: "investor_instrument_ata (ATA for investor, init_if_needed)",
    demoKztSource: "investor_settlement_ata (authority = investor)",
    demoKztDestination: "issuer_settlement_ata (authority = issuer_settlement_owner)",
  },
  secondaryWouldNeed: {
    signers: ["seller", "buyer"],
    wheatSource: "seller WHEAT Token-2022 ATA",
    wheatDestination: "buyer WHEAT Token-2022 ATA",
    demoKztSource: "buyer DEMO-KZT Token-2022 ATA",
    demoKztDestination: "seller DEMO-KZT Token-2022 ATA",
  },
  whyPrimaryCannotBeReused: [
    "WHEAT is taken from the Registrar inventory ATA, not from a secondary seller ATA.",
    "DEMO-KZT is paid to the issuer settlement owner, not to the secondary seller.",
    "Both Registrar and primary investor must sign; a secondary seller/buyer pair cannot substitute.",
    "The instruction initializes a one-time PrimaryPlacementReceipt PDA keyed by placement_id.",
    "Coverage and issuance-id checks are primary-placement rules, not secondary transfer rules.",
  ],
};

export function currentProgramCanSettleSecondaryDvp(): false {
  return SECONDARY_DVP_AUDIT.canExecuteSecondaryAtomicDvpWithCurrentProgram;
}
