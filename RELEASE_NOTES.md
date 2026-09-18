# NovaPull 1.2.1

## Sign in with email and a one-time code

Signing in no longer uses a password. Enter a mainstream email address (QQ, 163,
Gmail, Outlook and the like), receive a six-digit code, and you are in. The code
expires in ten minutes and is discarded whether it works or not. This replaces
the username-and-password sign-in from 1.2.0.

## Faster, quieter parsing

- Sites read through the page's own player — Douyin among them — resolve their
  quality list noticeably faster than before.
- The hidden window that reads that list is now muted, so parsing no longer
  leaks any sound.

## Easier on the eyes

- The result card now shows the video's cover for page-player sites, instead of
  a broken-image box.
- The whole interface is scaled up a little so the text is easier to read.

## Privacy

Unchanged from 1.2.0: parsing and downloading stay on your computer, the account
server only ever learns your email, the activation code and a random first-run
id — no hardware fingerprint and nothing about what you download. An activated
app keeps working for up to 14 days without reaching the server.
