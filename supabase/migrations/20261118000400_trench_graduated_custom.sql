-- Trench presets: Graduated Safe (graduated tokens on Uniswap through Rushr) and custom rules
-- (owner 2026-11-17: both open to everyone). A custom agent stores its edited rules in `rules`
-- (parsed and clamped by lib/trench/rules.ts) and is flagged here so pages and Rushr say so.
alter table trench_agents drop constraint trench_agents_preset_check;
alter table trench_agents add constraint trench_agents_preset_check check (preset in ('almost_bonded', 'graduated_safe'));
alter table trench_agents add column custom boolean not null default false;
