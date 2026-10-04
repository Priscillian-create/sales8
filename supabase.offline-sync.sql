-- Run after supabase.schema.sql. Keeps existing data and access policies.
-- Each local operation has a durable receipt, so replay after a lost HTTP
-- response cannot deduct stock twice. The whole upload commits atomically.
create table if not exists public.pos_sync_receipts (
  operation_id text primary key,
  applied_at timestamptz not null default now()
);
alter table public.pos_sync_receipts enable row level security;
drop policy if exists "POS sync receipts" on public.pos_sync_receipts;
create policy "POS sync receipts" on public.pos_sync_receipts
  for all to anon, authenticated using (true) with check (true);
grant select, insert on public.pos_sync_receipts to anon, authenticated;

create or replace function public.sync_pos_changes(changes jsonb, device_id text)
returns void language plpgsql security invoker set search_path = public as $$
declare
  change jsonb;
  record_data jsonb;
  operation text;
  applied text;
  product products%rowtype;
  customer customers%rowtype;
  prescription prescriptions%rowtype;
  sale sales%rowtype;
begin
  if jsonb_typeof(changes) <> 'array' or device_id is null or length(device_id) > 100 then
    raise exception 'Invalid sync request';
  end if;
  for change in select value from jsonb_array_elements(changes) loop
    operation := device_id || ':' || (change->>'version');
    applied := null;
    insert into pos_sync_receipts(operation_id) values(operation)
      on conflict do nothing returning operation_id into applied;
    if applied is null then continue; end if;
    record_data := change->'row';
    if record_data = 'null'::jsonb then
      case change->>'table'
        when 'products' then delete from products where id = (change->>'id')::bigint;
        when 'customers' then delete from customers where id = (change->>'id')::bigint;
        when 'prescriptions' then delete from prescriptions where id = change->>'id';
        when 'sales' then delete from sales where id = change->>'id';
        else raise exception 'Invalid sync table';
      end case;
    else
      case change->>'table'
        when 'products' then
          product := jsonb_populate_record(null::products, record_data);
          if change ? 'stockDelta' then
            update products set name=product.name, generic=product.generic,
              category=product.category, batch=product.batch,
              stock=stock+(change->>'stockDelta')::integer,
              reorder=product.reorder, expiry=product.expiry, price=product.price,
              prescription=product.prescription, location=product.location,
              supplier=product.supplier, updated_at=now()
              where id=product.id;
            if not found then
              raise sqlstate 'PT409' using message='Product was deleted in cloud inventory. Review the pending sale before retrying.';
            end if;
          else
            insert into products(id,name,generic,category,batch,stock,reorder,expiry,price,prescription,location,supplier)
            values(product.id,product.name,product.generic,product.category,product.batch,product.stock,
              product.reorder,product.expiry,product.price,product.prescription,product.location,product.supplier)
            on conflict(id) do update set name=excluded.name,generic=excluded.generic,
              category=excluded.category,batch=excluded.batch,stock=excluded.stock,
              reorder=excluded.reorder,expiry=excluded.expiry,price=excluded.price,
              prescription=excluded.prescription,location=excluded.location,supplier=excluded.supplier,updated_at=now();
          end if;
        when 'customers' then
          customer := jsonb_populate_record(null::customers, record_data);
          insert into customers(id,name,phone,plan,allergies,last,status)
          values(customer.id,customer.name,customer.phone,customer.plan,customer.allergies,customer.last,customer.status)
          on conflict(id) do update set name=excluded.name,phone=excluded.phone,plan=excluded.plan,
            allergies=excluded.allergies,last=excluded.last,status=excluded.status,updated_at=now();
        when 'prescriptions' then
          prescription := jsonb_populate_record(null::prescriptions, record_data);
          insert into prescriptions(id,patient_id,medication_id,status,prescriber,wait)
          values(prescription.id,prescription.patient_id,prescription.medication_id,prescription.status,prescription.prescriber,prescription.wait)
          on conflict(id) do update set patient_id=excluded.patient_id,medication_id=excluded.medication_id,
            status=excluded.status,prescriber=excluded.prescriber,wait=excluded.wait,updated_at=now();
        when 'sales' then
          sale := jsonb_populate_record(null::sales, record_data);
          insert into sales(id,patient,cashier,payment,shift,subtotal,discount,total,items,created_at)
          values(sale.id,sale.patient,sale.cashier,sale.payment,sale.shift,sale.subtotal,sale.discount,sale.total,sale.items,sale.created_at)
          on conflict(id) do nothing;
        else raise exception 'Invalid sync table';
      end case;
    end if;
  end loop;
end;
$$;
grant execute on function public.sync_pos_changes(jsonb,text) to anon, authenticated;
notify pgrst, 'reload schema';
