-- =============================================
-- TeleTrade Payment Processing RPC
-- secure, atomic payment handling
-- =============================================

create or replace function process_payment_webhook(
  p_invoice_id text,
  p_payment_status text,
  p_actually_paid numeric,
  p_pay_currency text
)
returns json
language plpgsql
security definer -- runs with elevated privileges
as $$
declare
  v_transaction record;
  v_subscriber_id uuid;
  v_client_id uuid;
  v_plan_id uuid;
  v_plan_duration int;
  v_bot_id uuid;
  v_new_sub_end timestamptz;
  v_result json;
begin
  -- 1. Locking: Select transaction for update to prevent race conditions
  select * into v_transaction
  from payment_transactions
  where nowpayments_invoice_id = p_invoice_id
  for update;

  if not found then
    return json_build_object('status', 'error', 'message', 'Transaction not found');
  end if;

  -- 2. Idempotency Check
  if v_transaction.payment_status = 'CONFIRMED' then
    return json_build_object('status', 'success', 'message', 'Already confirmed', 'action', 'none');
  end if;

  -- 3. Partial Payment Check (only if status is claiming to be finished/confirmed)
  if p_payment_status = 'finished' or p_payment_status = 'confirmed' then
    if p_actually_paid < v_transaction.amount then
      -- Update to FAILED or stick to PARTIAL
      update payment_transactions
      set 
        payment_status = 'FAILED', -- or create a specifically PARTIAL status
        updated_at = now()
      where id = v_transaction.id;

      return json_build_object('status', 'error', 'message', 'Partial payment detected', 'expected', v_transaction.amount, 'received', p_actually_paid);
    end if;

    -- Update to CONFIRMED
    update payment_transactions
    set 
      payment_status = 'CONFIRMED',
      confirmed_at = now(),
      updated_at = now()
    where id = v_transaction.id;

    -- 4. Subscription Activation / Extension
    if v_transaction.payment_type = 'SUBSCRIBER_SUBSCRIPTION' then
      v_subscriber_id := v_transaction.subscriber_id;
      v_plan_id := v_transaction.plan_id;

      -- Get plan duration
      select duration_days, bot_id into v_plan_duration, v_bot_id
      from subscription_plans
      where id = v_plan_id;

      -- Calculate new end date
      -- If current sub is active and in future, add to it. Else start from now.
      select 
        case 
          when subscription_status = 'ACTIVE' and subscription_end_date > now() 
          then subscription_end_date + (v_plan_duration || ' days')::interval
          else now() + (v_plan_duration || ' days')::interval
        end
      into v_new_sub_end
      from subscribers
      where id = v_subscriber_id;
      
      -- Fallback if new subscriber
      if v_new_sub_end is null then
         v_new_sub_end := now() + (v_plan_duration || ' days')::interval;
      end if;

      -- Update subscriber
      update subscribers
      set
        subscription_status = 'ACTIVE',
        subscription_start_date = coalesce(subscription_start_date, now()),
        subscription_end_date = v_new_sub_end,
        subscription_plan_id = v_plan_id,
        updated_at = now()
      where id = v_subscriber_id;
      
      -- Log Access Grant (System)
      insert into access_logs (subscriber_id, bot_id, action, performed_by, reason)
      values (v_subscriber_id, v_bot_id, 'GRANT', 'SYSTEM', 'Payment Confirmed');

      return json_build_object('status', 'success', 'action', 'activated_subscriber', 'end_date', v_new_sub_end);

    elsif v_transaction.payment_type = 'PLATFORM_SUBSCRIPTION' then
      -- Client Subscription Logic
      v_client_id := v_transaction.client_id;
      
      -- (Simplified logic for platform sub)
      update clients
      set
        status = 'ACTIVE',
        platform_subscription_end = now() + interval '30 days', -- Simplified, should come from plan
        updated_at = now()
      where id = v_client_id;

      return json_build_object('status', 'success', 'action', 'activated_client');
    end if;

  else
    -- Handle other statuses (confirming, waiting, etc)
    -- Just update the transaction, do not activate
    update payment_transactions
    set 
      payment_status = 
        case 
           when p_payment_status = 'waiting' then 'PENDING'
           when p_payment_status = 'confirming' then 'CONFIRMING'
           when p_payment_status = 'expired' then 'EXPIRED'
           when p_payment_status = 'failed' then 'FAILED'
           else 'PENDING'
        end,
      updated_at = now()
    where id = v_transaction.id;
    
    return json_build_object('status', 'updated', 'new_status', p_payment_status);
  end if;

  return json_build_object('status', 'unknown');
exception
  when others then
    return json_build_object('status', 'error', 'message', SQLERRM);
end;
$$;
