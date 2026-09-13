# NovaPull 1.1.1

## YouTube

- **4K / 8K on clean connections.** YouTube is now parsed signed out first. On a clean exit IP this reaches the full quality ladder — 4320p AV1 HDR, measured. Version 1.1.0 always sent the login cookies, which locked out the very clients that serve 4K/8K and capped YouTube at 1080p.
- **Signed in only when YouTube asks.** If YouTube refuses the first pass with a bot check, the app retries with the cookies from the built-in browser.
- **1080p60 instead of 360p on some accounts.** YouTube forces SABR streaming on the web client for some accounts, which left only a 360p stream. The app now asks the web_safari client as well, which is served HLS up to 1080p60.
- Downloads repeat the mode their parse used, so a format found signed out is also downloaded signed out.

## Other

- The home page title is now simply "视频解析下载" / "Parse and download".

## Note

Datacenter IPs are flagged as bots far more readily. If YouTube stops at 1080p, switching to a cleaner exit node helps more than anything else.
