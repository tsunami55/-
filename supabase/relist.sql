-- 유찰 상품 재경매: 입찰 기록을 지우고 시작가부터 다음 마감(21:30)으로 다시 올린다. (관리자 전용)
create or replace function public.relist_unsold(p_product uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null and not is_admin() then raise exception '관리자만 가능해요'; end if;
  delete from bids where product_id in (select id from products where status = 'UNSOLD' and (p_product is null or id = p_product));
  update product_secrets set leader_max = null
  where product_id in (select id from products where status = 'UNSOLD' and (p_product is null or id = p_product));
  update products set status = 'ACTIVE', ends_at = next_close_time(), closed_at = null,
    current_price = start_price, leader_id = null, bid_count = 0, bidder_count = 0, reserve_met = not has_reserve
  where status = 'UNSOLD' and (p_product is null or id = p_product);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.relist_unsold(uuid) from public, anon;
grant execute on function public.relist_unsold(uuid) to authenticated;
