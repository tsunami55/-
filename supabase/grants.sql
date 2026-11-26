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
