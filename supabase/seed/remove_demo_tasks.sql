-- Closes the sample tasks. Unused rewards go back to the sample creator's pretend wallet.
-- (Money records can't be deleted: the ledger is insert-only by design.)
do $$
declare r record;
begin
  for r in select t.id from tasks t join users u on u.id = t.creator_id
            where u.phone = '+2340000000000' and t.status in ('live', 'paused', 'filled') loop
    perform close_task(r.id);
  end loop;
end $$;
