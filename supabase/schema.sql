-- ═══════════════════════════════════════════════════════════════
-- 키즈옥션 데이터베이스 (Supabase SQL Editor에 전체 붙여 넣고 Run)
-- 경매 규칙은 모두 서버 함수에서 처리한다: 동시 입찰 안전, 최대가·최저낙찰가 비공개.
-- ═══════════════════════════════════════════════════════════════

-- ── 테이블 ──────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '고객',
  phone text,
  is_admin boolean not null default false,
  strikes int not null default 0,
  banned_until timestamptz,
  size_alerts int[] not null default '{}',
  address jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brand text not null default '키즈옥션 셀렉',
  category text not null check (category in ('top','bottom','outer','dress','set')),
  size int not null,
  grade text not null check (grade in ('NEW','B_STAIN','B_SEAM','B_ETC')),
  defect_note text,
  color text not null default '#EEEEEE',
  image_url text,
  start_price int not null check (start_price > 0),
  buy_now_price int check (buy_now_price > 0),
  current_price int not null,
  has_reserve boolean not null default false,
  reserve_met boolean not null default true,
  leader_id uuid references public.profiles,
  bid_count int not null default 0,
  bidder_count int not null default 0,
  views int not null default 0,
  ends_at timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING','ACTIVE','SOLD','UNSOLD','REJECTED')),
  seller_id uuid references public.profiles,
  winner_id uuid references public.profiles,
  final_price int,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (grade = 'NEW' or defect_note is not null)
);

-- 비공개 정보: 최저낙찰가, 1등의 최대 입찰가 (관리자만 조회)
create table if not exists public.product_secrets (
  product_id uuid primary key references public.products on delete cascade,
  reserve_price int,
  leader_max int
);

create table if not exists public.bids (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products on delete cascade,
  user_id uuid not null references public.profiles,
  user_label text not null,
  amount int not null,
  auto boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists bids_product_idx on public.bids (product_id, created_at);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products on delete cascade,
  user_id uuid not null references public.profiles,
  amount int not null,
  status text not null default 'UNPAID' check (status in ('UNPAID','PAID','EXPIRED','OFFERED','DECLINED')),
  due_at timestamptz not null,
  paid_at timestamptz,
  shipping_fee int,
  address jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  text text not null,
  href text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── 보안 (RLS): 화면에서는 읽기만, 쓰기는 모두 아래 함수를 통해서만 ──
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_secrets enable row level security;
alter table public.bids enable row level security;
alter table public.orders enable row level security;
alter table public.notices enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists products_read on public.products;
create policy products_read on public.products for select
  using (status in ('ACTIVE','SOLD','UNSOLD') or seller_id = auth.uid() or public.is_admin());
drop policy if exists secrets_read on public.product_secrets;
create policy secrets_read on public.product_secrets for select using (public.is_admin());
drop policy if exists bids_read on public.bids;
create policy bids_read on public.bids for select using (true);
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists notices_read on public.notices;
create policy notices_read on public.notices for select using (user_id = auth.uid());

-- 가입 시 프로필 자동 생성
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name) values (new.id, coalesce(nullif(new.raw_user_meta_data->>'name', ''), '고객'))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 규칙 도우미 ──────────────────────────────────────────────────
create or replace function public.bid_increment(price int) returns int
language sql immutable as $$ select case when price < 10000 then 500 else 1000 end $$;

-- 다음 일괄 마감: 한국 시간 21:30
create or replace function public.next_close_time() returns timestamptz
language sql stable as $$
  select case
    when date_trunc('day', now() at time zone 'Asia/Seoul') + interval '21 hours 30 minutes' > now() at time zone 'Asia/Seoul'
      then (date_trunc('day', now() at time zone 'Asia/Seoul') + interval '21 hours 30 minutes') at time zone 'Asia/Seoul'
    else (date_trunc('day', now() at time zone 'Asia/Seoul') + interval '1 day 21 hours 30 minutes') at time zone 'Asia/Seoul'
  end
$$;

create or replace function public.notify(p_user uuid, p_text text, p_href text default null) returns void
language sql security definer set search_path = public as $$
  insert into notices (user_id, text, href) values (p_user, p_text, p_href)
$$;
revoke execute on function public.notify(uuid, text, text) from public, anon, authenticated;

