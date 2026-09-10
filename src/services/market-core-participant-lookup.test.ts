import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerSupabaseClient } from "@/lib/auth/supabase/server";
import { lookupMarketCoreParticipant } from "./market-core-participant-lookup";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
const user = randomUUID(), org = randomUUID(), participant = `PAR-${randomUUID()}`;
function context() {
  return {
    principal_user_id: user, active_organization_id: org, effective_demo_persona_id: null as string | null,
    profiles: { user_id: user, status: "ACTIVE" },
    organizations: { id: org, status: "ACTIVE",
      memberships: [{ id: randomUUID(), user_id: user, organization_id: org, status: "ACTIVE" }],
      market_core_participants: { id: participant, organization_id: org, status: "ACTIVE", created_at: "2026-09-08T00:00:00Z" } as {
        id: string; organization_id: string; status: string; created_at: string;
      } | null,
    },
  };
}
function setup(data: unknown = context(), error: unknown = null) {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({data,error}) };
  // Only SELECT capabilities exist. Any RPC/write attempt fails the test.
  const client = { auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: user } }, error: null }) }, from: vi.fn(()=>query) };
  vi.mocked(createServerSupabaseClient).mockResolvedValue(client as unknown as NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>);
  return {client,query};
}
afterEach(()=>vi.resetAllMocks());

