# NovaPull 1.2.0

## Accounts and device activation

This release introduces a sign-in and an activation code, and with them a daily
limit for devices that have not been activated.

- **Three downloads a day without a code.** Everything else is unchanged: the
  same sites, the same quality, no watermark, no nagging. The count is per task,
  so retrying a download that failed halfway does not cost a second slot.
- **An activation code lifts the limit** on the device that redeems it. One code
  activates one device, and redeeming the same code again on that same device
  does not consume anything — reinstalling Windows will not cost you your code.
- **Plans.** Codes are issued for 3 days, a month, a quarter, half a year, a
  year, or permanently. A plan starts when the code is redeemed, not when it was
  issued, so a code kept in a drawer loses nothing.
- **Sign in with a username.** The account exists only to record which account
  activated which device. No email, no phone number, nothing to verify.

## Privacy

Activating contacts the account server once, and an activated app re-checks with
it on start. What the server learns is the account name, the code and a random
id generated on first run — not a hardware fingerprint, nothing about the
machine, and nothing about what is being downloaded. Parsing and downloading
stay entirely on your computer, as before.

An activated app keeps working for up to 14 days without reaching the server, so
a bad connection does not interrupt anything.

## For people upgrading from 1.1.1

Unlimited downloading now needs a code. If you were using 1.1.1, the free three a
day is a change — the [README](https://github.com/drush012/novapull#readme)
explains where codes come from.

## Fixes

- Activation state is now a signed credential the app verifies, not a flag in a
  file, so a copied or hand-edited configuration is no longer taken at face
  value.
- The free daily count resets on your own calendar day rather than in UTC.
