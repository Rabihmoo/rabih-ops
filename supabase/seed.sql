-- Rabih Ops seed data. Idempotent.

insert into public.branches (code, name, color) values
  ('bbqhouse',       'BBQ House',          '#ea580c'),
  ('salt',           'SALT',               '#2563eb'),
  ('centralkitchen', 'Central Kitchen',    '#16a34a'),
  ('cleaning',       'Executive Cleaning', '#64748b')
on conflict (code) do update
  set name  = excluded.name,
      color = excluded.color;
