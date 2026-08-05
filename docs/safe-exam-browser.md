# Safe Exam Browser operations

The portal uses Safe Exam Browser’s official Config Key integration. For an authorization request, SEB sends `X-SafeExamBrowser-ConfigKeyHash`; the API compares it in constant time with SHA-256 of the requested URL plus each approved hexadecimal Config Key. See the official [Config Key documentation](https://safeexambrowser.org/developer/seb-config-key.html), [server integration guidance](https://safeexambrowser.org/developer/seb-integration.html), and [Browser Exam Key specification](https://safeexambrowser.org/developer/documents/SEB-Specification-BrowserExamKey.pdf).

## Administrator setup

1. Install a currently supported Safe Exam Browser release on managed candidate devices.
2. Create the `.seb` configuration in SEB Config Tool. Set the start URL to the portal’s HTTPS exam page and restrict permitted URLs to the institution portal and only required static/API origins.
3. Store the configuration password outside the repository. Export the Config Key as a 64-character hexadecimal value.
4. Host the `.seb` file on an institution-controlled HTTPS location, enter that URL in the exam builder, enter the Config Key, and require SEB.
5. Disable standard-browser fallback for a strict session. If fallback is enabled for accessibility/incident handling, administrators must approve and review its audit events.
6. Test the exact production URL. The Config Key hash includes the requested URL, so proxy scheme/host forwarding must be correct.

## Exam-day check

- Open the `.seb` link on each supported operating system and verify launch, login, authorization, media, autosave, reconnect, submit, and quit-password behavior.
- Confirm the proxy forwards the original HTTPS scheme and host and that the server’s clock is synchronized.
- Keep a documented fallback decision owner. Do not improvise a universal bypass or publish SEB passwords.

## Limitations

Safe Exam Browser is a separate native application. The portal validates its Config Key but does not generate or sign institution policy files. JavaScript fullscreen/action blocking in a standard browser is defense-in-depth and cannot guarantee kiosk isolation. Accessibility accommodations and device/OS support must be rehearsed before the examination.
