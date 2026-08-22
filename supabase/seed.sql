-- Demo organizations and personas. Application data only.
-- Does not mint, transfer, or otherwise change WHEAT-2027.

insert into public.organizations (
  id, slug, name, type, status, external_producer_ref, external_investor_ref
) values
  ('11111111-1111-4111-8111-111111111001', 'field-to-finance', 'Field to Finance', 'PLATFORM', 'ACTIVE', null, null),
  ('11111111-1111-4111-8111-111111111002', 'regulator', 'Регулирующий орган', 'REGULATOR', 'ACTIVE', null, null),
  ('11111111-1111-4111-8111-111111111003', 'agricultural-registrar', 'Аграрный регистратор', 'REGISTRAR', 'ACTIVE', null, null),
  ('11111111-1111-4111-8111-111111111004', 'scas', 'СЦАС', 'SCAS', 'ACTIVE', null, null),
  ('11111111-1111-4111-8111-111111111005', 'akmola-agro', 'Akmola Agro LLP', 'PRODUCER', 'ACTIVE', 'PRODUCER-0001', null),
  ('11111111-1111-4111-8111-111111111006', 'steppe-grain', 'Steppe Grain LLP', 'PRODUCER', 'ACTIVE', 'PRODUCER-0002', null),
  ('11111111-1111-4111-8111-111111111007', 'north-fields', 'North Fields LLP', 'PRODUCER', 'ACTIVE', 'PRODUCER-0003', null),
  ('11111111-1111-4111-8111-111111111008', 'saryarka-agro', 'Saryarka Agro LLP', 'PRODUCER', 'ACTIVE', 'PRODUCER-0004', null),
  ('11111111-1111-4111-8111-111111111009', 'agro-issuer', 'Agro Issuer', 'ISSUER', 'ACTIVE', null, null),
  ('11111111-1111-4111-8111-111111111010', 'steppe-capital', 'Steppe Capital', 'INVESTMENT_FUND', 'ACTIVE', null, 'INVESTOR-0001'),
  ('11111111-1111-4111-8111-111111111011', 'grain-desk', 'Grain Desk', 'TRADING_FIRM', 'ACTIVE', null, null),
  ('11111111-1111-4111-8111-111111111012', 'commodity-desk', 'Commodity Desk', 'TRADING_FIRM', 'ACTIVE', null, null),
  ('11111111-1111-4111-8111-111111111013', 'compliance-provider', 'Compliance Provider', 'COMPLIANCE_PROVIDER', 'ACTIVE', null, null)
on conflict (id) do update
  set slug = excluded.slug,
      name = excluded.name,
      type = excluded.type,
      status = excluded.status,
      external_producer_ref = excluded.external_producer_ref,
      external_investor_ref = excluded.external_investor_ref;

insert into public.demo_personas (
  id, display_name, group_key, organization_id, role_id, status,
  external_producer_ref, external_investor_ref, wallet_address, investor_ata
) values
  ('DEMO-ADMIN-001', 'Администратор платформы', 'system', '11111111-1111-4111-8111-111111111001', 'SYSTEM_ADMIN', 'ACTIVE', null, null, null, null),
  ('DEMO-REGULATOR-001', 'Регулятор', 'control', '11111111-1111-4111-8111-111111111002', 'REGULATOR', 'ACTIVE', null, null, null, null),
  ('DEMO-REGISTRAR-001', 'Регистратор — сотрудник 1', 'control', '11111111-1111-4111-8111-111111111003', 'REGISTRAR_OPERATOR', 'ACTIVE', null, null, null, null),
  ('DEMO-SCAS-001', 'СЦАС — сотрудник 1', 'control', '11111111-1111-4111-8111-111111111004', 'SCAS_OPERATOR', 'ACTIVE', null, null, null, null),
  ('DEMO-COMPLIANCE-001', 'Комплаенс — сотрудник 1', 'control', '11111111-1111-4111-8111-111111111013', 'COMPLIANCE_OFFICER', 'ACTIVE', null, null, null, null),
  ('DEMO-FARM-001', 'Фермер 1 — Akmola Agro LLP', 'agro', '11111111-1111-4111-8111-111111111005', 'PRODUCER_ADMIN', 'ACTIVE', 'PRODUCER-0001', null, null, null),
  ('DEMO-FARM-002', 'Хозяйство 2 — Steppe Grain LLP', 'agro', '11111111-1111-4111-8111-111111111006', 'PRODUCER_ADMIN', 'ACTIVE', 'PRODUCER-0002', null, null, null),
  ('DEMO-FARM-003', 'Хозяйство 3 — North Fields LLP', 'agro', '11111111-1111-4111-8111-111111111007', 'PRODUCER_ADMIN', 'ACTIVE', 'PRODUCER-0003', null, null, null),
  ('DEMO-FARM-004', 'Хозяйство 4 — Saryarka Agro LLP', 'agro', '11111111-1111-4111-8111-111111111008', 'PRODUCER_ADMIN', 'ACTIVE', 'PRODUCER-0004', null, null, null),
  ('DEMO-ISSUER-001', 'Эмитент — Agro Issuer', 'agro', '11111111-1111-4111-8111-111111111009', 'ISSUER_OPERATOR', 'ACTIVE', null, null, null, null),
  (
    'DEMO-FUND-001',
    'Инвестфонд 1 — Steppe Capital',
    'market',
    '11111111-1111-4111-8111-111111111010',
    'INVESTOR',
    'ACTIVE',
    null,
    'INVESTOR-0001',
    'AJ7wcKJq368STkEWFDESGJKBSGvFbHDv749g9iAHZt63',
    'D7dNbub9wmETEkDoS7b73KpVxTwRb26Cbe9ffRptVUDw'
  ),
  ('DEMO-TRADER-001', 'Трейдер 1 — Grain Desk', 'market', '11111111-1111-4111-8111-111111111011', 'TRADER', 'ACTIVE', null, null, null, null),
  ('DEMO-TRADER-002', 'Трейдер 2 — Commodity Desk', 'market', '11111111-1111-4111-8111-111111111012', 'TRADER', 'ACTIVE', null, null, null, null)
on conflict (id) do update
  set display_name = excluded.display_name,
      group_key = excluded.group_key,
      organization_id = excluded.organization_id,
      role_id = excluded.role_id,
      status = excluded.status,
      external_producer_ref = excluded.external_producer_ref,
      external_investor_ref = excluded.external_investor_ref,
      wallet_address = excluded.wallet_address,
      investor_ata = excluded.investor_ata;