create or replace function public.refresh_bid_stats(p_product uuid) returns void
language sql security definer set search_path = public as $$
  update products set
    bid_count = (select count(*) from bids where product_id = p_product),
    bidder_count = (select count(distinct user_id) from bids where product_id = p_product)
  where id = p_product
$$;
revoke execute on function public.refresh_bid_stats(uuid) from public, anon, authenticated;

-- ── 입찰 (자동입찰 포함) ─────────────────────────────────────────
create or replace function public.place_bid(p_product uuid, p_max int) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  me profiles;
  p products;
  s product_secrets;
  label text;
  min_next int;
  price int;
  new_leader uuid;
  new_max int;
  last_bid uuid;
  leader_label text;
  msg text;
begin
  if uid is null then return json_build_object('ok', false, 'message', '로그인 후 입찰할 수 있어요.'); end if;
  select * into me from profiles where id = uid;
  if me.banned_until > now() then
    return json_build_object('ok', false, 'message', '미결제 누적으로 ' || to_char(me.banned_until at time zone 'Asia/Seoul', 'MM/DD') || '까지 입찰이 제한되어 있어요.');
  end if;

  select * into p from products where id = p_product for update;
  if not found or p.status <> 'ACTIVE' then return json_build_object('ok', false, 'message', '진행 중인 경매가 아니에요.'); end if;
  if now() >= p.ends_at then return json_build_object('ok', false, 'message', '경매가 마감되었어요.'); end if;
  insert into product_secrets (product_id) values (p.id) on conflict do nothing;
  select * into s from product_secrets where product_id = p.id for update;

  label := left(me.name, 1) || '**';
  price := p.current_price;
  new_leader := p.leader_id;
  new_max := s.leader_max;

  if p.leader_id = uid then
    if p_max <= s.leader_max then return json_build_object('ok', false, 'message', '기존 최대 입찰가보다 높게 설정해 주세요.'); end if;
    new_max := p_max;
    msg := '최대 입찰가를 ' || to_char(p_max, 'FM999,999,999') || '원으로 올렸어요.';
  else
    min_next := case when p.bid_count = 0 then p.start_price else p.current_price + bid_increment(p.current_price) end;
    if p_max < min_next then
      return json_build_object('ok', false, 'message', to_char(min_next, 'FM999,999,999') || '원 이상 입찰해 주세요.');
    end if;

    if p.leader_id is null then
      price := p.start_price;
      insert into bids (product_id, user_id, user_label, amount, auto) values (p.id, uid, label, price, p_max > price) returning id into last_bid;
      new_leader := uid; new_max := p_max;
      msg := '첫 입찰이에요! 현재 1등이에요.';
    elsif p_max > s.leader_max then
      select user_label into leader_label from bids where product_id = p.id and user_id = p.leader_id order by created_at desc limit 1;
      price := least(p_max, s.leader_max + bid_increment(s.leader_max));
      if s.leader_max > p.current_price then
        insert into bids (product_id, user_id, user_label, amount, auto) values (p.id, p.leader_id, leader_label, s.leader_max, true);
      end if;
      insert into bids (product_id, user_id, user_label, amount, auto) values (p.id, uid, label, price, price < p_max) returning id into last_bid;
      perform notify(p.leader_id, '[알림톡] ''' || p.title || ''' 더 높은 입찰이 들어왔어요.', '/auction/' || p.id);
      new_leader := uid; new_max := p_max;
      msg := '현재 1등이에요!';
    else
      select user_label into leader_label from bids where product_id = p.id and user_id = p.leader_id order by created_at desc limit 1;
      price := least(s.leader_max, p_max + bid_increment(p_max));
      insert into bids (product_id, user_id, user_label, amount, auto) values (p.id, uid, label, p_max, false);
      insert into bids (product_id, user_id, user_label, amount, auto) values (p.id, p.leader_id, leader_label, price, true) returning id into last_bid;
      msg := '다른 분이 더 높은 최대가를 설정해 두었어요. 더 높게 입찰해 보세요.';
    end if;
  end if;

  -- 1등의 최대가가 최저낙찰가 이상이면 현재가를 최저낙찰가까지 올린다
  if s.reserve_price is not null and new_max >= s.reserve_price and price < s.reserve_price then
    price := s.reserve_price;
    if last_bid is not null then
      update bids set amount = price where id = last_bid;
    else
      insert into bids (product_id, user_id, user_label, amount, auto) values (p.id, new_leader, label, price, true);
    end if;
  end if;

  update product_secrets set leader_max = new_max where product_id = p.id;
  update products set
    current_price = price,
    leader_id = new_leader,
    reserve_met = (s.reserve_price is null or price >= s.reserve_price),
    ends_at = case when ends_at - now() < interval '2 minutes' then now() + interval '2 minutes' else ends_at end
  where id = p.id;
  perform refresh_bid_stats(p.id);

  if p.ends_at - now() < interval '2 minutes' then msg := msg || ' (마감 직전 입찰로 2분 연장되었어요)'; end if;
  return json_build_object('ok', true, 'message', msg, 'leading', new_leader = uid);
end $$;

-- 내가 1등일 때 내 최대 입찰가
create or replace function public.my_leader_max(p_product uuid) returns int
language sql stable security definer set search_path = public as $$
  select s.leader_max from product_secrets s join products p on p.id = s.product_id
  where s.product_id = p_product and p.leader_id = auth.uid()
$$;

-- ── 즉시구매 ─────────────────────────────────────────────────────
create or replace function public.buy_now(p_product uuid) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me profiles; p products;
begin
  if uid is null then return json_build_object('ok', false, 'message', '로그인 후 구매할 수 있어요.'); end if;
  select * into me from profiles where id = uid;
  if me.banned_until > now() then return json_build_object('ok', false, 'message', '입찰이 제한된 계정이에요.'); end if;
  select * into p from products where id = p_product for update;
  if not found or p.status <> 'ACTIVE' or now() >= p.ends_at or p.buy_now_price is null
     or p.current_price >= p.buy_now_price * 0.8 then
    return json_build_object('ok', false, 'message', '즉시구매할 수 없는 상품이에요.');
  end if;
  update products set status = 'SOLD', winner_id = uid, final_price = p.buy_now_price, closed_at = now() where id = p.id;
  insert into orders (product_id, user_id, amount, due_at) values (p.id, uid, p.buy_now_price, now() + interval '24 hours');
  if p.leader_id is not null and p.leader_id <> uid then
    perform notify(p.leader_id, '[알림톡] ''' || p.title || ''' 상품이 즉시구매로 판매되었어요.');
  end if;
  return json_build_object('ok', true, 'message', '즉시구매 완료! 마이페이지에서 결제해 주세요.');
end $$;

-- ── 마감 정산 (1분마다 자동 실행 + 화면에서도 호출) ─────────────────
create or replace function public.settle_due_auctions() returns int
language plpgsql security definer set search_path = public as $$
declare p products; s product_secrets; n int := 0; final int;
begin
  for p in select * from products where status = 'ACTIVE' and ends_at <= now() for update skip locked loop
    select * into s from product_secrets where product_id = p.id;
    if p.leader_id is not null and (s.reserve_price is null or s.leader_max >= s.reserve_price) then
      final := greatest(p.current_price, coalesce(s.reserve_price, 0));
      update products set status = 'SOLD', winner_id = p.leader_id, final_price = final, closed_at = now() where id = p.id;
      insert into orders (product_id, user_id, amount, due_at) values (p.id, p.leader_id, final, now() + interval '24 hours');
      perform notify(p.leader_id, '[알림톡] ''' || p.title || ''' 낙찰되었어요! 24시간 안에 결제해 주세요.', '/my');
    else
      update products set status = 'UNSOLD', closed_at = now() where id = p.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.increment_view(p_product uuid) returns void
language sql security definer set search_path = public as $$
  update products set views = views + 1 where id = p_product and status = 'ACTIVE'
$$;

-- ── 고객 기능 ────────────────────────────────────────────────────
create or replace function public.update_my_profile(p_name text default null, p_size_alerts int[] default null) returns void
language sql security definer set search_path = public as $$
  update profiles set name = coalesce(nullif(p_name, ''), name), size_alerts = coalesce(p_size_alerts, size_alerts)
  where id = auth.uid()
$$;

create or replace function public.mark_notices_read() returns void
language sql security definer set search_path = public as $$
  update notices set read = true where user_id = auth.uid() and not read
$$;

create or replace function public.respond_offer(p_order uuid, p_accept boolean) returns void
language sql security definer set search_path = public as $$
  update orders set status = case when p_accept then 'UNPAID' else 'DECLINED' end, due_at = now() + interval '24 hours'
  where id = p_order and user_id = auth.uid() and status = 'OFFERED'
$$;

-- ⚠️ 임시 결제 처리. 토스페이먼츠 연동 시 서버에서 결제 승인 확인 후에만 PAID로 바꾸도록 교체해야 함.
create or replace function public.pay_orders(p_orders uuid[], p_address jsonb, p_save boolean) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); subtotal int; fee int; first_id uuid;
begin
  select coalesce(sum(amount), 0), (array_agg(id order by created_at))[1] into subtotal, first_id
  from orders where id = any(p_orders) and user_id = uid and status = 'UNPAID';
  if subtotal = 0 then return json_build_object('ok', false, 'message', '결제할 주문이 없어요.'); end if;
  fee := case when subtotal >= 50000 then 0 else 3500 end;
  update orders set status = 'PAID', paid_at = now(), address = p_address,
    shipping_fee = case when id = first_id then fee else 0 end
  where id = any(p_orders) and user_id = uid and status = 'UNPAID';
  if p_save then update profiles set address = p_address where id = uid; end if;
  return json_build_object('ok', true, 'message', '결제 완료', 'total', subtotal + fee);
end $$;

-- ── 상품 등록 / 관리자 ────────────────────────────────────────────
create or replace function public.submit_product(
  p_title text, p_category text, p_size int, p_grade text, p_defect_note text, p_color text,
  p_start_price int, p_reserve_price int default null, p_buy_now_price int default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  insert into products (title, category, size, grade, defect_note, color, start_price, current_price,
                        buy_now_price, has_reserve, reserve_met, ends_at, status, seller_id, brand)
  values (p_title, p_category, p_size, p_grade, nullif(p_defect_note, ''), coalesce(p_color, '#EEEEEE'), p_start_price, p_start_price,
          p_buy_now_price, p_reserve_price is not null, p_reserve_price is null, next_close_time(),
          case when is_admin() then 'ACTIVE' else 'PENDING' end, auth.uid(),
          case when is_admin() then '키즈옥션 셀렉' else '판매자 등록' end)
  returning id into new_id;
  insert into product_secrets (product_id, reserve_price) values (new_id, p_reserve_price);
  return new_id;
end $$;

create or replace function public.review_product(p_product uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare p products; u record;
begin
  if not is_admin() then raise exception '관리자만 가능해요'; end if;
  update products set status = case when p_approve then 'ACTIVE' else 'REJECTED' end, ends_at = next_close_time()
  where id = p_product and status = 'PENDING' returning * into p;
  if p_approve and p.id is not null then
    for u in select id from profiles where p.size = any(size_alerts) loop
      perform notify(u.id, '[알림톡] 찜한 사이즈 ' || p.size || ' 경매가 열렸어요: ' || p.title, '/auction/' || p.id);
    end loop;
  end if;
end $$;

-- 결제 기한 만료: 1회 경고, 2회째 30일 입찰 제한, 차순위 입찰자에게 낙찰 제안
create or replace function public.expire_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; p products; st int; second record;
begin
  if not is_admin() then raise exception '관리자만 가능해요'; end if;
  update orders set status = 'EXPIRED' where id = p_order and status = 'UNPAID' returning * into o;
  if o.id is null then return; end if;
  select * into p from products where id = o.product_id;
  update profiles set strikes = strikes + 1,
    banned_until = case when strikes + 1 >= 2 then now() + interval '30 days' else banned_until end
  where id = o.user_id returning strikes into st;
  perform notify(o.user_id, case when st >= 2
    then '[알림톡] 미결제가 2회 누적되어 30일간 입찰이 제한돼요.'
    else '[알림톡] 결제 기한이 지나 낙찰이 취소되었어요. 한 번 더 미결제 시 입찰이 제한돼요.' end);
  select user_id, max(amount) as amount into second from bids
  where product_id = p.id and user_id <> o.user_id
    and user_id not in (select user_id from orders where product_id = p.id)
  group by user_id order by max(amount) desc limit 1;
  if second.user_id is not null then
    insert into orders (product_id, user_id, amount, status, due_at)
    values (p.id, second.user_id, second.amount, 'OFFERED', now() + interval '24 hours');
    perform notify(second.user_id, '[알림톡] ''' || p.title || ''' 차순위 낙찰 기회! ' || to_char(second.amount, 'FM999,999,999') || '원에 구매하시겠어요?', '/my');
  end if;
end $$;

-- 테스트용: 진행 중 경매 지금 마감 (p_product 생략 시 전체)
create or replace function public.admin_close_now(p_product uuid default null) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '관리자만 가능해요'; end if;
  update products set ends_at = now() where status = 'ACTIVE' and (p_product is null or id = p_product);
  return settle_due_auctions();
end $$;

-- 관리자가 보는 비공개 정보는 product_secrets 테이블로 조회 (RLS: 관리자만)

-- ── 실시간 반영 / 자동 정산 (Supabase 전용, 다른 환경에선 건너뜀) ──
do $$ begin
  alter publication supabase_realtime add table public.products, public.bids, public.orders, public.notices;
exception when others then raise notice 'realtime 설정 건너뜀: %', sqlerrm; end $$;

do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('settle-auctions', '* * * * *', 'select public.settle_due_auctions()');
exception when others then raise notice 'pg_cron 설정 건너뜀: %', sqlerrm; end $$;

-- ── 초기 상품 (운영자 등록, 입찰 0에서 시작) ─────────────────────────
insert into products (title, category, size, grade, defect_note, color, start_price, current_price, buy_now_price, has_reserve, reserve_met, ends_at, status)
select * from (values
  ('코튼 오버핏 맨투맨', 'top', 110, 'NEW', null, '#E8EEF7', 5000, 5000, 19000, false, true),
  ('기모 조거 팬츠', 'bottom', 120, 'B_SEAM', '왼쪽 주머니 안쪽 박음질 2cm 풀림 (겉에서 안 보임)', '#F3ECE3', 3000, 3000, 12000, false, true),
  ('경량 패딩 점퍼', 'outer', 130, 'NEW', null, '#E6F0EA', 15000, 15000, 49000, true, false),
  ('체크 플리츠 원피스', 'dress', 100, 'B_STAIN', '밑단 안쪽 연한 얼룩 (지름 5mm), 세탁 시 제거 가능성 있음', '#F7E8EC', 4000, 4000, 16000, false, true),
  ('트레이닝 상하 세트', 'set', 140, 'NEW', null, '#ECE9F6', 12000, 12000, 39000, false, true),
  ('데님 와이드 팬츠', 'bottom', 150, 'NEW', null, '#E3EAF2', 8000, 8000, 29000, true, false),
  ('후드 집업', 'outer', 160, 'B_ETC', '지퍼 손잡이 도금 일부 벗겨짐', '#EEF2E4', 6000, 6000, 22000, false, true),
  ('스트라이프 긴팔 티', 'top', 90, 'NEW', null, '#F6F0E2', 2000, 2000, 9000, false, true)
) as v(title, category, size, grade, defect_note, color, start_price, current_price, buy_now_price, has_reserve, reserve_met)
cross join (select next_close_time() as ends_at, 'ACTIVE' as status) c
where not exists (select 1 from products);

insert into product_secrets (product_id, reserve_price)
select id, case title when '경량 패딩 점퍼' then 25000 when '데님 와이드 팬츠' then 15000 end
from products on conflict do nothing;

-- ── 권한 (supabase/grants.sql 과 동일) ──
-- 사이트(anon/로그인 사용자)가 데이터를 읽고 경매 함수를 호출할 수 있도록 권한 부여.
-- 쓰기 권한은 주지 않는다: 모든 변경은 아래 함수를 통해서만 가능하고, 읽기 범위는 RLS가 제한한다.
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.products, public.product_secrets, public.bids, public.orders, public.notices to anon, authenticated;
grant execute on function
  public.is_admin(), public.bid_increment(int), public.next_close_time(),
  public.place_bid(uuid, int), public.my_leader_max(uuid), public.buy_now(uuid),
  public.settle_due_auctions(), public.increment_view(uuid),
  public.update_my_profile(text, int[]), public.mark_notices_read(), public.respond_offer(uuid, boolean),
  public.pay_orders(uuid[], jsonb, boolean),
  public.submit_product(text, text, int, text, text, text, int, int, int),
  public.review_product(uuid, boolean), public.expire_order(uuid), public.admin_close_now(uuid)
to anon, authenticated;