describe("server-only institutional participant lookup",()=> {
  it.each(["ACTIVE","SUSPENDED","RETIRED"])("returns actual %s identity without lifecycle writes",async status=> {
    const row=context(); row.organizations.market_core_participants!.status=status;
    const {client,query}=setup(row);
    expect(await lookupMarketCoreParticipant(org)).toEqual({kind:"FOUND",participant:{id:participant,organizationId:org,status,createdAt:"2026-09-08T00:00:00Z"}});
    expect(client.auth.getClaims).toHaveBeenCalledExactlyOnceWith();
    expect(client.from).toHaveBeenCalledExactlyOnceWith("session_contexts");
    expect(query.eq.mock.calls).toEqual([
      ["principal_user_id",user],["active_organization_id",org],["profiles.status","ACTIVE"],
      ["organizations.status","ACTIVE"],["organizations.memberships.user_id",user],["organizations.memberships.status","ACTIVE"],
    ]);
    expect(query.is).toHaveBeenCalledExactlyOnceWith("effective_demo_persona_id",null);
    expect(query.select.mock.calls[0][0]).toContain("organizations!inner");
    expect(query.select.mock.calls[0][0]).toContain("memberships!inner");
    expect(query.select.mock.calls[0][0]).toContain("market_core_participants(id, organization_id, status, created_at)");
  });
  it("distinguishes authorized absence from unauthorized/missing context",async()=> {
    const row=context(); row.organizations.market_core_participants=null; setup(row);
    expect(await lookupMarketCoreParticipant(org)).toEqual({kind:"ABSENT"});
    setup(null); expect(await lookupMarketCoreParticipant(org)).toEqual({kind:"UNAVAILABLE",reason:"UNAUTHORIZED"});
  });
  it("rejects a valid participant ID wrapped in an array instead of returning FOUND",async()=> {
    const row=context();
    Object.assign(row.organizations.market_core_participants!,{id:[participant]});
    setup(row);
    expect(await lookupMarketCoreParticipant(org)).toEqual({kind:"UNAVAILABLE",reason:"ERROR"});
  });
  it("rejects a valid membership ID wrapped in an array with a present participant",async()=> {
    const row=context(), membership=row.organizations.memberships[0];
    Object.assign(membership,{id:[membership.id]});
    setup(row);
    expect(await lookupMarketCoreParticipant(org)).toEqual({kind:"UNAVAILABLE",reason:"UNAUTHORIZED"});
  });
  it("rejects a valid membership ID wrapped in an array instead of returning ABSENT",async()=> {
    const row=context(), membership=row.organizations.memberships[0];
    row.organizations.market_core_participants=null;
    Object.assign(membership,{id:[membership.id]});
    setup(row);
    expect(await lookupMarketCoreParticipant(org)).toEqual({kind:"UNAVAILABLE",reason:"UNAUTHORIZED"});
  });
  it.each(["steppe-capital","INVESTOR-0001",participant,"",user+" extra"])("rejects non-organization locator %s before auth",async id=> {
    expect(await lookupMarketCoreParticipant(id)).toEqual({kind:"UNAVAILABLE",reason:"UNAUTHORIZED"});
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
  it.each(["selection","principal","persona","profile","profile-owner","organization","org-status","membership","member-owner","member-org","member-status","duplicate-membership"])("fails closed for inconsistent %s context",async kind=> {
    const row=context();
    if(kind==="selection") row.active_organization_id=randomUUID();
    if(kind==="principal") row.principal_user_id=randomUUID();
    if(kind==="persona") row.effective_demo_persona_id="legacy-demo-persona";
    if(kind==="profile") row.profiles.status="SUSPENDED";
    if(kind==="profile-owner") row.profiles.user_id=randomUUID();
    if(kind==="organization") row.organizations.id=randomUUID();
    if(kind==="org-status") row.organizations.status="SUSPENDED";
    if(kind==="membership") row.organizations.memberships=[];
    if(kind==="member-owner") row.organizations.memberships[0].user_id=randomUUID();
    if(kind==="member-org") row.organizations.memberships[0].organization_id=randomUUID();
    if(kind==="member-status") row.organizations.memberships[0].status="INVITED";
    if(kind==="duplicate-membership") row.organizations.memberships.push({...row.organizations.memberships[0]});
    setup(row); expect(await lookupMarketCoreParticipant(org)).toEqual({kind:"UNAVAILABLE",reason:"UNAUTHORIZED"});
  });
  it.each(["wrong-org","legacy-id","unknown-status","invalid-date","undefined","array"])("reports malformed identity %s as error, never absent or adopted",async kind=> {
    const row=context(), p=row.organizations.market_core_participants!;
    if(kind==="wrong-org") p.organization_id=randomUUID();
    if(kind==="legacy-id") p.id="INVESTOR-0001";
    if(kind==="unknown-status") p.status="ELIGIBLE";
    if(kind==="invalid-date") p.created_at="not-a-date";
    if(kind==="undefined") delete (row.organizations as Partial<typeof row.organizations>).market_core_participants;
    if(kind==="array") Object.assign(row.organizations,{market_core_participants:[p]});
    setup(row); expect(await lookupMarketCoreParticipant(org)).toEqual({kind:"UNAVAILABLE",reason:"ERROR"});
  });
  it("canonicalizes a UUID, never a slug or legacy alias",async()=> {
    setup(); expect((await lookupMarketCoreParticipant(org.toUpperCase())).kind).toBe("FOUND");
  });
  it("configuration, auth, query and thrown failures reveal no database details",async()=> {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(null);
    expect(await lookupMarketCoreParticipant(org)).toEqual({kind:"UNAVAILABLE",reason:"NOT_CONFIGURED"});
    const {client}=setup(); client.auth.getClaims.mockResolvedValue({data:null,error:new Error("private auth detail")});
    expect(await lookupMarketCoreParticipant(org)).toEqual({kind:"UNAVAILABLE",reason:"UNAUTHORIZED"});
    expect(client.from).not.toHaveBeenCalled();
    setup(null,{message:"another institution exists"});
    expect(await lookupMarketCoreParticipant(org)).toEqual({kind:"UNAVAILABLE",reason:"ERROR"});
    vi.mocked(createServerSupabaseClient).mockRejectedValue(new Error("secret"));
    expect(await lookupMarketCoreParticipant(org)).toEqual({kind:"UNAVAILABLE",reason:"ERROR"});
  });
  it("keeps mutation and legacy actor resolution outside this server module",()=> {
    const source=readFileSync("src/services/market-core-participant-lookup.ts","utf8");
    expect(source).toContain('import "server-only"');
    expect(source).not.toMatch(/\.rpc\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(|createServiceRoleClient|requireActor|participantIdForActor|market_core_get_or_create_participant/);
    expect(source).not.toContain('"use server"');
  });
});
